import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface AiProviderAllowedModelAttributes {
  ai_provider_id: string
  model_id: string
  is_default: boolean
  created_at?: Date
  updated_at?: Date
}

type AiProviderAllowedModelCreationAttributes = Optional<AiProviderAllowedModelAttributes, 'is_default' | 'created_at' | 'updated_at'>

export class AiProviderAllowedModel
  extends Model<AiProviderAllowedModelAttributes, AiProviderAllowedModelCreationAttributes>
  implements AiProviderAllowedModelAttributes
{
  declare ai_provider_id: string
  declare model_id: string
  declare is_default: boolean
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initAiProviderAllowedModelModel(sequelize: Sequelize): typeof AiProviderAllowedModel {
  AiProviderAllowedModel.init(
    {
      ai_provider_id: { type: DataTypes.STRING(50), primaryKey: true, allowNull: false },
      model_id:       { type: DataTypes.STRING(255), primaryKey: true, allowNull: false },
      is_default:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName:   'ai_provider_allowed_models',
      modelName:   'AiProviderAllowedModel',
      timestamps:  true,
      underscored: true,
    }
  )
  return AiProviderAllowedModel
}
