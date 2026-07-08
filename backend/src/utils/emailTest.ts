import nodemailer from 'nodemailer'
import { resolve4, resolve6 } from 'dns/promises'
import { isPrivateIp } from './validateEndpoint'

export interface EmailTestResult {
  success: boolean
  message_id?: string
  error?: string
}

interface SmtpConfig {
  host: string
  port: number
  tls: boolean
  username?: string
  password?: string
  from_address: string
  from_name?: string
}

async function validateSmtpHost(host: string): Promise<void> {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    throw new Error('Localhost SMTP hosts are not allowed')
  }

  const addresses: string[] = []
  try { addresses.push(...await resolve4(host)) } catch {}
  try { addresses.push(...await resolve6(host)) } catch {}

  if (addresses.length === 0) {
    throw new Error(`Could not resolve SMTP host: ${host}`)
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error(`SMTP host resolves to a private IP (${addr}) which is not allowed`)
    }
  }
}

async function testSmtpServer(
  config: Record<string, unknown>,
  recipient: string,
): Promise<EmailTestResult> {
  const c = config as unknown as SmtpConfig
  if (!c.host || !c.port || !c.from_address) {
    return { success: false, error: 'Missing required SMTP config: host, port, or from_address' }
  }
  try {
    // Validate SMTP host against SSRF first
    try {
      await validateSmtpHost(c.host)
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }

    const transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.port === 465,
      requireTLS: c.tls && c.port !== 465,
      auth: c.username ? { user: c.username, pass: c.password ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout:   5_000,
    })
    const info = await transporter.sendMail({
      from: c.from_name ? `"${c.from_name}" <${c.from_address}>` : c.from_address,
      to: recipient,
      subject: 'AI Firewall Gateway — test notification',
      text: 'This is a test message from AI Firewall Gateway to verify your email notification server is configured correctly.',
      html: '<p>This is a test message from <strong>AI Firewall Gateway</strong> to verify your email notification server is configured correctly.</p>',
    })
    return { success: true, message_id: info.messageId }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

// Dispatcher — add new providers here without touching the route handler
export async function testNotificationServer(
  type: string,
  config: Record<string, unknown>,
  recipient: string,
): Promise<EmailTestResult> {
  if (type === 'smtp') return testSmtpServer(config, recipient)
  return { success: false, error: `Unsupported server type: ${type}` }
}
