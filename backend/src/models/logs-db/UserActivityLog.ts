import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface UserActivityLogAttributes {
  id: string
  user_id: string | null
  user_email: string
  activity_type: string
  details: object
  ip_address: string
  created_at?: Date
}

type UserActivityLogCreationAttributes = Optional<UserActivityLogAttributes, 'id' | 'user_id'>

export class UserActivityLog
  extends Model<UserActivityLogAttributes, UserActivityLogCreationAttributes>
  implements UserActivityLogAttributes
{
  declare id: string
  declare user_id: string | null
  declare user_email: string
  declare activity_type: string
  declare details: object
  declare ip_address: string
  declare readonly created_at: Date
}

export function initUserActivityLogModel(sequelize: Sequelize): typeof UserActivityLog {
  UserActivityLog.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: true },
      user_email: { type: DataTypes.STRING(255), allowNull: false },
      activity_type: { type: DataTypes.STRING(100), allowNull: false },
      details: { type: DataTypes.JSONB, allowNull: false },
      ip_address: { type: DataTypes.STRING(45), allowNull: false },
    },
    {
      sequelize,
      tableName: 'user_activity_logs',
      modelName: 'UserActivityLog',
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  )
  return UserActivityLog
}
