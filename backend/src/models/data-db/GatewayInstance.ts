import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface GatewayInstanceAttributes {
  id: string
  name: string
  description?: string | null
  location?: string | null
  url: string
  acl_list_id?: string | null
  default_firewall_mode: 'allow_all' | 'block_all'
  created_at?: Date
  updated_at?: Date
}

type GatewayInstanceCreationAttributes = Optional<
  GatewayInstanceAttributes,
  'id' | 'description' | 'location' | 'acl_list_id' | 'default_firewall_mode' | 'created_at' | 'updated_at'
>

export class GatewayInstance
  extends Model<GatewayInstanceAttributes, GatewayInstanceCreationAttributes>
  implements GatewayInstanceAttributes
{
  declare id: string
  declare name: string
  declare description: string | null
  declare location: string | null
  declare url: string
  declare acl_list_id: string | null
  declare default_firewall_mode: 'allow_all' | 'block_all'
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initGatewayInstanceModel(sequelize: Sequelize): typeof GatewayInstance {
  GatewayInstance.init(
    {
      id:                    { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name:                  { type: DataTypes.STRING(120), allowNull: false },
      description:           { type: DataTypes.TEXT,        allowNull: true  },
      location:              { type: DataTypes.STRING(120), allowNull: true  },
      url:                   { type: DataTypes.STRING(255), allowNull: false },
      acl_list_id:           { type: DataTypes.UUID,        allowNull: true  },
      default_firewall_mode: { type: DataTypes.STRING(20),  allowNull: false, defaultValue: 'allow_all' },
    },
    {
      sequelize,
      tableName:   'gateway_instances',
      modelName:   'GatewayInstance',
      timestamps:  true,
      underscored: true,
    }
  )
  return GatewayInstance
}
