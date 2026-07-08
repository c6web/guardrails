import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface AppPermissionAttributes {
  id: string
  app_id: string
  user_id: string
  user_email: string
  user_name: string
  created_at?: Date
  updated_at?: Date
}

type AppPermissionCreationAttributes = Optional<AppPermissionAttributes, 'id'>

export class AppPermission
  extends Model<AppPermissionAttributes, AppPermissionCreationAttributes>
  implements AppPermissionAttributes
{
  declare id: string
  declare app_id: string
  declare user_id: string
  declare user_email: string
  declare user_name: string
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initAppPermissionModel(sequelize: Sequelize): typeof AppPermission {
  AppPermission.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      app_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'connected_apps', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      user_email: { type: DataTypes.STRING(255), allowNull: false },
      user_name: { type: DataTypes.STRING(255), allowNull: false },
    },
    {
      sequelize,
      tableName: 'app_permissions',
      modelName: 'AppPermission',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['app_id', 'user_id'], unique: true },
      ],
    }
  )
  return AppPermission
}
