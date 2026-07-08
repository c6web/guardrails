import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface EmbeddingLogAttributes {
  id: string
  request_id: string | null
  provider_id: string
  provider_name: string
  model: string | null
  input_chars: number
  input_text: string | null
  dimensions: number | null
  success: boolean
  error_message: string | null
  duration_ms: number
  source: string
  created_at?: Date
}

type EmbeddingLogCreationAttributes = Optional<
  EmbeddingLogAttributes,
  'id' | 'request_id' | 'model' | 'input_text' | 'dimensions' | 'error_message' | 'success'
>

export class EmbeddingLog
  extends Model<EmbeddingLogAttributes, EmbeddingLogCreationAttributes>
  implements EmbeddingLogAttributes
{
  declare id: string
  declare request_id: string | null
  declare provider_id: string
  declare provider_name: string
  declare model: string | null
  declare input_chars: number
  declare input_text: string | null
  declare dimensions: number | null
  declare success: boolean
  declare error_message: string | null
  declare duration_ms: number
  declare source: string
  declare readonly created_at: Date
}

export function initEmbeddingLogModel(sequelize: Sequelize): typeof EmbeddingLog {
  EmbeddingLog.init(
    {
      id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      request_id:    { type: DataTypes.STRING(100), allowNull: true },
      provider_id:   { type: DataTypes.STRING(100), allowNull: false },
      provider_name: { type: DataTypes.STRING(255), allowNull: false },
      model:         { type: DataTypes.STRING(200), allowNull: true },
      input_chars:   { type: DataTypes.INTEGER, allowNull: false },
      input_text:    { type: DataTypes.TEXT, allowNull: true },
      dimensions:    { type: DataTypes.INTEGER, allowNull: true },
      success:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      duration_ms:   { type: DataTypes.INTEGER, allowNull: false },
      source:        { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'pipeline' },
    },
    {
      sequelize,
      tableName: 'embedding_logs',
      modelName: 'EmbeddingLog',
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  )
  return EmbeddingLog
}
