import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface AuditLogAttributes {
  id: string
  actor_id: string | null
  actor_email: string
  action: string
  resource_type: string
  resource_id: string
  details: object
  ip_address: string
  created_at?: Date
}

type AuditLogCreationAttributes = Optional<AuditLogAttributes, 'id' | 'actor_id'>

export class AuditLog
  extends Model<AuditLogAttributes, AuditLogCreationAttributes>
  implements AuditLogAttributes
{
  declare id: string
  declare actor_id: string | null
  declare actor_email: string
  declare action: string
  declare resource_type: string
  declare resource_id: string
  declare details: object
  declare ip_address: string
  declare readonly created_at: Date
}

export function initAuditLogModel(sequelize: Sequelize): typeof AuditLog {
  AuditLog.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      actor_id: { type: DataTypes.UUID, allowNull: true },
      actor_email: { type: DataTypes.STRING(255), allowNull: false },
      action: { type: DataTypes.STRING(100), allowNull: false },
      resource_type: { type: DataTypes.STRING(100), allowNull: false },
      resource_id: { type: DataTypes.STRING(255), allowNull: false },
      details: { type: DataTypes.JSONB, allowNull: false },
      ip_address: { type: DataTypes.STRING(45), allowNull: false },
    },
    {
      sequelize,
      tableName: 'audit_logs',
      modelName: 'AuditLog',
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  )
  return AuditLog
}
