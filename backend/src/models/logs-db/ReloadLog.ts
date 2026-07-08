import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface ReloadLogAttributes {
  id: string
  triggered_by: string
  key_prefix: string
  gateway_instance_id: string | null
  source_ip: string
  result: string
  error_message: string | null
  duration_ms: number
  created_at?: Date
}

type ReloadLogCreationAttributes = Optional<ReloadLogAttributes, 'id' | 'gateway_instance_id' | 'error_message'>

export class ReloadLog
  extends Model<ReloadLogAttributes, ReloadLogCreationAttributes>
  implements ReloadLogAttributes
{
  declare id: string
  declare triggered_by: string
  declare key_prefix: string
  declare gateway_instance_id: string | null
  declare source_ip: string
  declare result: string
  declare error_message: string | null
  declare duration_ms: number
  declare readonly created_at: Date
}

export function initReloadLogModel(sequelize: Sequelize): typeof ReloadLog {
  ReloadLog.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      triggered_by: { type: DataTypes.STRING(50), allowNull: false },
      key_prefix: { type: DataTypes.STRING(20), allowNull: false },
      gateway_instance_id: { type: DataTypes.STRING(100), allowNull: true },
      source_ip: { type: DataTypes.STRING(45), allowNull: false },
      result: { type: DataTypes.STRING(20), allowNull: false },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      duration_ms: { type: DataTypes.BIGINT, allowNull: false },
    },
    {
      sequelize,
      tableName: 'reload_logs',
      modelName: 'ReloadLog',
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  )
  return ReloadLog
}
