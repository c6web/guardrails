import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface AppThreatKnowledgeSelectionAttributes {
  app_id: string
  threat_knowledge_id: string
  created_at?: Date
  updated_at?: Date
}

type AppThreatKnowledgeSelectionCreationAttributes = Optional<
  AppThreatKnowledgeSelectionAttributes,
  'created_at' | 'updated_at'
>

export class AppThreatKnowledgeSelection
  extends Model<AppThreatKnowledgeSelectionAttributes, AppThreatKnowledgeSelectionCreationAttributes>
  implements AppThreatKnowledgeSelectionAttributes
{
  declare app_id: string
  declare threat_knowledge_id: string
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initAppThreatKnowledgeSelectionModel(sequelize: Sequelize): typeof AppThreatKnowledgeSelection {
  AppThreatKnowledgeSelection.init(
    {
      app_id:             { type: DataTypes.UUID, primaryKey: true },
      threat_knowledge_id: { type: DataTypes.UUID, primaryKey: true },
      created_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName:   'app_threat_knowledge_selections',
      modelName:   'AppThreatKnowledgeSelection',
      timestamps:  true,
      underscored: true,
    }
  )
  return AppThreatKnowledgeSelection
}

