import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface ToolGuardrailAttributes {
  id: string
  tool_name: string
  description: string | null
  parameters_schema: unknown | null
  active: boolean
  quality_review_result?: string | null
  quality_review_reason?: string | null
  quality_reviewed_at?: Date | null
  quality_reviewed_by?: string | null
  created_at?: Date
  updated_at?: Date
}

type ToolGuardrailCreationAttributes = Optional<
  ToolGuardrailAttributes,
  'id' | 'description' | 'parameters_schema' | 'active'
>

export class ToolGuardrail
  extends Model<ToolGuardrailAttributes, ToolGuardrailCreationAttributes>
  implements ToolGuardrailAttributes
{
  declare id: string
  declare tool_name: string
  declare description: string | null
  declare parameters_schema: unknown | null
  declare active: boolean
  declare quality_review_result: string | null
  declare quality_review_reason: string | null
  declare quality_reviewed_at: Date | null
  declare quality_reviewed_by: string | null
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initToolGuardrailModel(sequelize: Sequelize): typeof ToolGuardrail {
  ToolGuardrail.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      tool_name: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      parameters_schema: { type: DataTypes.JSONB, allowNull: true },
      active:                { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      quality_review_result: { type: DataTypes.STRING(20), allowNull: true },
      quality_review_reason: { type: DataTypes.TEXT, allowNull: true },
      quality_reviewed_at:   { type: DataTypes.DATE, allowNull: true },
      quality_reviewed_by:   { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      tableName: 'tool_guardrails',
      modelName: 'ToolGuardrail',
      timestamps: true,
      underscored: true,
    }
  )
  return ToolGuardrail
}
