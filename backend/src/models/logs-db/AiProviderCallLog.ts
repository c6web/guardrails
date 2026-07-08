import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface AiProviderCallLogAttributes {
  id: string | number
  request_id: string | null
  call_type: string
  source: string
  app_id: string | null
  app_name: string | null
  provider_id: string | null
  provider_name: string | null
  vendor: string | null
  model: string | null
  endpoint: string | null
  request_payload: string | null
  response_payload: string | null
  tokens_in: number | null
  tokens_out: number | null
  tokens_total: number | null
  duration_ms: number
  status_code: number | null
  success: boolean
  error_message: string | null
  triggered_by: string | null
  created_at?: Date
}

type AiProviderCallLogCreationAttributes = Optional<
  AiProviderCallLogAttributes,
  'id' | 'request_id' | 'app_id' | 'app_name' | 'provider_id' | 'provider_name' |
  'vendor' | 'model' | 'endpoint' | 'request_payload' | 'response_payload' |
  'tokens_in' | 'tokens_out' | 'tokens_total' | 'status_code' | 'error_message' | 'triggered_by'
>

export class AiProviderCallLog
  extends Model<AiProviderCallLogAttributes, AiProviderCallLogCreationAttributes>
  implements AiProviderCallLogAttributes
{
  declare id: string | number
  declare request_id: string | null
  declare call_type: string
  declare source: string
  declare app_id: string | null
  declare app_name: string | null
  declare provider_id: string | null
  declare provider_name: string | null
  declare vendor: string | null
  declare model: string | null
  declare endpoint: string | null
  declare request_payload: string | null
  declare response_payload: string | null
  declare tokens_in: number | null
  declare tokens_out: number | null
  declare tokens_total: number | null
  declare duration_ms: number
  declare status_code: number | null
  declare success: boolean
  declare error_message: string | null
  declare triggered_by: string | null
  declare readonly created_at: Date
}

export function initAiProviderCallLogModel(sequelize: Sequelize): typeof AiProviderCallLog {
  AiProviderCallLog.init(
    {
      id:               { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      request_id:       { type: DataTypes.STRING(100), allowNull: true },
      call_type:        { type: DataTypes.STRING(32),  allowNull: false },
      source:           { type: DataTypes.STRING(50),  allowNull: false, defaultValue: 'pipeline' },
      app_id:           { type: DataTypes.STRING(50),  allowNull: true },
      app_name:         { type: DataTypes.STRING(255), allowNull: true },
      provider_id:      { type: DataTypes.STRING(100), allowNull: true },
      provider_name:    { type: DataTypes.STRING(255), allowNull: true },
      vendor:           { type: DataTypes.STRING(50),  allowNull: true },
      model:            { type: DataTypes.STRING(200), allowNull: true },
      endpoint:         { type: DataTypes.STRING(500), allowNull: true },
      request_payload:  { type: DataTypes.TEXT, allowNull: true },
      response_payload: { type: DataTypes.TEXT, allowNull: true },
      tokens_in:        { type: DataTypes.INTEGER, allowNull: true },
      tokens_out:       { type: DataTypes.INTEGER, allowNull: true },
      tokens_total:     { type: DataTypes.INTEGER, allowNull: true },
      duration_ms:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status_code:      { type: DataTypes.SMALLINT, allowNull: true },
      success:          { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      error_message:    { type: DataTypes.TEXT, allowNull: true },
      triggered_by:     { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      sequelize,
      tableName: 'ai_provider_call_logs',
      modelName: 'AiProviderCallLog',
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  )
  return AiProviderCallLog
}
