import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface UpstreamProviderLinkAttributes {
  ai_provider_id: string
  is_default: boolean
  created_at?: Date
}

type UpstreamProviderLinkCreationAttributes = Optional<UpstreamProviderLinkAttributes, 'created_at' | 'is_default'>

export class UpstreamProviderLink
  extends Model<UpstreamProviderLinkAttributes, UpstreamProviderLinkCreationAttributes>
  implements UpstreamProviderLinkAttributes
{
  declare ai_provider_id: string
  declare is_default: boolean
  declare readonly created_at: Date
}

export function initUpstreamProviderLinkModel(sequelize: Sequelize): typeof UpstreamProviderLink {
  UpstreamProviderLink.init(
    {
      ai_provider_id: { type: DataTypes.UUID, primaryKey: true },
      is_default:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName:   'upstream_provider_links',
      modelName:   'UpstreamProviderLink',
      timestamps:  false,
    }
  )
  return UpstreamProviderLink
}
