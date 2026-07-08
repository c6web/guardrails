import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface GroupAttributes {
  id: string
  name: string
  role: 'admin' | 'viewer' | 'user' | 'knowledge_admin'
  is_default: boolean
  created_at?: Date
  updated_at?: Date
}

type GroupCreationAttributes = Optional<
  GroupAttributes,
  'id' | 'is_default' | 'created_at' | 'updated_at'
>

export class Group
  extends Model<GroupAttributes, GroupCreationAttributes>
  implements GroupAttributes
{
  declare id: string
  declare name: string
  declare role: 'admin' | 'viewer' | 'user'
  declare is_default: boolean
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initGroupModel(sequelize: Sequelize): typeof Group {
  Group.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      role: {
        type: DataTypes.ENUM('admin', 'viewer', 'user'),
        allowNull: false,
      },
      is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      tableName:   'groups',
      modelName:   'Group',
      timestamps:  true,
      underscored: true,
    }
  )
  return Group
}
