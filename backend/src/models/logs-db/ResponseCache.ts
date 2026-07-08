import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface ResponseCacheAttributes {
  id: string
  app_id: string
  request_hash: string
  model: string
  provider_id: string
  match_mode: string
  embedding: number[] | null
  system_prompt_hash: string | null
  end_user_id: string | null
  turn_index: number | null
  response_bytes: Buffer
  response_headers: unknown | null
  tokens_in: number
  tokens_out: number
  created_at: Date
  expires_at: Date
  hit_count: number
  last_hit_at: Date | null
}

type ResponseCacheCreationAttributes = Optional<
  ResponseCacheAttributes,
  | 'id'
  | 'match_mode'
  | 'embedding'
  | 'system_prompt_hash'
  | 'end_user_id'
  | 'turn_index'
  | 'response_headers'
  | 'created_at'
  | 'hit_count'
  | 'last_hit_at'
>

export class ResponseCache
  extends Model<ResponseCacheAttributes, ResponseCacheCreationAttributes>
  implements ResponseCacheAttributes
{
  declare id: string
  declare app_id: string
  declare request_hash: string
  declare model: string
  declare provider_id: string
  declare match_mode: string
  declare embedding: number[] | null
  declare system_prompt_hash: string | null
  declare end_user_id: string | null
  declare turn_index: number | null
  declare response_bytes: Buffer
  declare response_headers: unknown | null
  declare tokens_in: number
  declare tokens_out: number
  declare readonly created_at: Date
  declare expires_at: Date
  declare hit_count: number
  declare last_hit_at: Date | null
}

export function initResponseCacheModel(sequelize: Sequelize): typeof ResponseCache {
  ResponseCache.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      app_id: { type: DataTypes.UUID, allowNull: false },
      request_hash: { type: DataTypes.STRING(64), allowNull: false },
      model: { type: DataTypes.STRING(200), allowNull: false },
      provider_id: { type: DataTypes.UUID, allowNull: false },
      match_mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'exact' },
      embedding: { type: (DataTypes as any).VECTOR, allowNull: true },
      system_prompt_hash: { type: DataTypes.STRING(64), allowNull: true },
      end_user_id: { type: DataTypes.STRING(128), allowNull: true },
      turn_index: { type: DataTypes.INTEGER, allowNull: true },
      response_bytes: { type: DataTypes.BLOB('long'), allowNull: false },
      response_headers: { type: DataTypes.JSONB, allowNull: true },
      tokens_in: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      tokens_out: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      hit_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last_hit_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      tableName: 'response_cache',
      modelName: 'ResponseCache',
      timestamps: false,
      underscored: true,
    }
  )
  return ResponseCache
}
