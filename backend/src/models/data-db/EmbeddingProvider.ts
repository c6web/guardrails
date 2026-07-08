import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface EmbeddingProviderAttributes {
  id: string
  name: string
  vendor: string
  endpoint: string
  api_key: string | null
  model: string | null
  dimensions: number | null
  timeout_ms: number
  status: 'healthy' | 'degraded' | 'unhealthy'
  notes: string | null
  provider: string | null
  allow_fallbacks: boolean | null
  data_collection: string | null
  requests_24h: number
  errors_24h: number
  avg_latency_ms: number
  created_at?: Date
  updated_at?: Date
}

type EmbeddingProviderCreationAttributes = Optional<
  EmbeddingProviderAttributes,
  'id' | 'api_key' | 'model' | 'dimensions' | 'notes' | 'provider' | 'allow_fallbacks' | 'data_collection' | 'requests_24h' | 'errors_24h' | 'avg_latency_ms'
>

export class EmbeddingProvider
  extends Model<EmbeddingProviderAttributes, EmbeddingProviderCreationAttributes>
  implements EmbeddingProviderAttributes
{
  declare id: string
  declare name: string
  declare vendor: string
  declare endpoint: string
  declare api_key: string | null
  declare model: string | null
  declare dimensions: number | null
  declare timeout_ms: number
  declare status: 'healthy' | 'degraded' | 'unhealthy'
  declare notes: string | null
  declare provider: string | null
  declare allow_fallbacks: boolean | null
  declare data_collection: string | null
  declare requests_24h: number
  declare errors_24h: number
  declare avg_latency_ms: number
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initEmbeddingProviderModel(sequelize: Sequelize): typeof EmbeddingProvider {
  EmbeddingProvider.init(
    {
      id:              { type: DataTypes.STRING(50), primaryKey: true },
      name:            { type: DataTypes.STRING(255), allowNull: false },
      vendor:          { type: DataTypes.STRING(100), allowNull: false },
      endpoint:        { type: DataTypes.STRING(512), allowNull: false },
      api_key:         { type: DataTypes.TEXT, allowNull: true },
      model:           { type: DataTypes.STRING(255), allowNull: true },
      dimensions:      { type: DataTypes.INTEGER, allowNull: true },
      timeout_ms:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30000 },
      status:          { type: DataTypes.ENUM('healthy', 'degraded', 'unhealthy'), allowNull: false, defaultValue: 'healthy' },
      notes:           { type: DataTypes.TEXT, allowNull: true },
      provider:        { type: DataTypes.STRING(255), allowNull: true },
      allow_fallbacks: { type: DataTypes.BOOLEAN, allowNull: true },
      data_collection: { type: DataTypes.STRING(50), allowNull: true },
      requests_24h:    { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      errors_24h:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      avg_latency_ms:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      tableName:   'embedding_providers',
      modelName:   'EmbeddingProvider',
      timestamps:  true,
      underscored: true,
    }
  )
  return EmbeddingProvider
}
