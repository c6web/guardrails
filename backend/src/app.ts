import { env } from './config/env'
import { sequelizeUsersDb, sequelizeDataDb, sequelizeLogsDb } from './config/database'
import { createLogStore } from './logs/factory'
import { runAllMigrations } from './migration-runner'
import { Sequelize } from 'sequelize'
import { registerTypes as registerPgvectorTypes } from 'pgvector/sequelize'

// Ensure ts-node transpile-only for nodemon compatibility
process.env.TS_NODE_TRANSPILE_ONLY = 'true'

// Register pgvector VECTOR type with Sequelize before any model initialization
registerPgvectorTypes(Sequelize)

// Users DB models
import { initUserModel, User } from './models/users-db/User'
import { initRefreshTokenModel, RefreshToken } from './models/users-db/RefreshToken'
import { initOrganizationModel, Organization } from './models/users-db/Organization'
import { initAccessRequestModel } from './models/users-db/AccessRequest'
// Data DB models
import { initGroupModel } from './models/data-db/Group'

import { initDetectorModel, Detector } from './models/data-db/Detector'
import { initConnectedAppModel, ConnectedApp } from './models/data-db/ConnectedApp'
import { initAiProviderModel, AiProvider } from './models/data-db/AiProvider'
import { initUpstreamProviderLinkModel, UpstreamProviderLink } from './models/data-db/UpstreamProviderLink'
import { ClassifierConfig, initClassifierConfigModel } from './models/data-db/ClassifierConfig'
import { associateApiKey, initApiKeyModel, ApiKey } from './models/data-db/ApiKey'
import { initApiKeyVersionModel, ApiKeyVersion } from './models/data-db/ApiKeyVersion'
import { initGatewayInstanceModel, GatewayInstance } from './models/data-db/GatewayInstance'
import { initNotificationServerModel } from './models/data-db/NotificationServer'
import { initNotificationLogModel } from './models/logs-db/NotificationLog'
import { initNetworkAclListModel, NetworkAclList } from './models/data-db/NetworkAclList'
import { initNetworkAclEntryModel, NetworkAclEntry } from './models/data-db/NetworkAclEntry'
import { initAppPermissionModel, AppPermission } from './models/data-db/AppPermission'

// NetworkAclSettings removed — migration 0002 drops the table (replaced by per-gateway ACL lists)
import { initIncidentModel } from './models/data-db/Incident'
import { initPasswordPolicyConfigModel } from './models/data-db/PasswordPolicyConfig'
import { initPasswordPolicyModel } from './models/data-db/PasswordPolicy'
import { initEmbeddingProviderModel, EmbeddingProvider } from './models/data-db/EmbeddingProvider'
import { EmbeddingProviderConfig, initEmbeddingProviderConfigModel } from './models/data-db/EmbeddingProviderConfig'
import { initDetectionFrameworkModel, associateDetectionFramework } from './models/data-db/DetectionFramework'
import { ThreatKnowledge, initThreatKnowledgeModel, associateThreatKnowledge } from './models/data-db/ThreatKnowledge'
import { associateDetector } from './models/data-db/Detector'
import { initAppThreatKnowledgeSelectionModel, AppThreatKnowledgeSelection } from './models/data-db/AppThreatKnowledgeSelection'
import { initAppDetectorSelectionModel, AppDetectorSelection } from './models/data-db/AppDetectorSelection'
import { initToolGuardrailModel, ToolGuardrail } from './models/data-db/ToolGuardrail'
import { initAppToolGuardrailSelectionModel, AppToolGuardrailSelection } from './models/data-db/AppToolGuardrailSelection'
import { initToolAuditLogModel } from './models/logs-db/ToolAuditLog'
import { initAiProviderCallLogModel } from './models/logs-db/AiProviderCallLog'
import { initProviderUsageDailyModel } from './models/logs-db/ProviderUsageDaily'
import { initProviderUsageRollupStateModel } from './models/logs-db/ProviderUsageRollupState'

import { initAdminApiKeyModel } from './models/data-db/AdminApiKey'
import { initGatewayApiKeyModel, GatewayApiKey } from './models/data-db/GatewayApiKey'
import { initT2AgentPromptModel } from './models/data-db/T2AgentPrompt'
import { initReviewConfigModel, associateReviewConfig } from './models/data-db/ReviewConfig'
import { initContentQualityJudgePromptModel } from './models/data-db/ContentQualityJudgePrompt'
import { initContentQualityProviderConfigModel, associateContentQualityProviderConfig } from './models/data-db/ContentQualityProviderConfig'
import { initQualityReviewLogModel } from './models/logs-db/QualityReviewLog'
import { initResponseCacheModel } from './models/logs-db/ResponseCache'
import { initResponseCacheConfigModel } from './models/data-db/ResponseCacheConfig'

import { startProviderMeterRollup } from './jobs/providerMeterRollup'
import { createApp } from './server'

async function bootstrap(): Promise<void> {
  // Init users DB models
  initUserModel(sequelizeUsersDb)
  initRefreshTokenModel(sequelizeUsersDb)
  initOrganizationModel(sequelizeUsersDb)
  initAccessRequestModel(sequelizeUsersDb)

  // Init data DB models
  initGroupModel(sequelizeDataDb)
  initDetectorModel(sequelizeDataDb)
  initConnectedAppModel(sequelizeDataDb)
  initAiProviderModel(sequelizeDataDb)
  initUpstreamProviderLinkModel(sequelizeDataDb)
  initClassifierConfigModel(sequelizeDataDb)
  initApiKeyModel(sequelizeDataDb)
  initApiKeyVersionModel(sequelizeDataDb)
  initGatewayInstanceModel(sequelizeDataDb)
  initNotificationServerModel(sequelizeDataDb)
  initNotificationLogModel(sequelizeLogsDb)
  initNetworkAclListModel(sequelizeDataDb)
  initNetworkAclEntryModel(sequelizeDataDb)
  initIncidentModel(sequelizeDataDb)
  initPasswordPolicyConfigModel(sequelizeDataDb)
  initPasswordPolicyModel(sequelizeDataDb)
  initAppPermissionModel(sequelizeDataDb)
  initThreatKnowledgeModel(sequelizeDataDb)
  initEmbeddingProviderModel(sequelizeDataDb)
  initEmbeddingProviderConfigModel(sequelizeDataDb)
  initDetectionFrameworkModel(sequelizeDataDb)
  initAppThreatKnowledgeSelectionModel(sequelizeDataDb)
  initAppDetectorSelectionModel(sequelizeDataDb)
  initToolGuardrailModel(sequelizeDataDb)
  initAppToolGuardrailSelectionModel(sequelizeDataDb)
  initToolAuditLogModel(sequelizeLogsDb)
  initAiProviderCallLogModel(sequelizeLogsDb)
  initProviderUsageDailyModel(sequelizeLogsDb)
  initProviderUsageRollupStateModel(sequelizeLogsDb)
  initAdminApiKeyModel(sequelizeDataDb)
  initGatewayApiKeyModel(sequelizeDataDb)
  initT2AgentPromptModel(sequelizeDataDb)
  initReviewConfigModel(sequelizeDataDb)
  initContentQualityJudgePromptModel(sequelizeDataDb)
  initContentQualityProviderConfigModel(sequelizeDataDb)
  initQualityReviewLogModel(sequelizeLogsDb)
  initResponseCacheConfigModel(sequelizeDataDb)
  initResponseCacheModel(sequelizeLogsDb)

  // Associations — users DB
  User.hasMany(RefreshToken, { foreignKey: 'user_id', onDelete: 'CASCADE' })
  RefreshToken.belongsTo(User, { foreignKey: 'user_id' })
  User.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' })
  Organization.hasMany(User, { foreignKey: 'organization_id', as: 'members' })

  // Associations — data DB
  ApiKey.hasMany(ApiKeyVersion, { foreignKey: 'api_key_id', as: 'versions', onDelete: 'CASCADE' })
  ApiKeyVersion.belongsTo(ApiKey, { foreignKey: 'api_key_id' })
  ConnectedApp.hasMany(ApiKey, { foreignKey: 'app_id', as: 'apiKeys', onDelete: 'CASCADE' })
  ConnectedApp.hasMany(AppPermission, { foreignKey: 'app_id', as: 'permissions', onDelete: 'CASCADE' })
  AppPermission.belongsTo(ConnectedApp, { foreignKey: 'app_id', as: 'app' })
  associateApiKey()
  associateDetector()
  associateDetectionFramework()
  associateThreatKnowledge()
  associateReviewConfig()
  associateContentQualityProviderConfig()

  ConnectedApp.belongsToMany(ThreatKnowledge, {
    through: AppThreatKnowledgeSelection,
    foreignKey: 'app_id',
    as: 'selectedThreatKnowledge',
  })
  ThreatKnowledge.belongsToMany(ConnectedApp, {
    through: AppThreatKnowledgeSelection,
    foreignKey: 'threat_knowledge_id',
    as: 'selectingApps',
  })
  ConnectedApp.belongsToMany(Detector, {
    through: AppDetectorSelection,
    foreignKey: 'app_id',
    as: 'selectedDetectors',
  })
  Detector.belongsToMany(ConnectedApp, {
    through: AppDetectorSelection,
    foreignKey: 'detector_id',
    as: 'selectingApps',
  })
  AiProvider.hasOne(UpstreamProviderLink, { foreignKey: 'ai_provider_id', as: 'upstreamLink', onDelete: 'CASCADE' })
  UpstreamProviderLink.belongsTo(AiProvider, { foreignKey: 'ai_provider_id' })
  // NotificationLog moved to logs-db — cross-DB association removed (different connections)
  NetworkAclList.hasMany(NetworkAclEntry, { foreignKey: 'list_id', as: 'entries', onDelete: 'CASCADE' })
  NetworkAclEntry.belongsTo(NetworkAclList, { foreignKey: 'list_id', as: 'list' })
  GatewayInstance.belongsTo(NetworkAclList, { foreignKey: 'acl_list_id', as: 'aclList' })
  GatewayInstance.hasMany(GatewayApiKey, { foreignKey: 'gateway_id', as: 'apiKeys', onDelete: 'CASCADE' })
  GatewayApiKey.belongsTo(GatewayInstance, { foreignKey: 'gateway_id' })
  ClassifierConfig.belongsTo(AiProvider, { foreignKey: 'primary_id', as: 'primary' })
  ClassifierConfig.belongsTo(AiProvider, { foreignKey: 'backup1_id', as: 'backup1' })
  ClassifierConfig.belongsTo(AiProvider, { foreignKey: 'backup2_id', as: 'backup2' })
  EmbeddingProviderConfig.belongsTo(EmbeddingProvider, { foreignKey: 'primary_id', as: 'primary' })
  EmbeddingProviderConfig.belongsTo(EmbeddingProvider, { foreignKey: 'backup1_id', as: 'backup1' })
  EmbeddingProviderConfig.belongsTo(EmbeddingProvider, { foreignKey: 'backup2_id', as: 'backup2' })
  ConnectedApp.belongsToMany(ToolGuardrail, {
    through: AppToolGuardrailSelection,
    foreignKey: 'app_id',
    as: 'selectedToolGuardrails',
  })
  ToolGuardrail.belongsToMany(ConnectedApp, {
    through: AppToolGuardrailSelection,
    foreignKey: 'tool_guardrail_id',
    as: 'selectingApps',
  })

  // Init log store (driver selected via LOG_STORE_DRIVER env var)
  const logStore = createLogStore()
  await logStore.connect()

  // Verify remaining DB connections
  await Promise.all([
    sequelizeUsersDb.authenticate(),
    sequelizeDataDb.authenticate(),
    sequelizeLogsDb.authenticate(),
  ])
  console.log('All databases connected')

  // Run migrations automatically with idempotent error handling
  await runAllMigrations(sequelizeUsersDb, sequelizeDataDb, sequelizeLogsDb)

  // Start background jobs
  startProviderMeterRollup(sequelizeLogsDb)

  const app = createApp(logStore)
  app.listen(Number(env.PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${env.PORT}`)
  })
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
