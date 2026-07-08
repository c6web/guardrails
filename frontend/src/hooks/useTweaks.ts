import { useState, useCallback, useEffect } from 'react'
import type { TweakValues } from '../types'

const STORAGE_KEY = 'ai_firewall_tweaks'

function loadFromStorage(defaults: TweakValues): TweakValues {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TweakValues>
      return { ...defaults, ...parsed } as TweakValues
    }
  } catch {
    /* ignore corrupt data */
  }
  return defaults
}

// Detect browser's preferred color scheme and save to localStorage if not set
function detectBrowserTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TweakValues>
      if (parsed.theme === 'light' || parsed.theme === 'dark') return parsed.theme
    }
  } catch {
    /* ignore */
  }
  // No saved preference — detect from browser
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const initialScheme = mq.matches ? 'dark' : 'light'

  // Save detected preference to localStorage
  try {
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
    })() as Partial<TweakValues>
    if (!existing.theme) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, theme: initialScheme }))
    }
  } catch {
    /* ignore */
  }

  // Listen for changes so future browser switch is reflected
  function onMediaChange(e: MediaQueryListEvent) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<TweakValues>
        const newTheme = e.matches ? 'dark' : 'light'
        // Only update if user hasn't explicitly set a theme yet
        if (!parsed.theme) {
          parsed.theme = newTheme
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
          document.documentElement.dataset.theme = newTheme
        }
      } else {
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'
      }
    } catch {
      /* ignore */
    }
  }
  mq.addEventListener('change', onMediaChange)

  return initialScheme
}

// Apply theme to <html> before React renders to prevent flash of wrong theme
function applyBootTheme(theme: 'light' | 'dark'): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TweakValues>
      const savedTheme = parsed.theme
      if (savedTheme === 'light' || savedTheme === 'dark') {
        document.documentElement.dataset.theme = savedTheme
        return
      }
    }
  } catch {
    /* ignore */
  }
  document.documentElement.dataset.theme = theme
}

export function useTweaks(defaults: TweakValues): [TweakValues, <K extends keyof TweakValues>(key: K, value: TweakValues[K]) => void] {
  // Apply boot-time theme immediately (before React effects run)
  applyBootTheme(defaults.theme)

  // Detect browser preference and save to localStorage if not already set
  detectBrowserTheme()

  const [values, setValues] = useState<TweakValues>(() => loadFromStorage(defaults))

  // Sync theme to <html> on every tweak change
  useEffect(() => {
    document.documentElement.dataset.theme = values.theme
  }, [values.theme])

  // Persist to localStorage whenever values change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
    } catch {
      /* quota or storage unavailable */
    }
  }, [values])

  const setTweak = useCallback(<K extends keyof TweakValues>(key: K, value: TweakValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }, [])
  return [values, setTweak]
}
