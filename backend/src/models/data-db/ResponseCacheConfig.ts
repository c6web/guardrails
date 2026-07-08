import type { Sequelize, Optional } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

export interface ResponseCacheConfigAttributes {
  id: number                  // always 1 — singleton row
  enabled: boolean
  exact_match_enabled: boolean
  semantic_match_enabled: boolean
  semantic_threshold: number
}

export interface ResponseCacheConfigCreationAttributes
  extends Optional<ResponseCacheConfigAttributes, 'id'> {}

export class ResponseCacheConfig
  extends Model<ResponseCacheConfigAttributes, ResponseCacheConfigCreationAttributes>
  implements ResponseCacheConfigAttributes
{
  declare id: number
  declare enabled: boolean
  declare exact_match_enabled: boolean
  declare semantic_match_enabled: boolean
  declare semantic_threshold: number
}

export function initResponseCacheConfigModel(sequelize: Sequelize): typeof ResponseCacheConfig {
  ResponseCacheConfig.init(
    {
      id:                   { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      enabled:              { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      exact_match_enabled:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      semantic_match_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      semantic_threshold:   { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0.97 },
    },
    {
      sequelize,
      tableName:  'response_cache_config',
      modelName:  'ResponseCacheConfig',
      timestamps: false,
      underscored: true,
    }
  )
  return ResponseCacheConfig
}

export async function getOrCreateConfig(): Promise<ResponseCacheConfig> {
   const [cfg] = await ResponseCacheConfig.findOrCreate({
    where: { id: 1 },
    defaults: {
      id: 1,
      enabled: false,
      exact_match_enabled: true,
      semantic_match_enabled: false,
      semantic_threshold: 0.97,
    },
  })
  return cfg
}
