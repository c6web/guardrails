import crypto from 'crypto'

const OP_SYMBOLS = ['+', '-', '\u00D7'] as const

interface CaptchaPayload {
  a: number
  b: number
  op: string
  exp: number
}

function getSecret(): string {
  return process.env.CAPTCHA_SECRET || process.env.JWT_SECRET || 'dev-captcha-secret-do-not-use-in-prod'
}

export function generateCaptcha(): { question: string; token: string } {
  const a = Math.floor(Math.random() * 10) + 1
  const b = Math.floor(Math.random() * 10) + 1
  const opIdx = Math.floor(Math.random() * OP_SYMBOLS.length)
  const op = OP_SYMBOLS[opIdx]
  const exp = Math.floor(Date.now() / 1000) + 300

  const payload: CaptchaPayload = { a, b, op, exp }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url')

  return {
    question: `What is ${a} ${op} ${b}?`,
    token: `${encoded}.${sig}`,
  }
}

export function verifyCaptcha(token: string, answer: number): boolean {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return false
  const encoded = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expectedSig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false

  let payload: CaptchaPayload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  } catch {
    return false
  }

  if (Math.floor(Date.now() / 1000) > payload.exp) return false

  const expectedAnswer = payload.op === '+' ? payload.a + payload.b
    : payload.op === '-' ? payload.a - payload.b
    : payload.a * payload.b

  return expectedAnswer === answer
}
