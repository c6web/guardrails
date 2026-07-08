import type { Sequelize} from 'sequelize';
import { DataTypes, Model } from 'sequelize'

interface PasswordPolicyAttributes {
  id: number
  max_age_days: number | null
  grace_period_days: number
  min_length: number
  require_uppercase: boolean
  require_lowercase: boolean
  require_numbers: boolean
  require_symbols: boolean
  created_at?: Date
  updated_at?: Date
}

export class PasswordPolicy extends Model<PasswordPolicyAttributes> implements PasswordPolicyAttributes {
  declare id: number
  declare max_age_days: number | null
  declare grace_period_days: number
  declare min_length: number
  declare require_uppercase: boolean
  declare require_lowercase: boolean
  declare require_numbers: boolean
  declare require_symbols: boolean
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initPasswordPolicyModel(sequelize: Sequelize): typeof PasswordPolicy {
  PasswordPolicy.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: false,
      },
      max_age_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
      },
      grace_period_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 7,
      },
      min_length: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 8,
      },
      require_uppercase: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      require_lowercase: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      require_numbers: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      require_symbols: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      tableName: 'password_policies',
      modelName: 'PasswordPolicy',
      timestamps: true,
      underscored: true,
    }
  )
  return PasswordPolicy
}
