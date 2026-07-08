import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface NetworkAclListAttributes {
  id: string
  name: string
  description?: string | null
  list_type: 'allowlist' | 'blocklist'
  created_at?: Date
  updated_at?: Date
}

type NetworkAclListCreationAttributes = Optional<
  NetworkAclListAttributes,
  'id' | 'description' | 'created_at' | 'updated_at'
>

export class NetworkAclList
  extends Model<NetworkAclListAttributes, NetworkAclListCreationAttributes>
  implements NetworkAclListAttributes
{
  declare id: string
  declare name: string
  declare description: string | null
  declare list_type: 'allowlist' | 'blocklist'
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initNetworkAclListModel(sequelize: Sequelize): typeof NetworkAclList {
  NetworkAclList.init(
    {
      id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name:        { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      list_type:   { type: DataTypes.STRING(20),  allowNull: false },
    },
    {
      sequelize,
      tableName:   'network_acl_lists',
      modelName:   'NetworkAclList',
      timestamps:  true,
      underscored: true,
    }
  )
  return NetworkAclList
}
