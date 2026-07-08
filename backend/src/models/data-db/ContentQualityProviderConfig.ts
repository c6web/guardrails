import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'
import { AiProvider } from './AiProvider'

interface ContentQualityProviderConfigAttributes {
  id: number
  vendor: string
  service_url: string | null
  service_api_key: string | null
  timeout_ms: number
  provider_id: string | null
  provider?: any
  created_at?: Date
  updated_at?: Date
}

type ContentQualityProviderConfigCreationAttributes = Optional<
  ContentQualityProviderConfigAttributes, 'id' | 'vendor' | 'timeout_ms'
>

export class ContentQualityProviderConfig
  extends Model<ContentQualityProviderConfigAttributes, ContentQualityProviderConfigCreationAttributes>
  implements ContentQualityProviderConfigAttributes
{
  declare id: number
  declare vendor: string
  declare service_url: string | null
  declare service_api_key: string | null
  declare timeout_ms: number
  declare provider_id: string | null
  declare readonly created_at: Date
  declare readonly updated_at: Date

  declare provider?: AiProvider
}

export function initContentQualityProviderConfigModel(sequelize: Sequelize): typeof ContentQualityProviderConfig {
  ContentQualityProviderConfig.init(
    {
      id:              { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      vendor:          { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'trulens' },
      service_url:     { type: DataTypes.TEXT, allowNull: true },
      service_api_key: { type: DataTypes.TEXT, allowNull: true },
      timeout_ms:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120000 },
      provider_id:     { type: DataTypes.STRING(50), allowNull: true },
    },
    {
      sequelize,
      tableName:   'content_quality_provider_config',
      modelName:   'ContentQualityProviderConfig',
      timestamps:  true,
      underscored: true,
    }
  )
  return ContentQualityProviderConfig
}

export function associateContentQualityProviderConfig(): void {
  ContentQualityProviderConfig.belongsTo(AiProvider, { foreignKey: 'provider_id', as: 'provider' })
}
