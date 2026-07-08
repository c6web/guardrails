export interface JwtPayload {
  userId: string
  username: string
  groupId: string | null
  email: string
  otp_pending?: boolean
  otp_type?: string
  iat: number
  exp: number
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}
