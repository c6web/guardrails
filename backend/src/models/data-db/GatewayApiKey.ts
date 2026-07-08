import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export type GatewayKeyStatus = 'active' | 'superseded' | 'revoked'

interface GatewayApiKeyAttributes {
  id: string
  gateway_id: string
  key_hash: string
  key_encrypted: string
  key_prefix: string
  version: number
  status: GatewayKeyStatus
  grace_expires_at: Date | null
  created_at?: Date
  updated_at?: Date
}

type GatewayApiKeyCreationAttributes = Optional<
  GatewayApiKeyAttributes,
  'id' | 'grace_expires_at'
>

export class GatewayApiKey
  extends Model<GatewayApiKeyAttributes, GatewayApiKeyCreationAttributes>
  implements GatewayApiKeyAttributes
{
  declare id: string
  declare gateway_id: string
  declare key_hash: string
  declare key_encrypted: string
  declare key_prefix: string
  declare version: number
  declare status: GatewayKeyStatus
  declare grace_expires_at: Date | null
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initGatewayApiKeyModel(sequelize: Sequelize): typeof GatewayApiKey {
  GatewayApiKey.init(
    {
      id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      gateway_id:    { type: DataTypes.UUID, allowNull: false },
      key_hash:      { type: DataTypes.STRING(64), allowNull: false },
      key_encrypted: { type: DataTypes.TEXT, allowNull: false },
      key_prefix:    { type: DataTypes.STRING(20), allowNull: false, unique: true },
      version:       { type: DataTypes.INTEGER, allowNull: false },
      status: {
        type: DataTypes.ENUM('active', 'superseded', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
      grace_expires_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      tableName:  'gateway_api_keys',
      modelName:  'GatewayApiKey',
      timestamps: true,
      underscored: true,
    }
  )
  return GatewayApiKey
}
