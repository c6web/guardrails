export function getTzLabel(): string {
  try {
    const d = new Date()
    const parts = Intl.DateTimeFormat().resolvedOptions()
    const tz = parts.timeZone || 'UTC'
    const formatter = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
    const str = formatter.format(d)
    const match = str.match(/([A-Z]{2,5})\s*(?:[+-]\d{4})?$/)
    return match?.[1] || tz.split('/').pop()?.toUpperCase() || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function formatLocalClock(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}

export function fmtTs(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

export function fmtDateTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${y}-${mo}-${da} ${hh}:${mm}`
}

export function fmtDateTimeStr(val: string | Date | number | null | undefined): string {
  if (!val || val === '—') return '—'
  let d: Date
  if (val instanceof Date) {
    d = val
  } else if (typeof val === 'number') {
    d = new Date(val)
  } else {
    const s = typeof val === 'string' ? val : String(val)
    d = new Date(s)
  }
  if (isNaN(d.getTime())) return '—'
  try {
    const formatter = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    const parts = formatter.formatToParts(d)
    const mapping: Record<string, string> = {}
    for (const p of parts) {
      if (p.type) mapping[p.type] = p.value
    }
    const y = mapping.year || ''
    const mo = mapping.month || ''
    const da = mapping.day || ''
    const hh = mapping.hour || ''
    const mm = mapping.minute || ''
    const ss = mapping.second || ''
    return `${y}-${mo}-${da} ${hh}:${mm}:${ss}`
  } catch {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
  }
}

export function fmtTsStr(iso: string): string {
  if (!iso || iso === '—') return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  try {
    const formatter = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    return formatter.format(d)
  } catch {
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    const ss = String(d.getSeconds()).padStart(2, "0")
    return `${d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: '2-digit' })} ${hh}:${mm}:${ss}`
  }
}

export function fmtAge(secs: number): string {
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

export function fmtAgeFromIso(iso: string | Date | number | null | undefined): string {
  if (!iso) return '—'
  let d: Date
  if (typeof iso === 'string') {
    d = new Date(iso)
  } else if (iso instanceof Date) {
    d = iso
  } else {
    d = new Date(iso)
  }
  if (isNaN(d.getTime())) return '—'
  const ms = Date.now() - d.getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days > 365 * 10) return '—'
  return `${days}d ago`
}

export function fmtAgeFromTs(ts: number): string {
  if (ts === null || ts === undefined) return '—'
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const ms = Date.now() - n
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days > 365 * 10) return '—'
  return `${days}d ago`
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
  } else {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}
