export function shade(hex: string, amt: number): string {
  const m = hex.replace("#", "")
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  const f = (v: number) => {
    const nv = amt > 0 ? v + (255 - v) * amt : v + v * amt
    return Math.max(0, Math.min(255, Math.round(nv)))
  }
  const hh = (v: number) => v.toString(16).padStart(2, "0")
  return `#${hh(f(r))}${hh(f(g))}${hh(f(b))}`
}
