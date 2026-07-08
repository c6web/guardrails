import type { Optional, Sequelize } from 'sequelize'
import { Model, DataTypes } from 'sequelize'

interface AccessRequestAttributes {
  id: string
  full_name: string
  email: string
  company: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: Date | null
}

type AccessRequestCreationAttributes = Optional<
  AccessRequestAttributes,
  'id' | 'company' | 'reason' | 'status' | 'admin_notes' | 'reviewed_by' | 'reviewed_at'
>

export class AccessRequest extends Model<AccessRequestAttributes, AccessRequestCreationAttributes> implements AccessRequestAttributes {
  declare id: string
  declare full_name: string
  declare email: string
  declare company: string | null
  declare reason: string | null
  declare status: 'pending' | 'approved' | 'rejected'
  declare admin_notes: string | null
  declare reviewed_by: string | null
  declare reviewed_at: Date | null
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initAccessRequestModel(sequelize: Sequelize): typeof AccessRequest {
  AccessRequest.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      full_name: { type: DataTypes.STRING(200), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false },
      company: { type: DataTypes.STRING(200), allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      admin_notes: { type: DataTypes.TEXT, allowNull: true },
      reviewed_by: { type: DataTypes.UUID, allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      tableName: 'access_requests',
      modelName: 'AccessRequest',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['email'] },
        { fields: ['status'] },
      ],
    }
  )
  return AccessRequest
}
