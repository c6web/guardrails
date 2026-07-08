import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'
import { AiProvider } from './AiProvider'

interface ReviewConfigAttributes {
  id: number
  provider_id: string | null
  provider?: any
  created_at?: Date
  updated_at?: Date
}

type ReviewConfigCreationAttributes = Optional<ReviewConfigAttributes, 'id'>

export class ReviewConfig
  extends Model<ReviewConfigAttributes, ReviewConfigCreationAttributes>
  implements ReviewConfigAttributes
{
  declare id: number
  declare provider_id: string | null
  declare readonly created_at: Date
  declare readonly updated_at: Date

  declare provider?: AiProvider
}

export function initReviewConfigModel(sequelize: Sequelize): typeof ReviewConfig {
  ReviewConfig.init(
    {
      id:          { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      provider_id: { type: DataTypes.STRING(50), allowNull: true },
    },
    {
      sequelize,
      tableName:   'review_config',
      modelName:   'ReviewConfig',
      timestamps:  true,
      underscored: true,
    }
  )
  return ReviewConfig
}

export function associateReviewConfig(): void {
  ReviewConfig.belongsTo(AiProvider, { foreignKey: 'provider_id', as: 'provider' })
}
