import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import authRouter from './auth'
import usersRouter from './users'
import groupsRouter from './groups'
import { createLogsRouter } from './logs'
import { createAiProviderCallLogsRouter } from './aiProviderCallLogs'
import appsRouter from './apps'
import { createAppQuotaRouter } from './appQuota'
import apikeysRouter from './apikeys'
import createAiProvidersRouter from './aiProviders'
import createProvidersRouter from './providers'
import classifiersRouter from './classifiers'
import { createStatsRouter } from './stats'
import gatewaysRouter from './gateways'
import detectorsRouter from './detectors'

import notificationsRouter from './notifications'
import networkAclRouter from './networkAcl'
import incidentsRouter from './incidents'
import otpRouter from './otp'
import settingsRouter from './settings'
import passwordPolicyRouter from './passwordPolicy'
import { createSidebarRouter } from './sidebar'
import { createThreatKnowledgeRouter } from './threatKnowledge'
import { createEmbeddingProvidersRouter } from './embeddingProviders'
import detectionFrameworksRouter from './detectionFrameworks'
import toolsRouter from './tools'
import { createReloadLogsRouter } from './reloadLogs'
import adminkeysRouter from './adminkeys'
import onboardingRouter from './onboarding'
import { createProviderMeteringRouter } from './providerMetering'
import t2AgentPromptsRouter from './t2AgentPrompts'
import organizationsRouter from './organizations'
import reviewConfigRouter from './reviewConfig'
import { createQualityReviewRouter } from './qualityReview'
import contentQualityJudgeRouter from './contentQualityJudge'
import { createContentQualityProviderRouter } from './contentQualityProvider'
import { createResponseCacheConfigRouter } from './responseCacheConfig'
import captchaRouter from './captcha'
import accessRequestsRouter from './accessRequests'
import { requireAuth } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'
import type { ILogStore } from '../logs/ILogStore'
import { sequelizeDataDb } from '../config/database'

export function createApiRouter(logStore: ILogStore): Router {
  const router = Router()

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Too many requests, please try again later' },
  })
  router.use(globalLimiter)

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts' },
  })
  const otpSendLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 3,
    message: { error: 'Too many OTP requests' },
  })

  const otpVerifyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: { error: 'Too many OTP verification attempts' },
  })

  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many refresh requests' },
  })

  const passwordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many password change attempts' },
  })

  const forcePasswordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many password change attempts' },
  })

  router.use('/auth/login', loginLimiter)
  router.use('/auth/otp/send', otpSendLimiter)
  router.use('/auth/otp/verify', otpVerifyLimiter)
  router.use('/auth/refresh', refreshLimiter)
  router.use('/auth/force-password-change', forcePasswordChangeLimiter)
  router.use('/auth/me', requireAuth)
  router.use('/auth', authRouter)
  router.use('/users/:id/change-password', requireAuth, passwordChangeLimiter)
  router.use('/users', requireAuth, usersRouter)
  router.use('/groups', requireAuth, groupsRouter)
  router.use('/logs', requireAuth, createLogsRouter(logStore, sequelizeDataDb))
  router.use('/logs/provider-calls', requireAuth, createAiProviderCallLogsRouter(logStore))
  router.use('/apps', requireAuth, createAppQuotaRouter(logStore))
  router.use('/apps', requireAuth, appsRouter)
  router.use('/apikeys', requireAuth, apikeysRouter)
  router.use('/ai-providers', requireAuth, createAiProvidersRouter(logStore))
  router.use('/providers', requireAuth, createProviderMeteringRouter())
  router.use('/providers', requireAuth, createProvidersRouter(logStore))
  router.use('/classifiers', requireAuth, classifiersRouter)
  router.use('/stats', requireAuth, createStatsRouter(logStore, sequelizeDataDb))
  router.use('/gateways', gatewaysRouter)
  router.use('/detectors', requireAuth, detectorsRouter)

  router.use('/notifications', requireAuth, notificationsRouter)
  router.use('/network-acl', requireAuth, networkAclRouter)
  router.use('/incidents', requireAuth, incidentsRouter)
  router.use('/auth/otp', otpRouter)
  router.use('/settings', settingsRouter)
  router.use('/password-policy', requireAuth, passwordPolicyRouter)
  router.use('/sidebar-counts', requireAuth, createSidebarRouter(logStore))
  router.use('/threat-knowledge', requireAuth, createThreatKnowledgeRouter(logStore))
  router.use('/embedding-providers', requireAuth, createEmbeddingProvidersRouter(logStore))
  router.use('/detection-frameworks', requireAuth, detectionFrameworksRouter)
  router.use('/tools', requireAuth, toolsRouter)
  router.use('/reload-logs', requireAuth, createReloadLogsRouter(logStore, sequelizeDataDb))
  router.use('/adminkeys', requireAuth, requireRole('admin'), adminkeysRouter)
  router.use('/onboarding', onboardingRouter)
  router.use('/t2-agent-prompts', requireAuth, t2AgentPromptsRouter)
  router.use('/organizations', requireAuth, organizationsRouter)
  router.use('/captcha', captchaRouter)
  router.use('/access-request', accessRequestsRouter)
  router.use('/review-config', requireAuth, requireRole('admin'), reviewConfigRouter)
  router.use('/review', requireAuth, requireRole('admin'), createQualityReviewRouter(logStore))
  router.use('/response-cache-config', requireAuth, createResponseCacheConfigRouter(logStore))
  router.use('/content-quality-judge', requireAuth, contentQualityJudgeRouter)
  router.use('/content-quality-provider', requireAuth, createContentQualityProviderRouter(logStore))
  return router
}
