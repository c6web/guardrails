import type { Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface ProviderUsageRollupStateAttributes {
  id: number          // always 1
  last_processed_at: Date
  updated_at?: Date
}

export class ProviderUsageRollupState
  extends Model<ProviderUsageRollupStateAttributes>
  implements ProviderUsageRollupStateAttributes
{
  declare id: number
  declare last_processed_at: Date
  declare readonly updated_at: Date
}

export function initProviderUsageRollupStateModel(sequelize: Sequelize): typeof ProviderUsageRollupState {
  ProviderUsageRollupState.init(
    {
      id:                { type: DataTypes.INTEGER, primaryKey: true },
      last_processed_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName:   'provider_usage_rollup_state',
      modelName:   'ProviderUsageRollupState',
      timestamps:  true,
      createdAt:   false,
      updatedAt:   'updated_at',
      underscored: true,
    }
  )
  return ProviderUsageRollupState
}
