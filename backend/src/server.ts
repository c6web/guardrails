import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import { env } from './config/env'
import { requestLogger } from './middleware/requestLogger'
import { createApiRouter } from './routes'
import type { ILogStore } from './logs/ILogStore'

export function createApp(logStore: ILogStore): express.Application {
  const app = express()

  app.use(requestLogger)
  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  )
  app.use(cookieParser())
  app.use(morgan('dev'))
  app.use(express.json({ limit: '1mb' }))

  app.use('/api', createApiRouter(logStore))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() })
  })

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
       
      _next: express.NextFunction
    ) => {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  )

  return app
}
