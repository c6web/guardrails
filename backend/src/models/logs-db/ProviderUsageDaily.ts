import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface ProviderUsageDailyAttributes {
  id: number | string
  provider_id: string
  provider_name: string
  vendor: string
  call_type: string
  day: string      // DATEONLY — 'YYYY-MM-DD'
  requests: number
  errors: number
  tokens_in: number
  tokens_out: number
  updated_at?: Date
}

type CreationAttrs = Optional<ProviderUsageDailyAttributes, 'id' | 'requests' | 'errors' | 'tokens_in' | 'tokens_out'>

export class ProviderUsageDaily
  extends Model<ProviderUsageDailyAttributes, CreationAttrs>
  implements ProviderUsageDailyAttributes
{
  declare id: number | string
  declare provider_id: string
  declare provider_name: string
  declare vendor: string
  declare call_type: string
  declare day: string
  declare requests: number
  declare errors: number
  declare tokens_in: number
  declare tokens_out: number
  declare readonly updated_at: Date
}

export function initProviderUsageDailyModel(sequelize: Sequelize): typeof ProviderUsageDaily {
  ProviderUsageDaily.init(
    {
      id:            { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      provider_id:   { type: DataTypes.STRING(100), allowNull: false },
      provider_name: { type: DataTypes.STRING(255), allowNull: false },
      vendor:        { type: DataTypes.STRING(50),  allowNull: false },
      call_type:     { type: DataTypes.STRING(32),  allowNull: false },
      day:           { type: DataTypes.DATEONLY,    allowNull: false },
      requests:      { type: DataTypes.BIGINT,      allowNull: false, defaultValue: 0 },
      errors:        { type: DataTypes.BIGINT,      allowNull: false, defaultValue: 0 },
      tokens_in:     { type: DataTypes.BIGINT,      allowNull: false, defaultValue: 0 },
      tokens_out:    { type: DataTypes.BIGINT,      allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      tableName:   'provider_usage_daily',
      modelName:   'ProviderUsageDaily',
      timestamps:  true,
      createdAt:   false,
      updatedAt:   'updated_at',
      underscored: true,
    }
  )
  return ProviderUsageDaily
}
