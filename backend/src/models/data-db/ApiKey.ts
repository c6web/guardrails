import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'
import { ConnectedApp } from './ConnectedApp'

type UUID = string

interface ApiKeyAttributes {
  id: UUID
  name: string
  key_prefix: string
  key_hash: string
  key_encrypted: string | null
  app_id: UUID
  owner: string
  rotation_policy: string
  last_used_at: Date | null
  status: 'active' | 'rotate-due' | 'revoked'
  created_at?: Date
  updated_at?: Date
}

type ApiKeyCreationAttributes = Optional<
  ApiKeyAttributes,
  'id' | 'app_id' | 'last_used_at' | 'status' | 'key_encrypted'
>

export class ApiKey
  extends Model<ApiKeyAttributes, ApiKeyCreationAttributes>
  implements ApiKeyAttributes
{
  declare id: UUID
  declare name: string
  declare key_prefix: string
  declare key_hash: string
  declare key_encrypted: string | null
  declare app_id: UUID
  declare owner: string
  declare rotation_policy: string
  declare last_used_at: Date | null
  declare status: 'active' | 'rotate-due' | 'revoked'
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initApiKeyModel(sequelize: Sequelize): typeof ApiKey {
  ApiKey.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      key_prefix: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      key_hash: { type: DataTypes.STRING(64), allowNull: false },
      key_encrypted: { type: DataTypes.TEXT, allowNull: true },
      app_id: { type: DataTypes.UUID, allowNull: false },
      owner: { type: DataTypes.STRING(255), allowNull: false },
      rotation_policy: { type: DataTypes.STRING(50), allowNull: false },
      last_used_at: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.ENUM('active', 'rotate-due', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
    },
    {
      sequelize,
      tableName: 'api_keys',
      modelName: 'ApiKey',
      timestamps: true,
      underscored: true,
    }
  )
  return ApiKey
}

export function associateApiKey(): void {
  ApiKey.belongsTo(ConnectedApp, { foreignKey: 'app_id', as: 'app' })
}
