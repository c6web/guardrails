import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface QualityReviewLogAttributes {
  id: string
  target_type: string
  target_id: string
  target_name: string
  previous_result: string | null
  new_result: string
  reason: string
  reviewed_by: string
  reviewed_by_email: string
  review_provider_name?: string | null
  review_model?: string | null
  created_at?: Date
}

type QualityReviewLogCreationAttributes = Optional<
  QualityReviewLogAttributes,
  'id' | 'previous_result'
>

export class QualityReviewLog
  extends Model<QualityReviewLogAttributes, QualityReviewLogCreationAttributes>
  implements QualityReviewLogAttributes
{
  declare id: string
  declare target_type: string
  declare target_id: string
  declare target_name: string
  declare previous_result: string | null
  declare new_result: string
  declare reason: string
  declare reviewed_by: string
  declare reviewed_by_email: string
  declare review_provider_name: string | null
  declare review_model: string | null
  declare readonly created_at: Date
}

export function initQualityReviewLogModel(sequelize: Sequelize): typeof QualityReviewLog {
  QualityReviewLog.init(
    {
      id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      target_type:     { type: DataTypes.STRING(50), allowNull: false },
      target_id:       { type: DataTypes.UUID, allowNull: false },
      target_name:     { type: DataTypes.STRING(500), allowNull: false },
      previous_result: { type: DataTypes.STRING(20), allowNull: true },
      new_result:      { type: DataTypes.STRING(20), allowNull: false },
      reason:          { type: DataTypes.TEXT, allowNull: false },
      reviewed_by:     { type: DataTypes.UUID, allowNull: false },
      reviewed_by_email:    { type: DataTypes.STRING(255), allowNull: false },
      review_provider_name: { type: DataTypes.STRING(255), allowNull: true },
      review_model:         { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      sequelize,
      tableName:   'quality_review_logs',
      modelName:   'QualityReviewLog',
      timestamps:  true,
      updatedAt:   false,
      underscored: true,
    }
  )
  return QualityReviewLog
}
