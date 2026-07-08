import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'
import { ThreatKnowledge } from './ThreatKnowledge'
import { Detector } from './Detector'

interface DetectionFrameworkAttributes {
  id: string
  framework_code: string
  name: string
  description: string
  display_order: number
  is_pii: boolean
  created_at?: Date
  updated_at?: Date
}

type DetectionFrameworkCreationAttributes = Optional<
  DetectionFrameworkAttributes,
  'display_order' | 'is_pii'
>

export class DetectionFramework
  extends Model<DetectionFrameworkAttributes, DetectionFrameworkCreationAttributes>
  implements DetectionFrameworkAttributes
{
  declare id: string
  declare framework_code: string
  declare name: string
  declare description: string
  declare display_order: number
  declare is_pii: boolean
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initDetectionFrameworkModel(sequelize: Sequelize): typeof DetectionFramework {
  DetectionFramework.init(
    {
      id:            { type: DataTypes.STRING(50), primaryKey: true },
      framework_code: { type: DataTypes.STRING(20), allowNull: false },
      name:          { type: DataTypes.STRING(255), allowNull: false },
      description:   { type: DataTypes.TEXT, allowNull: false },
      display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_pii:        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      tableName:   'detection_frameworks',
      modelName:   'DetectionFramework',
      timestamps:  true,
      underscored: true,
    }
  )
  return DetectionFramework
}

export function associateDetectionFramework(): void {
  DetectionFramework.belongsToMany(ThreatKnowledge, {
    through: 'framework_threat_knowledge',
    foreignKey: 'framework_id',
    as: 'threatKnowledgeEntries',
  })
  DetectionFramework.belongsToMany(Detector, {
    through: 'detector_framework_mapping',
    foreignKey: 'framework_id',
    as: 'detectors',
  })
}
