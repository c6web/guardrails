import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface ApiKeyVersionAttributes {
  id: string
  api_key_id: string
  key_hash: string
  key_prefix: string
  version: number
  status: 'active' | 'superseded' | 'revoked'
  grace_expires_at: Date | null
  created_at?: Date
  updated_at?: Date
}

type ApiKeyVersionCreationAttributes = Optional<
  ApiKeyVersionAttributes,
  'id' | 'grace_expires_at'
>

export class ApiKeyVersion
  extends Model<ApiKeyVersionAttributes, ApiKeyVersionCreationAttributes>
  implements ApiKeyVersionAttributes
{
  declare id: string
  declare api_key_id: string
  declare key_hash: string
  declare key_prefix: string
  declare version: number
  declare status: 'active' | 'superseded' | 'revoked'
  declare grace_expires_at: Date | null
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initApiKeyVersionModel(sequelize: Sequelize): typeof ApiKeyVersion {
  ApiKeyVersion.init(
    {
      id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      api_key_id:      { type: DataTypes.UUID, allowNull: false },
      key_hash:        { type: DataTypes.STRING(64), allowNull: false },
      key_prefix:      { type: DataTypes.STRING(20), allowNull: false, unique: true },
      version:         { type: DataTypes.INTEGER, allowNull: false },
      status:          {
        type: DataTypes.ENUM('active', 'superseded', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
      grace_expires_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      tableName: 'api_key_versions',
      modelName: 'ApiKeyVersion',
      timestamps: true,
      underscored: true,
    }
  )
  return ApiKeyVersion
}
