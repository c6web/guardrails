import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface UserAttributes {
  id: string
  username: string
  display_name: string
  email: string
  password_hash: string
  group_id: string | null
  team: string | null
  otp_enabled: boolean
  otp_verified_at: Date | null
  otp_code_hash: string | null
  otp_expires_at: Date | null
  otp_attempts: number
  otp_locked_until: Date | null
  status: 'active' | 'dormant' | 'suspended'
  last_seen_at: Date | null
  password_changed_at: Date | null
  must_change_password: boolean
  password_grace_until: Date | null
  organization_id: string | null
}

type UserCreationAttributes = Optional<
  UserAttributes,
  'id' | 'display_name' | 'group_id' | 'team' | 'otp_enabled' | 'otp_verified_at' | 'otp_code_hash' | 'otp_expires_at' | 'otp_attempts' | 'otp_locked_until' | 'status' | 'last_seen_at' | 'password_changed_at' | 'must_change_password' | 'password_grace_until' | 'organization_id'
>

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string
  declare username: string
  declare display_name: string
  declare email: string
  declare password_hash: string
  declare group_id: string | null
  declare team: string | null
  declare otp_enabled: boolean
  declare otp_verified_at: Date | null
  declare otp_code_hash: string | null
  declare otp_expires_at: Date | null
  declare otp_attempts: number
  declare otp_locked_until: Date | null
  declare status: 'active' | 'dormant' | 'suspended'
  declare last_seen_at: Date | null
  declare password_changed_at: Date | null
  declare must_change_password: boolean
  declare password_grace_until: Date | null
  declare organization_id: string | null
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      username: { type: DataTypes.STRING(50), unique: true, allowNull: false },
      display_name: { type: DataTypes.STRING(100), unique: true, allowNull: false },
      email: { type: DataTypes.STRING(255), unique: true, allowNull: false },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      group_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'groups', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      team: { type: DataTypes.STRING(100), allowNull: true },
      otp_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      otp_verified_at: { type: DataTypes.DATE, allowNull: true },
      otp_code_hash: { type: DataTypes.STRING(64), allowNull: true },
      otp_expires_at: { type: DataTypes.DATE, allowNull: true },
      otp_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      otp_locked_until: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.ENUM('active', 'dormant', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
      },
      last_seen_at: { type: DataTypes.DATE, allowNull: true },
      password_changed_at: { type: DataTypes.DATE, allowNull: true },
      must_change_password: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      password_grace_until: { type: DataTypes.DATE, allowNull: true },
      organization_id: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      tableName: 'users',
      modelName: 'User',
      timestamps: true,
      underscored: true,
    }
  )
  return User
}

