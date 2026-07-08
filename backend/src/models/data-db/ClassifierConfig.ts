import type { Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface ClassifierConfigAttributes {
  id: number          // always 1 — singleton row
  primary_id:  string | null
  backup1_id:  string | null
  backup2_id:  string | null
  confidence_threshold: number
  system_prompt: string
}

export class ClassifierConfig
  extends Model<ClassifierConfigAttributes>
  implements ClassifierConfigAttributes
{
  declare id: number
  declare primary_id:  string | null
  declare backup1_id:  string | null
  declare backup2_id:  string | null
  declare confidence_threshold: number
  declare system_prompt: string
}

export function initClassifierConfigModel(sequelize: Sequelize): typeof ClassifierConfig {
  ClassifierConfig.init(
    {
      id:         { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      primary_id: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
      backup1_id: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
      backup2_id: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
      confidence_threshold: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.65 },
      system_prompt:       { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    },
    {
      sequelize,
      tableName:  'classifier_config',
      modelName:  'ClassifierConfig',
      timestamps: false,
    }
  )
  return ClassifierConfig
}

export async function getOrCreateConfig(): Promise<ClassifierConfig> {
  const [cfg] = await ClassifierConfig.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, primary_id: null, backup1_id: null, backup2_id: null, confidence_threshold: 0.65, system_prompt: '' },
  })
  return cfg
}
