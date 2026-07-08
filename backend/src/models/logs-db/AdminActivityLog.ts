import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface AdminActivityLogAttributes {
  id: string
  admin_id: string
  admin_email: string
  action: string
  target_type: string
  target_id: string | null
  before_state: object | null
  after_state: object | null
  ip_address: string
  created_at?: Date
}

type AdminActivityLogCreationAttributes = Optional<
  AdminActivityLogAttributes,
  'id' | 'target_id' | 'before_state' | 'after_state'
>

export class AdminActivityLog
  extends Model<AdminActivityLogAttributes, AdminActivityLogCreationAttributes>
  implements AdminActivityLogAttributes
{
  declare id: string
  declare admin_id: string
  declare admin_email: string
  declare action: string
  declare target_type: string
  declare target_id: string | null
  declare before_state: object | null
  declare after_state: object | null
  declare ip_address: string
  declare readonly created_at: Date
}

export function initAdminActivityLogModel(sequelize: Sequelize): typeof AdminActivityLog {
  AdminActivityLog.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      admin_id: { type: DataTypes.UUID, allowNull: false },
      admin_email: { type: DataTypes.STRING(255), allowNull: false },
      action: { type: DataTypes.STRING(100), allowNull: false },
      target_type: { type: DataTypes.STRING(100), allowNull: false },
      target_id: { type: DataTypes.STRING(255), allowNull: true },
      before_state: { type: DataTypes.JSONB, allowNull: true },
      after_state: { type: DataTypes.JSONB, allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: false },
    },
    {
      sequelize,
      tableName: 'admin_activity_logs',
      modelName: 'AdminActivityLog',
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  )
  return AdminActivityLog
}
