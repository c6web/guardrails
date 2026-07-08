import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface ToolAuditLogAttributes {
  id: string
  request_id: string | null
  app_id: string
  app_name: string | null
  tool_name: string
  invocation_count: number
  approved: boolean | null
  violation_flag: boolean
  created_at?: Date
}

type ToolAuditLogCreationAttributes = Optional<
  ToolAuditLogAttributes,
  'id' | 'request_id' | 'app_name' | 'invocation_count' | 'approved' | 'violation_flag'
>

export class ToolAuditLog
  extends Model<ToolAuditLogAttributes, ToolAuditLogCreationAttributes>
  implements ToolAuditLogAttributes
{
  declare id: string
  declare request_id: string | null
  declare app_id: string
  declare app_name: string | null
  declare tool_name: string
  declare invocation_count: number
  declare approved: boolean | null
  declare violation_flag: boolean
  declare readonly created_at: Date
}

export function initToolAuditLogModel(sequelize: Sequelize): typeof ToolAuditLog {
  ToolAuditLog.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      request_id: { type: DataTypes.STRING(100), allowNull: true },
      app_id: { type: DataTypes.UUID, allowNull: false },
      app_name: { type: DataTypes.STRING(255), allowNull: true },
      tool_name: { type: DataTypes.STRING(128), allowNull: false },
      invocation_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      approved: { type: DataTypes.BOOLEAN, allowNull: true },
      violation_flag: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      tableName: 'tool_audit_log',
      modelName: 'ToolAuditLog',
      timestamps: true,
      updatedAt: false,
      underscored: true,
      indexes: [
        { fields: ['app_id', 'created_at'] },
        { fields: ['request_id'] },
      ],
    }
  )
  return ToolAuditLog
}
