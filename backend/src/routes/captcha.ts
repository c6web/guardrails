import type { Request, Response } from 'express'
import { Router } from 'express'
import { generateCaptcha } from '../utils/captcha'

const router = Router()

router.get('/challenge', (_req: Request, res: Response) => {
  const { question, token } = generateCaptcha()
  res.json({ data: { question, token } })
})

export default router
