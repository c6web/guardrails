import type { Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface PasswordPolicyConfigAttributes {
  id: number
  min_length: number
  require_uppercase: boolean
  require_lowercase: boolean
  require_digit: boolean
  require_special: boolean
}

export class PasswordPolicyConfig
  extends Model<PasswordPolicyConfigAttributes>
  implements PasswordPolicyConfigAttributes
{
  declare id: number
  declare min_length: number
  declare require_uppercase: boolean
  declare require_lowercase: boolean
  declare require_digit: boolean
  declare require_special: boolean
}

export function initPasswordPolicyConfigModel(sequelize: Sequelize): typeof PasswordPolicyConfig {
  PasswordPolicyConfig.init(
    {
      id:                    { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      min_length:            { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
      require_uppercase:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      require_lowercase:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      require_digit:         { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      require_special:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      tableName:  'password_policy_config',
      modelName:  'PasswordPolicyConfig',
      timestamps: false,
    }
  )
  return PasswordPolicyConfig
}

export async function getOrCreatePasswordPolicy(): Promise<PasswordPolicyConfig> {
  const [cfg] = await PasswordPolicyConfig.findOrCreate({
    where: { id: 1 },
    defaults: {
      id: 1,
      min_length: 8,
      require_uppercase: false,
      require_lowercase: false,
      require_digit: false,
      require_special: false,
    },
  })
  return cfg
}
