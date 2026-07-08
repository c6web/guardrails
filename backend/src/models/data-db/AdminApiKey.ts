import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

type UUID = string

interface AdminApiKeyAttributes {
  id: UUID
  name: string
  description: string | null
  key_prefix: string
  key_hash: string
  key_value: string | null
  owner_user_id: UUID
  status: 'active' | 'revoked'
  created_at?: Date
  updated_at?: Date
}

type AdminApiKeyCreationAttributes = Optional<
  AdminApiKeyAttributes,
  'id' | 'key_value' | 'status'
>

export class AdminApiKey
  extends Model<AdminApiKeyAttributes, AdminApiKeyCreationAttributes>
  implements AdminApiKeyAttributes
{
  declare id: UUID
  declare name: string
  declare description: string | null
  declare key_prefix: string
  declare key_hash: string
  declare key_value: string | null
  declare owner_user_id: UUID
  declare status: 'active' | 'revoked'
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initAdminApiKeyModel(sequelize: Sequelize): typeof AdminApiKey {
  AdminApiKey.init(
    {
      id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name:        { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      key_prefix:  { type: DataTypes.STRING(10), allowNull: false, unique: true },
      key_hash: { type: DataTypes.STRING(64), allowNull: false },
      key_value: { type: DataTypes.TEXT, allowNull: true },
      owner_user_id: { type: DataTypes.UUID, allowNull: false },
      status: {
        type: DataTypes.ENUM('active', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
    },
    {
      sequelize,
      tableName: 'admin_api_keys',
      modelName: 'AdminApiKey',
      timestamps: true,
      underscored: true,
    }
  )
  return AdminApiKey
}
