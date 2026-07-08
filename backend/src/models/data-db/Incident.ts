import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface IncidentAttributes {
  id: string
  title: string
  severity: string
  status: string
  framework_id: string | null
  description: string | null
  source_request_id: string | null
  affected_app_id: string | null
  affected_app_name: string | null
  source_ip: string | null
  detector: string | null
  confidence: number | null
  created_by: string | null
  resolved_by: string | null
  resolved_at: Date | null
  notes: string | null
  created_at?: Date
  updated_at?: Date
}

type IncidentCreationAttributes = Optional<
  IncidentAttributes,
  | 'id'
  | 'framework_id'
  | 'description'
  | 'source_request_id'
  | 'affected_app_id'
  | 'affected_app_name'
  | 'source_ip'
  | 'detector'
  | 'confidence'
  | 'created_by'
  | 'resolved_by'
  | 'resolved_at'
  | 'notes'
>

export class Incident
  extends Model<IncidentAttributes, IncidentCreationAttributes>
  implements IncidentAttributes
{
  declare id: string
  declare title: string
  declare severity: string
  declare status: string
  declare framework_id: string | null
  declare description: string | null
  declare source_request_id: string | null
  declare affected_app_id: string | null
  declare affected_app_name: string | null
  declare source_ip: string | null
  declare detector: string | null
  declare confidence: number | null
  declare created_by: string | null
  declare resolved_by: string | null
  declare resolved_at: Date | null
  declare notes: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  toJSON() {
    const raw: Record<string, unknown> = { ...this.dataValues }
    return {
      id:                raw.id,
      title:             raw.title,
      severity:          raw.severity,
      status:            raw.status,
      framework_id:      raw.framework_id ?? null,
      description:       raw.description ?? null,
      source_request_id: raw.source_request_id ?? null,
      affected_app_id:   raw.affected_app_id ?? null,
      affected_app_name: raw.affected_app_name ?? null,
      source_ip:         raw.source_ip ?? null,
      detector:          raw.detector ?? null,
      confidence:        raw.confidence ?? null,
      created_by:        raw.created_by ?? null,
      resolved_by:       raw.resolved_by ?? null,
      resolved_at:       raw.resolved_at ?? null,
      notes:             raw.notes ?? null,
      created_at:        raw.createdAt ?? null,
      updated_at:        raw.updatedAt ?? null,
    }
  }
}

export function initIncidentModel(sequelize: Sequelize): typeof Incident {
  Incident.init(
    {
      id:                { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      title:             { type: DataTypes.TEXT, allowNull: false },
      severity:          { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'med' },
      status:            { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
      framework_id:      { type: DataTypes.STRING(50), allowNull: true },
      description:       { type: DataTypes.TEXT, allowNull: true },
      source_request_id: { type: DataTypes.STRING(255), allowNull: true },
      affected_app_id:   { type: DataTypes.STRING(255), allowNull: true },
      affected_app_name: { type: DataTypes.STRING(255), allowNull: true },
      source_ip:         { type: DataTypes.STRING(64), allowNull: true },
      detector:          { type: DataTypes.STRING(255), allowNull: true },
      confidence:        { type: DataTypes.FLOAT, allowNull: true },
      created_by:        { type: DataTypes.STRING(255), allowNull: true },
      resolved_by:       { type: DataTypes.STRING(255), allowNull: true },
      resolved_at:       { type: DataTypes.DATE, allowNull: true },
      notes:             { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      tableName:   'incidents',
      modelName:   'Incident',
      timestamps:  true,
      underscored: true,
    }
  )
  return Incident
}
