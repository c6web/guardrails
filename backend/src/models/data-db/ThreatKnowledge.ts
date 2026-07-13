import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'
import { DetectionFramework } from './DetectionFramework'

export interface ThreatKnowledgeAttributes {
  id: string
  name: string
  description: string
  threat_context: string | null
  embedding: number[] | null
  embedding_at: Date | null
  created_by: string | null
  updated_by: string | null
  status?: string
  source?: string
  origin_request_id?: string | null
  quality_review_result?: string | null
  quality_review_reason?: string | null
  quality_reviewed_at?: Date | null
  quality_reviewed_by?: string | null
  created_at?: Date
  updated_at?: Date
}

type ThreatKnowledgeCreationAttributes = Optional<
  ThreatKnowledgeAttributes,
  'id' | 'threat_context' | 'embedding' | 'embedding_at' | 'created_by' | 'updated_by' |
  'status' | 'source' | 'origin_request_id'
>

export class ThreatKnowledge
  extends Model<ThreatKnowledgeAttributes, ThreatKnowledgeCreationAttributes>
  implements ThreatKnowledgeAttributes
{
  declare id: string
  declare name: string
  declare description: string
  declare threat_context: string | null
  declare embedding: number[] | null
  declare embedding_at: Date | null
  declare created_by: string | null
  declare updated_by: string | null
  declare status: string
  declare source: string
  declare origin_request_id: string | null
  declare quality_review_result: string | null
  declare quality_review_reason: string | null
  declare quality_reviewed_at: Date | null
  declare quality_reviewed_by: string | null
  declare readonly created_at: Date
  declare readonly updated_at: Date

  detectionFrameworks?: DetectionFramework[]
  declare getDetectionFrameworks: () => Promise<DetectionFramework[]>
  declare addDetectionFrameworks: (frameworks: DetectionFramework | DetectionFramework[]) => Promise<void>
  declare removeDetectionFrameworks: (frameworks: DetectionFramework | DetectionFramework[]) => Promise<void>
}

export function initThreatKnowledgeModel(sequelize: Sequelize): typeof ThreatKnowledge {
  ThreatKnowledge.init(
    {
      id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name:           { type: DataTypes.STRING(200), allowNull: false },
      description:    { type: DataTypes.TEXT, allowNull: false },
      threat_context: { type: DataTypes.TEXT, allowNull: true },
      embedding:         { type: (DataTypes as any).VECTOR, allowNull: true },
      embedding_at:      { type: DataTypes.DATE, allowNull: true },
      created_by:        { type: DataTypes.UUID, allowNull: true },
      updated_by:        { type: DataTypes.UUID, allowNull: true },
      status:            { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
      source:            { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'manual' },
      origin_request_id:     { type: DataTypes.TEXT, allowNull: true },
      quality_review_result: { type: DataTypes.STRING(20), allowNull: true },
      quality_review_reason: { type: DataTypes.TEXT, allowNull: true },
      quality_reviewed_at:   { type: DataTypes.DATE, allowNull: true },
      quality_reviewed_by:   { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      tableName:   'threat_knowledge',
      modelName:   'ThreatKnowledge',
      timestamps:  true,
      underscored: true,
    }
  )
  return ThreatKnowledge
}

export function associateThreatKnowledge(): void {
  ThreatKnowledge.belongsToMany(DetectionFramework, {
    through: 'framework_threat_knowledge',
    foreignKey: 'threat_knowledge_id',
    as: 'detectionFrameworks',
  })
}
