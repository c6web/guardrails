use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

struct WindowState {
    count:        u32,
    window_start: Instant,
    last_access:  Instant,
}

/// Per-app sliding-window rate limiter.
///
/// Concurrency guarantee: requests from different apps never block each other.
/// - The outer RwLock is almost always read-locked (concurrent across all apps).
/// - A write lock is taken only once per app, on the first request, to insert
///   the per-app entry. After that every check is a read + per-app Mutex.
/// - The per-app Mutex is held for nanoseconds (arithmetic only, no I/O).
#[derive(Clone)]
pub(crate) struct RateLimiter {
    windows:         Arc<RwLock<HashMap<String, Arc<Mutex<WindowState>>>>>,
    window_duration: Duration,
    max_per_window:  u32,
}

pub(crate) enum RateLimitResult {
    Allowed { remaining: u32 },
    Limited { retry_after_secs: u64 },
}

impl RateLimiter {
    pub fn new(max_per_window: u32, window_secs: u64) -> Self {
        RateLimiter {
            windows:         Arc::new(RwLock::new(HashMap::new())),
            window_duration: Duration::from_secs(window_secs),
            max_per_window,
        }
    }

    pub fn from_env() -> Self {
        let rpm: u32 = std::env::var("RATE_LIMIT_RPM")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(120);
        tracing::info!("[rate_limiter] per-app limit: {} requests / 60s", rpm);
        Self::new(rpm, 60)
    }

    /// Check and count one request for `app_key`.
    /// Returns Allowed with remaining capacity, or Limited with retry-after seconds.
    /// Never blocks between different app keys.
    pub fn check(&self, app_key: &str) -> RateLimitResult {
        // Fast path: entry already exists — read lock only (fully concurrent)
        {
            let map = self.windows.read().unwrap_or_else(|p| p.into_inner());
            if let Some(entry) = map.get(app_key) {
                return self.try_increment_keyed(entry, app_key);
            }
        }

        // Slow path: first request for this app — take write lock to insert
        let mut map = self.windows.write().unwrap_or_else(|p| p.into_inner());
        let now = Instant::now();
        let entry = map
            .entry(app_key.to_string())
            .or_insert_with(|| {
                Arc::new(Mutex::new(WindowState {
                    count:        0,
                    window_start: now,
                    last_access:  now,
                }))
            })
            .clone();
        drop(map); // release write lock before acquiring per-app mutex
        self.try_increment_keyed(&entry, app_key)
    }

    fn try_increment_keyed(&self, entry: &Arc<Mutex<WindowState>>, _app_key: &str) -> RateLimitResult {
        let mut state = entry.lock().unwrap_or_else(|p| p.into_inner());
        let now    = Instant::now();
        state.last_access = now;
        let elapsed = now.duration_since(state.window_start);

        if elapsed >= self.window_duration {
            // New window — reset
            state.window_start = now;
            state.count        = 1;
            return RateLimitResult::Allowed { remaining: self.max_per_window - 1 };
        }

        if state.count >= self.max_per_window {
            let retry_after = (self.window_duration - elapsed).as_secs().max(1);
            return RateLimitResult::Limited { retry_after_secs: retry_after };
        }

        state.count += 1;
        RateLimitResult::Allowed { remaining: self.max_per_window - state.count }
    }

    /// Remove entries that haven't been accessed in over 1 hour.
    pub fn cleanup_stale(&self) {
        let cutoff = Instant::now() - Duration::from_secs(3600);
        let mut map = self.windows.write().unwrap_or_else(|p| p.into_inner());
        map.retain(|_, entry| {
            if let Ok(state) = entry.lock() {
                state.last_access > cutoff
            } else {
                false
            }
        });
    }

    /// Spawn a background task that purges stale entries every hour.
    pub fn spawn_cleanup_task(self) {
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(3600)).await;
                self.cleanup_stale();
            }
        });
    }
}

/// Simple global rate limiter for /reload endpoint
/// Allows max 3 reloads per 60 seconds
#[derive(Clone)]
pub(crate) struct ReloadRateLimiter {
    state: Arc<Mutex<WindowState>>,
    max_per_window: u32,
    window_duration: Duration,
}

impl ReloadRateLimiter {
    pub fn new() -> Self {
        let now = Instant::now();
        ReloadRateLimiter {
            state: Arc::new(Mutex::new(WindowState {
                count: 0,
                window_start: now,
                last_access: now,
            })),
            max_per_window: 3,
            window_duration: Duration::from_secs(60),
        }
    }

    pub fn check(&self) -> RateLimitResult {
        let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        let now = Instant::now();
        state.last_access = now;
        let elapsed = now.duration_since(state.window_start);

        if elapsed >= self.window_duration {
            // New window — reset
            state.window_start = now;
            state.count = 1;
            return RateLimitResult::Allowed { remaining: self.max_per_window - 1 };
        }

        if state.count >= self.max_per_window {
            let retry_after = (self.window_duration - elapsed).as_secs().max(1);
            return RateLimitResult::Limited { retry_after_secs: retry_after };
        }

        state.count += 1;
        RateLimitResult::Allowed { remaining: self.max_per_window - state.count }
    }
}
