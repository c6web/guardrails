import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface ConnectedAppAttributes {
  id: string
  name: string
  team: string
  env: 'production' | 'development' | 'qa'
  org_id?: string | null
  status: 'enable' | 'disable'
  rps: number
  lat_avg: number
  p95: number
  blocked_count: number
  total_requests: number
  sla: number
  primary_provider_id?: string | null
  backup1_provider_id?: string | null
  backup2_provider_id?: string | null
  mode?: string
  owner?: string | null
  owner_email?: string | null
  owner_id?: string | null
  classifier_threshold?: number | null
  classifier_prompt?: string | null
  max_tokens?: number | null
  max_payload_size?: number | null
  enable_t2?: boolean
  enable_knowledge_dev?: boolean
  enable_content_quality_scan?: boolean
  content_quality_scan_mode?: string | null
  content_quality_scan_threshold?: number | null
  enable_response_cache?: boolean
  cache_ttl_seconds?: number | null
  multi_turn_semantic_enabled?: boolean
  quota_mode?: 'unlimited' | 'fixed' | 'monthly'
  quota_limit?: number | null
  quota_warning_limit?: number | null
  quota_enforcement?: 'hard' | 'soft'
  quota_reset_day?: number | null
  quota_period_start?: Date | null
  detectors_custom?: boolean
  threat_knowledge_custom?: boolean
  created_at?: Date
  updated_at?: Date
}

type ConnectedAppCreationAttributes = Optional<
  ConnectedAppAttributes,
  'id' | 'status' | 'rps' | 'lat_avg' | 'p95' | 'blocked_count' | 'total_requests' | 'sla' |
  'primary_provider_id' | 'backup1_provider_id' | 'backup2_provider_id' |
  'mode' | 'owner' | 'owner_email' | 'owner_id' | 'classifier_threshold' | 'classifier_prompt' |
  'max_tokens' | 'max_payload_size' | 'enable_t2' | 'enable_knowledge_dev' |
  'quota_mode' | 'quota_limit' | 'quota_warning_limit' | 'quota_enforcement' |
  'quota_reset_day' | 'quota_period_start' | 'org_id' |
  'detectors_custom' | 'threat_knowledge_custom' |
  'enable_response_cache' | 'cache_ttl_seconds' | 'multi_turn_semantic_enabled' |
  'enable_content_quality_scan' | 'content_quality_scan_mode' | 'content_quality_scan_threshold'
>

export class ConnectedApp
  extends Model<ConnectedAppAttributes, ConnectedAppCreationAttributes>
  implements ConnectedAppAttributes
{
  declare id: string
  declare name: string
  declare team: string
  declare env: 'production' | 'development' | 'qa'
  declare org_id: string | null
  declare status: 'enable' | 'disable'
  declare rps: number
  declare lat_avg: number
  declare p95: number
  declare blocked_count: number
  declare total_requests: number
  declare sla: number
  declare primary_provider_id: string | null
  declare backup1_provider_id: string | null
  declare backup2_provider_id: string | null
  declare mode: string
  declare owner: string | null
  declare owner_email: string | null
  declare owner_id: string | null
  declare classifier_threshold: number | null
  declare classifier_prompt: string | null
  declare max_tokens: number | null
  declare max_payload_size: number | null
  declare enable_t2: boolean
  declare enable_knowledge_dev: boolean
  declare enable_content_quality_scan: boolean
  declare content_quality_scan_mode: string | null
  declare content_quality_scan_threshold: number | null
  declare enable_response_cache: boolean
  declare cache_ttl_seconds: number | null
  declare multi_turn_semantic_enabled: boolean
  declare quota_mode: 'unlimited' | 'fixed' | 'monthly'
  declare quota_limit: number | null
  declare quota_warning_limit: number | null
  declare quota_enforcement: 'hard' | 'soft'
  declare quota_reset_day: number | null
  declare quota_period_start: Date | null
  declare readonly created_at: Date
  declare readonly updated_at: Date
  // Sequelize's auto-generated timestamp attributes are camelCase JS keys
  // (mapped to created_at/updated_at columns via underscored:true) — the
  // created_at/updated_at fields above are DB column names, not real
  // runtime attributes, so code needing the actual value must use these.
  declare detectors_custom: boolean
  declare threat_knowledge_custom: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

export function initConnectedAppModel(sequelize: Sequelize): typeof ConnectedApp {
  ConnectedApp.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      name: { type: DataTypes.STRING(255), allowNull: false },
      team: { type: DataTypes.STRING(100), allowNull: true },
      org_id: { type: DataTypes.UUID, allowNull: true },
      env: {
        type: DataTypes.ENUM('production', 'development', 'qa'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('enable', 'disable'),
        allowNull: false,
        defaultValue: 'enable',
      },
      rps:           { type: DataTypes.FLOAT,   allowNull: false, defaultValue: 0 },
      lat_avg:       { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      p95:           { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      blocked_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      total_requests:{ type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      sla:           { type: DataTypes.FLOAT,   allowNull: false, defaultValue: 100 },
      primary_provider_id:  { type: DataTypes.UUID, allowNull: true },
      backup1_provider_id:  { type: DataTypes.UUID, allowNull: true },
      backup2_provider_id:  { type: DataTypes.UUID, allowNull: true },
      mode:             { type: DataTypes.TEXT,          allowNull: false, defaultValue: 'guard' },
      owner:            { type: DataTypes.STRING(100),   allowNull: true },
      owner_email:      { type: DataTypes.STRING(255),   allowNull: true },
      owner_id:         { type: DataTypes.UUID,          allowNull: true },
      classifier_threshold: { type: DataTypes.FLOAT, allowNull: true },
      classifier_prompt:    { type: DataTypes.TEXT,  allowNull: true },
      max_tokens:           { type: DataTypes.INTEGER, allowNull: true },
      max_payload_size:     { type: DataTypes.INTEGER, allowNull: true },
      enable_t2:            { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      enable_knowledge_dev: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      enable_content_quality_scan:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      content_quality_scan_mode:      { type: DataTypes.TEXT,    allowNull: true },
      content_quality_scan_threshold: { type: DataTypes.DOUBLE,  allowNull: true },
      enable_response_cache: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      cache_ttl_seconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
      },
      multi_turn_semantic_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      detectors_custom:           { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      threat_knowledge_custom:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      quota_mode:          { type: DataTypes.TEXT,    allowNull: false, defaultValue: 'unlimited' },
      quota_limit:         { type: DataTypes.INTEGER, allowNull: true },
      quota_warning_limit: { type: DataTypes.INTEGER, allowNull: true },
      quota_enforcement:   { type: DataTypes.TEXT,    allowNull: false, defaultValue: 'hard' },
      quota_reset_day:     { type: DataTypes.SMALLINT, allowNull: true },
      quota_period_start:  { type: DataTypes.DATE,    allowNull: true },
    },
    {
      sequelize,
      tableName: 'connected_apps',
      modelName: 'ConnectedApp',
      timestamps: true,
      underscored: true,
    }
  )
  return ConnectedApp
}
