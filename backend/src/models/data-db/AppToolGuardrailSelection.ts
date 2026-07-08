import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface AppToolGuardrailSelectionAttributes {
  app_id: string
  tool_guardrail_id: string
  created_at?: Date
  updated_at?: Date
}

type AppToolGuardrailSelectionCreationAttributes = Optional<
  AppToolGuardrailSelectionAttributes,
  'created_at' | 'updated_at'
>

export class AppToolGuardrailSelection
  extends Model<AppToolGuardrailSelectionAttributes, AppToolGuardrailSelectionCreationAttributes>
  implements AppToolGuardrailSelectionAttributes
{
  declare app_id: string
  declare tool_guardrail_id: string
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initAppToolGuardrailSelectionModel(sequelize: Sequelize): typeof AppToolGuardrailSelection {
  AppToolGuardrailSelection.init(
    {
      app_id:             { type: DataTypes.UUID, primaryKey: true },
      tool_guardrail_id:  { type: DataTypes.UUID, primaryKey: true },
      created_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName:   'app_tool_guardrail_selections',
      modelName:   'AppToolGuardrailSelection',
      timestamps:  true,
      underscored: true,
    }
  )
  return AppToolGuardrailSelection
}

