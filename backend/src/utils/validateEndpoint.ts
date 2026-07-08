import { resolve4, resolve6 } from 'dns/promises'
import { URL } from 'url'

const PRIVATE_RANGES_V4 = [
  { start: ipToInt('10.0.0.0'), end: ipToInt('10.255.255.255') },
  { start: ipToInt('172.16.0.0'), end: ipToInt('172.31.255.255') },
  { start: ipToInt('192.168.0.0'), end: ipToInt('192.168.255.255') },
]

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function isPrivateIpV4(ip: string): boolean {
  const int = ipToInt(ip)
  if ((int >>> 24) === 127) return true
  if ((int >>> 16) === 0xA9FE) return true
  for (const range of PRIVATE_RANGES_V4) {
    if (int >= range.start && int <= range.end) return true
  }
  return false
}

function isPrivateIpV6(ip: string): boolean {
  const lower = ip.toLowerCase()
  // Loopback ::1
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true
  // ULA fc00::/7
  if (/^f[cd][0-9a-f]{0,2}:/.test(lower)) return true
  // Link-local fe80::/10
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true
  return false
}

export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) return isPrivateIpV6(ip)
  return isPrivateIpV4(ip)
}

/**
 * Simple IPv4 CIDR matcher — checks whether `ip` falls within `cidr` (e.g. "10.0.0.0/8").
 */
function ipInCidr(ip: string, cidr: string): boolean {
  const [rangeStr, bitsStr] = cidr.split('/')
  const bits = parseInt(bitsStr ?? '32', 10)
  if (isNaN(bits) || bits < 0 || bits > 32) return false
  const ipInt = ipToInt(ip)
  const rangeInt = ipToInt(rangeStr)
  const mask = bits === 0 ? 0 : ~0 << (32 - bits)
  return (ipInt & mask) === (rangeInt & mask)
}

/**
 * Check whether the given remote address comes from a trusted proxy (matches any CIDR in the list).
 */
export function isTrustedProxy(addr: string | undefined, trustedCidrs: string[]): boolean {
  if (!addr) return false
  const cleaned = addr.replace(/^::ffff:/, '') // strip IPv6 prefix for IPv4-mapped addresses
  return trustedCidrs.some(cidr => ipInCidr(cleaned, cidr))
}

export interface EndpointInfo {
  url: string
  hostname: string
  protocol: string
  addresses: string[]
}

async function resolveAll(hostname: string): Promise<string[]> {
  // If the hostname is already a valid IP, return it directly (no DNS needed).
  const ipMatch = hostname.replace(/^\[(.+)\]$/, '$1')
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ipMatch) || /^[0-9a-f:]+$/i.test(ipMatch)) {
    return [ipMatch]
  }

  const results: string[] = []
  const errors: Error[] = []

  try {
    const v4 = await resolve4(hostname)
    results.push(...v4)
  } catch (e) { errors.push(e as Error) }

  try {
    const v6 = await resolve6(hostname)
    results.push(...v6)
  } catch {}

  if (results.length === 0) {
    const msg = errors[0]?.message ?? 'DNS resolution failed'
    throw new Error(`Could not resolve endpoint hostname (${hostname}): ${msg}`)
  }

  return results
}

const INSECURE_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]'])

function isPrivateAllowed(): boolean {
  const v = process.env['SSRF_PRIVATE_ALLOWED']
  return v === '1' || v === 'true'
}

export async function validateEndpoint(urlStr: string): Promise<EndpointInfo> {
  const parsed = new URL(urlStr)

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https endpoints are allowed')
  }

  const hostname = parsed.hostname

  if (INSECURE_HOSTNAMES.has(hostname)) {
    throw new Error('Localhost endpoints are not allowed')
  }

  const addresses = await resolveAll(hostname)

  if (!isPrivateAllowed()) {
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new Error(`Endpoint resolves to a private IP (${addr}) which is not allowed`)
      }
    }
  }

  return { url: urlStr, hostname, protocol: parsed.protocol, addresses }
}

/**
 * For HTTP endpoints, construct a pinned URL using the first resolved IP
 * and set the original hostname as the Host header.
 * For HTTPS endpoints, return the original URL (TLS cert validation protects against rebinding).
 */
export function buildPinnedUrl(info: EndpointInfo): { url: string; headers: Record<string, string> } {
  if (info.protocol === 'https:') {
    return { url: info.url, headers: {} }
  }

  const addr = info.addresses[0]
  const original = new URL(info.url)
  // For IPv6 addresses, wrap in brackets for URL
  const ipSegment = addr.includes(':') ? `[${addr}]` : addr
  let pinnedUrl = `${original.protocol}//${ipSegment}`
  if (original.port) pinnedUrl += `:${original.port}`
  pinnedUrl += original.pathname + original.search

  return { url: pinnedUrl, headers: { Host: original.hostname } }
}
