export interface QuotaInput {
  quota_mode?: 'unlimited' | 'fixed' | 'monthly'
  quota_limit?: number | null
  quota_warning_limit?: number | null
  quota_enforcement?: 'hard' | 'soft'
  quota_reset_day?: number | null
}

export interface QuotaFields {
  quota_mode: 'unlimited' | 'fixed' | 'monthly'
  quota_limit: number | null
  quota_warning_limit: number | null
  quota_enforcement: 'hard' | 'soft'
  quota_reset_day: number | null
}

/**
 * Validate and normalize per-app quota settings. Returns either an error string
 * or the normalized fields to persist. `current` supplies defaults on PATCH so
 * partial updates are validated against the resulting state.
 */
export function resolveQuota(body: QuotaInput, current?: QuotaFields): { error: string } | { fields: QuotaFields } {
  const mode = body.quota_mode ?? current?.quota_mode ?? 'unlimited'
  if (!['unlimited', 'fixed', 'monthly'].includes(mode)) {
    return { error: 'quota_mode must be unlimited, fixed, or monthly' }
  }

  if (mode === 'unlimited') {
    return { fields: { quota_mode: 'unlimited', quota_limit: null, quota_warning_limit: null, quota_enforcement: 'hard', quota_reset_day: null } }
  }

  const limit = body.quota_limit !== undefined ? body.quota_limit : current?.quota_limit ?? null
  if (limit === null || !Number.isInteger(limit) || limit <= 0) {
    return { error: 'quota_limit must be a positive integer when a quota is enabled' }
  }

  const warning = body.quota_warning_limit !== undefined ? body.quota_warning_limit : current?.quota_warning_limit ?? null
  if (warning !== null) {
    if (!Number.isInteger(warning) || warning <= 0) return { error: 'quota_warning_limit must be a positive integer' }
    if (warning >= limit) return { error: 'quota_warning_limit must be less than quota_limit' }
  }

  const enforcement = body.quota_enforcement ?? current?.quota_enforcement ?? 'hard'
  if (!['hard', 'soft'].includes(enforcement)) {
    return { error: 'quota_enforcement must be hard or soft' }
  }

  let resetDay = body.quota_reset_day !== undefined ? body.quota_reset_day : current?.quota_reset_day ?? null
  if (mode === 'monthly') {
    if (resetDay === null || !Number.isInteger(resetDay) || resetDay < 1 || resetDay > 28) {
      return { error: 'quota_reset_day must be an integer between 1 and 28 for monthly quotas' }
    }
  } else {
    resetDay = null
  }

  return { fields: { quota_mode: mode, quota_limit: limit, quota_warning_limit: warning, quota_enforcement: enforcement, quota_reset_day: resetDay } }
}
