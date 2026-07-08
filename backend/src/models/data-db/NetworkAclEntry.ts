import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface NetworkAclEntryAttributes {
  id: string
  list_id: string
  value: string
  entry_type: 'ip' | 'cidr' | 'host' | 'domain'
  note?: string | null
  enabled: boolean
  created_at?: Date
  updated_at?: Date
}

type NetworkAclEntryCreationAttributes = Optional<
  NetworkAclEntryAttributes,
  'id' | 'note' | 'enabled' | 'created_at' | 'updated_at'
>

export class NetworkAclEntry
  extends Model<NetworkAclEntryAttributes, NetworkAclEntryCreationAttributes>
  implements NetworkAclEntryAttributes
{
  declare id: string
  declare list_id: string
  declare value: string
  declare entry_type: 'ip' | 'cidr' | 'host' | 'domain'
  declare note: string | null
  declare enabled: boolean
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initNetworkAclEntryModel(sequelize: Sequelize): typeof NetworkAclEntry {
  NetworkAclEntry.init(
    {
      id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      list_id:    { type: DataTypes.UUID, allowNull: false },
      value:      { type: DataTypes.STRING(255), allowNull: false },
      entry_type: { type: DataTypes.STRING(20),  allowNull: false },
      note:       { type: DataTypes.TEXT,        allowNull: true  },
      enabled:    { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
    },
    {
      sequelize,
      tableName:   'network_acl_entries',
      modelName:   'NetworkAclEntry',
      timestamps:  true,
      underscored: true,
    }
  )
  return NetworkAclEntry
}
