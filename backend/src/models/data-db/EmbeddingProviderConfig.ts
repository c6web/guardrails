import type { Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface EmbeddingProviderConfigAttributes {
  id: number          // always 1 — singleton row
  primary_id:  string | null
  backup1_id:  string | null
  backup2_id:  string | null
  dimensions:  number | null
  semantic_threshold: number
}

export class EmbeddingProviderConfig
  extends Model<EmbeddingProviderConfigAttributes>
  implements EmbeddingProviderConfigAttributes
{
  declare id: number
  declare primary_id:  string | null
  declare backup1_id:  string | null
  declare backup2_id:  string | null
  declare dimensions:  number | null
  declare semantic_threshold: number
}

export function initEmbeddingProviderConfigModel(sequelize: Sequelize): typeof EmbeddingProviderConfig {
  EmbeddingProviderConfig.init(
    {
      id:         { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      primary_id: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
      backup1_id: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
      backup2_id: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
      dimensions: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1024 },
      semantic_threshold: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.75 },
    },
    {
      sequelize,
      tableName:  'embedding_provider_config',
      modelName:  'EmbeddingProviderConfig',
      timestamps: false,
    }
  )
  return EmbeddingProviderConfig
}

export async function getOrCreateConfig(): Promise<EmbeddingProviderConfig> {
   const [cfg] = await EmbeddingProviderConfig.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, primary_id: null, backup1_id: null, backup2_id: null, dimensions: 1024, semantic_threshold: 0.75 },
  })
  return cfg
}
