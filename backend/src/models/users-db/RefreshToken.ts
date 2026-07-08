import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface RefreshTokenAttributes {
  id: string
  user_id: string
  token_hash: string
  expires_at: Date
  revoked: boolean
  created_at?: Date
}

type RefreshTokenCreationAttributes = Optional<RefreshTokenAttributes, 'id' | 'revoked'>

export class RefreshToken
  extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes>
  implements RefreshTokenAttributes
{
  declare id: string
  declare user_id: string
  declare token_hash: string
  declare expires_at: Date
  declare revoked: boolean
  declare readonly created_at: Date
}

export function initRefreshTokenModel(sequelize: Sequelize): typeof RefreshToken {
  RefreshToken.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false },
      token_hash: { type: DataTypes.STRING(64), allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      revoked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      tableName: 'refresh_tokens',
      modelName: 'RefreshToken',
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  )
  return RefreshToken
}
