import dotenv from 'dotenv'
dotenv.config()

function require_env(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export const env = {
  // Main databases (users + data)
  DB_HOST: require_env('DB_HOST'),
  DB_PORT: parseInt(require_env('DB_PORT'), 10),
  DB_USER: require_env('DB_USER'),
  DB_PASSWORD: require_env('DB_PASSWORD'),
  DB_USERS: require_env('DB_USERS'),
  DB_DATA: require_env('DB_DATA'),

  // Log store driver + PostgreSQL log DB config
  LOG_STORE_DRIVER: process.env['LOG_STORE_DRIVER'] ?? 'postgresql',
  LOG_PG_HOST:     process.env['LOG_PG_HOST']     ?? process.env['DB_HOST']     ?? 'localhost',
  LOG_PG_PORT:     parseInt(process.env['LOG_PG_PORT'] ?? process.env['DB_PORT'] ?? '5432', 10),
  LOG_PG_USER:     process.env['LOG_PG_USER']     ?? process.env['DB_USER']     ?? '',
  LOG_PG_PASSWORD: process.env['LOG_PG_PASSWORD'] ?? process.env['DB_PASSWORD'] ?? '',
  LOG_PG_DB:       process.env['LOG_PG_DB']       ?? process.env['DB_LOGS']     ?? 'ai_gateway_logs',

  JWT_SECRET: require_env('JWT_SECRET'),
  JWT_ACCESS_EXPIRES: process.env['JWT_ACCESS_EXPIRES'] ?? '15m',
  JWT_REFRESH_EXPIRES: process.env['JWT_REFRESH_EXPIRES'] ?? '7d',
  PORT: parseInt(process.env['PORT'] ?? '3000', 10),
  NODE_ENV: process.env['NODE_ENV'] ?? 'production',

  // SMTP config (optional — used for OTP)
  SMTP_HOST:     process.env['SMTP_HOST'] ?? '',
  SMTP_PORT:     process.env['SMTP_PORT'] ?? '587',
  SMTP_USER:     process.env['SMTP_USER'] ?? '',
  SMTP_PASS:     process.env['SMTP_PASS'] ?? '',
  SMTP_FROM:     process.env['SMTP_FROM'] ?? 'noreply@localhost',

  GATEWAY_API_KEY_GRACE_PERIOD: parseInt(process.env['GATEWAY_API_KEY_GRACE_PERIOD'] ?? '86400', 10),
  TRUSTED_PROXY_DEPTH: parseInt(process.env['TRUSTED_PROXY_DEPTH'] ?? '0', 10),
  TRUSTED_PROXY_CIDR: (() => {
    const raw = process.env['TRUSTED_PROXY_CIDR'] ?? ''
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [] as string[]
  })(),

  // Single encryption-at-rest secret (AES-256-GCM) for all encrypted values:
  // gateway control keys, app API keys, provider API keys, admin keys, notification credentials
  PLATFORM_KEY_SECRET: require_env('PLATFORM_KEY_SECRET'),

  // Opt-in: hard-fail boot if PLATFORM_KEY_SECRET is too short (< 32 chars).
  // Defaults to false — existing deployments with a short-but-set secret continue
  // to work, with a prominent warning logged at startup.
  REQUIRE_STRONG_SECRETS: process.env['REQUIRE_STRONG_SECRETS'] === 'true',

  // CORS origins (comma-separated in env, parsed into array)
  CORS_ORIGIN: (() => {
    const raw = process.env['CORS_ORIGIN']
    if (!raw) {
      if (process.env['NODE_ENV'] === 'production') {
        throw new Error('CORS_ORIGIN must be set in production')
      }
      return ['http://localhost:3634', 'http://localhost:5173', 'http://localhost:3000']
    }
    return raw.split(',').map(s => s.trim())
  })(),

  // Admin seed credentials (optional — if unset, auto-seed skips admin creation)
  ADMIN_USERNAME: process.env['ADMIN_USERNAME'] ?? '',
  ADMIN_EMAIL:    process.env['ADMIN_EMAIL']    ?? '',
  ADMIN_PASSWORD: process.env['ADMIN_PASSWORD'] ?? '',
}

// ── Secret-strength warning ─────────────────────────────────────────────────

const secretLen = env.PLATFORM_KEY_SECRET.length
if (secretLen < 32) {
  const msg = `PLATFORM_KEY_SECRET is only ${secretLen} chars (≥32 recommended). A short secret is easier to brute-force.`
  if (env.REQUIRE_STRONG_SECRETS || env.NODE_ENV === 'production') {
    throw new Error(msg)
  }
  console.warn(`\x1b[33m⚠\x1b[0m ${msg}`)
}

// ── JWT secret strength check ───────────────────────────────────────────────

const jwtLen = env.JWT_SECRET.length
if (jwtLen < 32) {
  const msg = `JWT_SECRET is only ${jwtLen} chars (≥32 recommended). A short secret is easier to brute-force.`
  if (env.REQUIRE_STRONG_SECRETS || env.NODE_ENV === 'production') {
    throw new Error(msg)
  }
  console.warn(`\x1b[33m⚠\x1b[0m ${msg}`)
}