import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'
import { DetectionFramework } from './DetectionFramework'

interface DetectorAttributes {
  id: string
  name: string
  description: string
  threshold: number
  keywords: string[] | null
  rule_type: string
  mode: string
  scanning_scope: string
  redaction_placeholder: string | null
  quality_review_result?: string | null
  quality_review_reason?: string | null
  quality_reviewed_at?: Date | null
  quality_reviewed_by?: string | null
  created_at?: Date
  updated_at?: Date
}

type DetectorCreationAttributes = Optional<DetectorAttributes, 'id' | 'rule_type' | 'mode' | 'scanning_scope' | 'redaction_placeholder'>

export class Detector
  extends Model<DetectorAttributes, DetectorCreationAttributes>
  implements DetectorAttributes
{
  declare id: string
  declare name: string
  declare description: string
  declare threshold: number
  declare keywords: string[] | null
  declare rule_type: string
  declare mode: string
  declare scanning_scope: string
  declare redaction_placeholder: string | null
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

export function initDetectorModel(sequelize: Sequelize): typeof Detector {
  Detector.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      description: { type: DataTypes.TEXT, allowNull: false },
      threshold: { type: DataTypes.FLOAT, allowNull: false },
      keywords: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true },
      rule_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'keyword' },
      mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'block' },
      scanning_scope: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'input' },
      redaction_placeholder: { type: DataTypes.STRING(255), allowNull: true, defaultValue: '[REDACTED]' },
      quality_review_result: { type: DataTypes.STRING(20), allowNull: true },
      quality_review_reason: { type: DataTypes.TEXT, allowNull: true },
      quality_reviewed_at:   { type: DataTypes.DATE, allowNull: true },
      quality_reviewed_by:   { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      tableName: 'detectors',
      modelName: 'Detector',
      timestamps: true,
      underscored: true,
    }
  )
  return Detector
}

export function associateDetector(): void {
  Detector.belongsToMany(DetectionFramework, {
    through: 'detector_framework_mapping',
    foreignKey: 'detector_id',
    as: 'detectionFrameworks',
  })
}
