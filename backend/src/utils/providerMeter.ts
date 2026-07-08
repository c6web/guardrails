interface MeterInput {
  meter_mode?: 'unlimited' | 'monthly'
  meter_metric?: 'requests' | 'tokens' | 'cost'
  meter_limit?: number | null
  meter_warning_limit?: number | null
  meter_enforcement?: 'hard' | 'soft'
  meter_reset_day?: number | null
  price_per_1m_input?: number | null
  price_per_1m_output?: number | null
}

interface MeterFields {
  meter_mode: 'unlimited' | 'monthly'
  meter_metric: 'requests' | 'tokens' | 'cost'
  meter_limit: number | null
  meter_warning_limit: number | null
  meter_enforcement: 'hard' | 'soft'
  meter_reset_day: number | null
  price_per_1m_input: number | null
  price_per_1m_output: number | null
}

export function resolveMeter(
  body: MeterInput,
  current?: MeterFields
): { error: string } | { fields: MeterFields } {
  const mode = body.meter_mode ?? current?.meter_mode ?? 'unlimited'
  if (!['unlimited', 'monthly'].includes(mode)) {
    return { error: 'meter_mode must be unlimited or monthly' }
  }

  if (mode === 'unlimited') {
    return {
      fields: {
        meter_mode: 'unlimited',
        meter_metric: current?.meter_metric ?? 'requests',
        meter_limit: null,
        meter_warning_limit: null,
        meter_enforcement: current?.meter_enforcement ?? 'soft',
        meter_reset_day: null,
        price_per_1m_input: body.price_per_1m_input !== undefined ? (body.price_per_1m_input ?? null) : (current?.price_per_1m_input ?? null),
        price_per_1m_output: body.price_per_1m_output !== undefined ? (body.price_per_1m_output ?? null) : (current?.price_per_1m_output ?? null),
      },
    }
  }

  // monthly mode
  const metric = body.meter_metric ?? current?.meter_metric ?? 'requests'
  if (!['requests', 'tokens', 'cost'].includes(metric)) {
    return { error: 'meter_metric must be requests, tokens, or cost' }
  }

  const limit = body.meter_limit !== undefined ? body.meter_limit : (current?.meter_limit ?? null)
  if (limit === null || typeof limit !== 'number' || limit <= 0) {
    return { error: 'meter_limit must be a positive number when metering is enabled' }
  }

  const warning = body.meter_warning_limit !== undefined
    ? body.meter_warning_limit
    : (current?.meter_warning_limit ?? null)
  if (warning !== null) {
    if (typeof warning !== 'number' || warning <= 0) {
      return { error: 'meter_warning_limit must be a positive number' }
    }
    if (warning >= limit) {
      return { error: 'meter_warning_limit must be less than meter_limit' }
    }
  }

  const enforcement = body.meter_enforcement ?? current?.meter_enforcement ?? 'soft'
  if (!['hard', 'soft'].includes(enforcement)) {
    return { error: 'meter_enforcement must be hard or soft' }
  }

  const resetDay = body.meter_reset_day !== undefined ? body.meter_reset_day : (current?.meter_reset_day ?? null)
  if (resetDay === null || !Number.isInteger(resetDay) || resetDay < 1 || resetDay > 28) {
    return { error: 'meter_reset_day must be an integer between 1 and 28 for monthly metering' }
  }

  const priceIn  = body.price_per_1m_input  !== undefined ? body.price_per_1m_input  : (current?.price_per_1m_input  ?? null)
  const priceOut = body.price_per_1m_output !== undefined ? body.price_per_1m_output : (current?.price_per_1m_output ?? null)
  if (priceIn !== null && (typeof priceIn !== 'number' || priceIn < 0)) {
    return { error: 'price_per_1m_input must be a non-negative number' }
  }
  if (priceOut !== null && (typeof priceOut !== 'number' || priceOut < 0)) {
    return { error: 'price_per_1m_output must be a non-negative number' }
  }

  return {
    fields: {
      meter_mode: 'monthly',
      meter_metric: metric,
      meter_limit: limit,
      meter_warning_limit: warning,
      meter_enforcement: enforcement,
      meter_reset_day: resetDay,
      price_per_1m_input: priceIn,
      price_per_1m_output: priceOut,
    },
  }
}

/**
 * Compute the start of the current monthly meter period for a provider.
 * Mirrors the gateway's window computation so console and enforcement agree.
 */
export function meterPeriodStart(
  resetDay: number,
  periodStartOverride: Date | null | undefined,
  now: Date
): Date {
  const day = Math.min(Math.max(Math.floor(resetDay), 1), 28)
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  let boundaryMs = Date.UTC(y, m, day, 0, 0, 0)
  if (now.getTime() < boundaryMs) {
    const pm = m - 1
    const py = pm < 0 ? y - 1 : y
    const pm2 = pm < 0 ? 11 : pm
    boundaryMs = Date.UTC(py, pm2, day, 0, 0, 0)
  }
  const boundary = new Date(boundaryMs)
  if (periodStartOverride && periodStartOverride.getTime() > boundary.getTime()) {
    return periodStartOverride
  }
  return boundary
}

export function meterPeriodEnd(resetDay: number, start: Date): Date {
  const day = Math.min(Math.max(Math.floor(resetDay), 1), 28)
  let em = start.getUTCMonth() + 1
  let ey = start.getUTCFullYear()
  if (em > 11) { em = 0; ey++ }
  return new Date(Date.UTC(ey, em, day, 0, 0, 0))
}
