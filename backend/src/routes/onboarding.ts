import type { Request, Response } from 'express';
import { Router } from 'express'
import { User } from '../models/users-db/User'
import { GatewayApiKey } from '../models/data-db/GatewayApiKey'
import { AiProvider } from '../models/data-db/AiProvider'
import { EmbeddingProvider } from '../models/data-db/EmbeddingProvider'
import { getOrCreateConfig } from '../models/data-db/ClassifierConfig'
import { ConnectedApp } from '../models/data-db/ConnectedApp'
import { requireRole } from '../middleware/requireRole'
import { requireAuth } from '../middleware/auth'
import { env } from '../config/env'

const router = Router()
router.use(requireAuth)

type ChecklistItem = {
  id: string
  label: string
  status: 'done' | 'warning' | 'missing'
  message: string
  action_url?: string
}

// GET /api/onboarding/checklist — admin only
router.get('/checklist', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const items: ChecklistItem[] = []

    // Item 1: Environment secrets configured
    const placeholderPattern = /CHANGE_ME_/
    const envSecrets: Record<string, string> = {
      JWT_SECRET: env.JWT_SECRET,
      PLATFORM_KEY_SECRET: env.PLATFORM_KEY_SECRET,
    }

    let envMissing = false
    for (const [_key, value] of Object.entries(envSecrets)) {
      if (placeholderPattern.test(value)) {
        envMissing = true
        break
      }
    }

    const secretTooShort = env.PLATFORM_KEY_SECRET.length < 32

    if (envMissing) {
      items.push({
        id: 'env-secrets',
        label: 'Environment secrets configured',
        status: 'missing',
        message: 'One or more secret keys contain placeholder values. Set non-default values in your .env file.',
      })
    } else if (secretTooShort) {
      items.push({
        id: 'env-secrets',
        label: 'Environment secrets configured',
        status: 'warning',
        message: `PLATFORM_KEY_SECRET is only ${env.PLATFORM_KEY_SECRET.length} characters (≥32 recommended). A short secret is easier to brute-force.`,
        action_url: '/onboarding',
      })
    } else {
      items.push({
        id: 'env-secrets',
        label: 'Environment secrets configured',
        status: 'done',
        message: 'All secret keys are set to non-default values.',
      })
    }

    // Item 2: Default admin password changed
    let adminPasswordWarning = false
    try {
      const adminUser = await User.findOne({
        where: { username: env.ADMIN_USERNAME || 'admin' },
        attributes: ['must_change_password', 'password_changed_at'],
      })

      if (adminUser) {
        if (adminUser.must_change_password === true || !adminUser.password_changed_at) {
          adminPasswordWarning = true
        }
      } else {
        adminPasswordWarning = true
      }
    } catch {
      adminPasswordWarning = true
    }

    if (adminPasswordWarning) {
      items.push({
        id: 'admin-password',
        label: 'Default admin password changed',
        status: 'warning',
        message: 'The admin account should change its password. Default credentials are a security risk.',
        action_url: '/users',
      })
    } else {
      items.push({
        id: 'admin-password',
        label: 'Default admin password changed',
        status: 'done',
        message: 'Admin password has been changed from default.',
      })
    }

    // Item 3: Gateway API key created
    let gatewayKeyMissing = false
    try {
      const activeKeys = await GatewayApiKey.count({
        where: { status: 'active' },
      })
      if (activeKeys === 0) {
        gatewayKeyMissing = true
      }
    } catch {
      gatewayKeyMissing = true
    }

    if (gatewayKeyMissing) {
      items.push({
        id: 'gateway-api-key',
        label: 'Gateway API key created',
        status: 'missing',
        message: 'No active Gateway API keys found. Create a key to authenticate with the gateway engine.',
        action_url: '/gateways',
      })
    } else {
      items.push({
        id: 'gateway-api-key',
        label: 'Gateway API key created',
        status: 'done',
        message: `${(await GatewayApiKey.count({ where: { status: 'active' } }))} active gateway API key(s) configured.`,
      })
    }

    // Item 4: AI provider configured
    let aiProviderStatus: 'done' | 'missing' = 'missing'
    let aiProviderCount = 0
    try {
      aiProviderCount = await AiProvider.count()
      if (aiProviderCount > 0) {
        aiProviderStatus = 'done'
      }
    } catch {
      aiProviderStatus = 'missing'
    }

    items.push({
      id: 'ai-provider',
      label: 'AI provider configured',
      status: aiProviderStatus,
      message: aiProviderStatus === 'missing'
        ? 'No AI providers configured. Add an LLM provider for classification.'
        : `${aiProviderCount} AI provider(s) configured.`,
        action_url: '/ai-providers',
    })

    // Item 5: Embedding provider configured
    let embeddingStatus: 'done' | 'missing' = 'missing'
    let embeddingCount = 0
    try {
      embeddingCount = await EmbeddingProvider.count()
      if (embeddingCount > 0) {
        embeddingStatus = 'done'
      }
    } catch {
      embeddingStatus = 'missing'
    }

    items.push({
      id: 'embedding-provider',
      label: 'Embedding provider configured',
      status: embeddingStatus,
      message: embeddingStatus === 'missing'
        ? 'No embedding providers configured. Required for threat knowledge semantic search.'
        : `${embeddingCount} embedding provider(s) configured.`,
        action_url: '/embedding-providers',
    })

    // Item 6: Classifier fallback chain set
    let classifierStatus: 'done' | 'warning' | 'missing' = 'missing'
    try {
      const config = await getOrCreateConfig()
      if (config.primary_id) {
            const primaryExists = await AiProvider.count({
              where: { id: config.primary_id },
            })
            classifierStatus = primaryExists > 0 ? 'done' : 'warning'
          } else {
            classifierStatus = 'missing'
          }
    } catch {
      classifierStatus = 'missing'
    }

    items.push({
      id: 'classifier-chain',
      label: 'Classifier fallback chain set',
      status: classifierStatus,
      message: classifierStatus === 'missing'
        ? 'No primary classifier configured. Set a fallback chain for reliable classification.'
        : classifierStatus === 'warning'
          ? 'Primary classifier ID set but referenced provider may not exist.'
          : 'Classifier fallback chain is properly configured.',
        action_url: '/classifiers',
    })

    // Item 7: Gateway engine running
    let gatewayHealthStatus: 'done' | 'missing' = 'missing'
    let gatewayHealthMessage = 'Gateway engine health check failed. Ensure the gateway-engine service is running on port 8082.'

    try {
      const healthUrl = process.env.GATEWAY_HEALTH_URL || 'http://gateway-engine:8082/health'
      const response = await fetch(healthUrl)
      if (response.ok) {
        gatewayHealthStatus = 'done'
        gatewayHealthMessage = 'Gateway engine is running and healthy.'
      }
    } catch {
      // Health check failed — status remains 'missing'
    }

    items.push({
      id: 'gateway-engine',
      label: 'Gateway engine running',
      status: gatewayHealthStatus,
      message: gatewayHealthMessage,
      action_url: '/gateways',
    })

    // Item 8: Connected apps configured (optional / informational)
    let connectedAppStatus: 'done' | 'warning' = 'warning'
    try {
      const appCount = await ConnectedApp.count()
      if (appCount > 0) {
        connectedAppStatus = 'done'
      }
    } catch {}

    items.push({
      id: 'connected-apps',
      label: 'Connected apps configured',
      status: connectedAppStatus,
      message: connectedAppStatus === 'warning'
        ? 'No connected apps found — this is optional.'
        : `${(await ConnectedApp.count())} connected app(s) configured.`,
      action_url: '/apps',
    })

    res.json({ data: items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
