import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface NotificationServerAttributes {
  id: string
  name: string
  description: string | null
  type: string
  config: Record<string, unknown>
  is_default: boolean
  created_at?: Date
  updated_at?: Date
}

type NotificationServerCreationAttributes = Optional<
  NotificationServerAttributes,
  'id' | 'is_default'
>

export class NotificationServer
  extends Model<NotificationServerAttributes, NotificationServerCreationAttributes>
  implements NotificationServerAttributes
{
  declare id: string
  declare name: string
  declare description: string | null
  declare type: string
  declare config: Record<string, unknown>
  declare is_default: boolean
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initNotificationServerModel(sequelize: Sequelize): typeof NotificationServer {
  NotificationServer.init(
    {
      id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name:        { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT,        allowNull: true },
      type:        { type: DataTypes.STRING(50),  allowNull: false },
      config:      { type: DataTypes.JSONB,       allowNull: false, defaultValue: {} },
      is_default:  { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      tableName:   'notification_servers',
      modelName:   'NotificationServer',
      timestamps:  true,
      underscored: true,
    }
  )
  return NotificationServer
}
