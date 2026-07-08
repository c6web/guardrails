import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface T2AgentPromptAttributes {
  id: string
  name: string
  description: string | null
  system_prompt: string
  threshold: number
  max_output_tokens: number
  is_active: boolean
  is_system: boolean
  quality_review_result?: string | null
  quality_review_reason?: string | null
  quality_reviewed_at?: Date | null
  quality_reviewed_by?: string | null
  created_at?: Date
  updated_at?: Date
}

type T2AgentPromptCreationAttributes = Optional<
  T2AgentPromptAttributes,
  'id' | 'is_active' | 'is_system'
>

export class T2AgentPrompt
  extends Model<T2AgentPromptAttributes, T2AgentPromptCreationAttributes>
  implements T2AgentPromptAttributes
{
  declare id: string
  declare name: string
  declare description: string | null
  declare system_prompt: string
  declare threshold: number
  declare max_output_tokens: number
  declare is_active: boolean
  declare is_system: boolean
  declare quality_review_result?: string | null
  declare quality_review_reason?: string | null
  declare quality_reviewed_at?: Date | null
  declare quality_reviewed_by?: string | null
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initT2AgentPromptModel(sequelize: Sequelize): typeof T2AgentPrompt {
  T2AgentPrompt.init(
    {
      id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name:             { type: DataTypes.STRING(255), allowNull: false },
      description:      { type: DataTypes.TEXT,        allowNull: true },
      system_prompt:    { type: DataTypes.TEXT,        allowNull: false },
      threshold:        { type: DataTypes.REAL,        allowNull: false, defaultValue: 0.72 },
      max_output_tokens:{ type: DataTypes.INTEGER,     allowNull: false, defaultValue: 10240 },
      is_active:              { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
      is_system:              { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
      quality_review_result:  { type: DataTypes.STRING(20),  allowNull: true },
      quality_review_reason:  { type: DataTypes.TEXT,        allowNull: true },
      quality_reviewed_at:    { type: DataTypes.DATE,        allowNull: true },
      quality_reviewed_by:    { type: DataTypes.UUID,        allowNull: true },
    },
    {
      sequelize,
      tableName:   't2_agent_prompts',
      modelName:   'T2AgentPrompt',
      timestamps:  true,
      underscored: true,
    }
  )
  return T2AgentPrompt
}
