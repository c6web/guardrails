import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface NotificationLogAttributes {
  id: string
  server_id: string | null
  server_name: string
  server_type: string
  recipient: string
  subject: string
  status: 'sent' | 'failed'
  error_message?: string | null
  message_id?: string | null
  triggered_by?: string | null
  created_at?: Date
}

type NotificationLogCreationAttributes = Optional<
  NotificationLogAttributes,
  'id' | 'error_message' | 'message_id' | 'triggered_by'
>

export class NotificationLog
  extends Model<NotificationLogAttributes, NotificationLogCreationAttributes>
  implements NotificationLogAttributes
{
  declare id: string
  declare server_id: string | null
  declare server_name: string
  declare server_type: string
  declare recipient: string
  declare subject: string
  declare status: 'sent' | 'failed'
  declare error_message: string | null
  declare message_id: string | null
  declare triggered_by: string | null
  declare readonly created_at: Date
}

export function initNotificationLogModel(sequelize: Sequelize): typeof NotificationLog {
  NotificationLog.init(
    {
      id:           { type: DataTypes.UUID,        defaultValue: DataTypes.UUIDV4, primaryKey: true },
      server_id:    { type: DataTypes.STRING(64),  allowNull: true },
      server_name:  { type: DataTypes.STRING(255), allowNull: false },
      server_type:  { type: DataTypes.STRING(50),  allowNull: false },
      recipient:    { type: DataTypes.STRING(255), allowNull: false },
      subject:      { type: DataTypes.STRING(500), allowNull: false },
      status:       { type: DataTypes.ENUM('sent', 'failed'), allowNull: false },
      error_message:{ type: DataTypes.TEXT,        allowNull: true },
      message_id:   { type: DataTypes.STRING(255), allowNull: true },
      triggered_by: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      sequelize,
      tableName:   'notification_logs',
      modelName:   'NotificationLog',
      timestamps:  true,
      updatedAt:   false,
      underscored: true,
    }
  )
  return NotificationLog
}
