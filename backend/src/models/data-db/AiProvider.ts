import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface AiProviderAttributes {
  id: string
  name: string
  vendor: string
  endpoint: string
  api_key?: string
  notes?: string
  model?: string
  max_output_token?: number
  max_input_token?: number
  status: 'healthy' | 'degraded' | 'unhealthy'
  timeout_ms: number
  provider?: string | null
  allow_fallbacks?: boolean | null
  data_collection?: string | null
  requests_24h: number
  errors_24h: number
  avg_latency_ms: number
  meter_mode: 'unlimited' | 'monthly'
  meter_metric: 'requests' | 'tokens' | 'cost'
  meter_limit?: number | null
  meter_warning_limit?: number | null
  meter_enforcement: 'hard' | 'soft'
  meter_reset_day?: number | null
  price_per_1m_input?: number | null
  price_per_1m_output?: number | null
  meter_period_start?: Date | null
  created_at?: Date
  updated_at?: Date
}

type AiProviderCreationAttributes = Optional<
  AiProviderAttributes,
  'status' | 'timeout_ms' | 'requests_24h' | 'errors_24h' | 'avg_latency_ms' |
  'api_key' | 'notes' | 'model' | 'max_output_token' | 'max_input_token' | 'provider' | 'allow_fallbacks' | 'data_collection' |
  'meter_mode' | 'meter_metric' | 'meter_enforcement' |
  'meter_limit' | 'meter_warning_limit' | 'meter_reset_day' |
  'price_per_1m_input' | 'price_per_1m_output' | 'meter_period_start'
>

export class AiProvider
  extends Model<AiProviderAttributes, AiProviderCreationAttributes>
  implements AiProviderAttributes
{
  declare id: string
  declare name: string
  declare vendor: string
  declare endpoint: string
  declare api_key?: string
  declare notes?: string
  declare model?: string
  declare max_output_token?: number
  declare max_input_token?: number
  declare status: 'healthy' | 'degraded' | 'unhealthy'
  declare timeout_ms: number
  declare provider?: string | null
  declare allow_fallbacks?: boolean | null
  declare data_collection?: string | null
  declare requests_24h: number
  declare errors_24h: number
  declare avg_latency_ms: number
  declare meter_mode: 'unlimited' | 'monthly'
  declare meter_metric: 'requests' | 'tokens' | 'cost'
  declare meter_limit?: number | null
  declare meter_warning_limit?: number | null
  declare meter_enforcement: 'hard' | 'soft'
  declare meter_reset_day?: number | null
  declare price_per_1m_input?: number | null
  declare price_per_1m_output?: number | null
  declare meter_period_start?: Date | null
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initAiProviderModel(sequelize: Sequelize): typeof AiProvider {
  AiProvider.init(
    {
      id:         { type: DataTypes.STRING(50),  primaryKey: true },
      name:       { type: DataTypes.STRING(255), allowNull: false },
      vendor:     { type: DataTypes.STRING(100), allowNull: false },
      endpoint:   { type: DataTypes.STRING(512), allowNull: false },
      api_key:    { type: DataTypes.TEXT,        allowNull: true  },
      notes:      { type: DataTypes.TEXT,        allowNull: true  },
      model:      { type: DataTypes.STRING(255), allowNull: true  },
      max_output_token: { type: DataTypes.INTEGER, allowNull: true },
      max_input_token:  { type: DataTypes.INTEGER, allowNull: true },
      status: {
        type: DataTypes.ENUM('healthy', 'degraded', 'unhealthy'),
        allowNull: false,
        defaultValue: 'healthy',
      },
      timeout_ms:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30000 },
      provider:        { type: DataTypes.STRING(255), allowNull: true },
      allow_fallbacks: { type: DataTypes.BOOLEAN, allowNull: true },
      data_collection: { type: DataTypes.STRING(50), allowNull: true },
      requests_24h:    { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      errors_24h:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      avg_latency_ms:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      meter_mode:          { type: DataTypes.TEXT, allowNull: false, defaultValue: 'unlimited' },
      meter_metric:        { type: DataTypes.TEXT, allowNull: false, defaultValue: 'requests' },
      meter_limit:         { type: DataTypes.DECIMAL, allowNull: true },
      meter_warning_limit: { type: DataTypes.DECIMAL, allowNull: true },
      meter_enforcement:   { type: DataTypes.TEXT, allowNull: false, defaultValue: 'soft' },
      meter_reset_day:     { type: DataTypes.SMALLINT, allowNull: true },
      price_per_1m_input:  { type: DataTypes.DECIMAL, allowNull: true },
      price_per_1m_output: { type: DataTypes.DECIMAL, allowNull: true },
      meter_period_start:  { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      tableName:   'ai_providers',
      modelName:   'AiProvider',
      timestamps:  true,
      underscored: true,
    }
  )
  return AiProvider
}
