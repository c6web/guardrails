import type { Optional, Sequelize } from 'sequelize'
import { Model, DataTypes } from 'sequelize'

export interface OrgAttributes {
  id: string
  name: string
  description: string | null
  owner_user_id: string | null
  created_at?: Date
  updated_at?: Date
}

type OrgCreationAttributes = Optional<OrgAttributes, 'id' | 'description' | 'owner_user_id' | 'created_at' | 'updated_at'>

export class Organization extends Model<OrgAttributes, OrgCreationAttributes> implements OrgAttributes {
  declare id: string
  declare name: string
  declare description: string | null
  declare owner_user_id: string | null
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initOrganizationModel(sequelize: Sequelize): typeof Organization {
  Organization.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      owner_user_id: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      tableName: 'organizations',
      modelName: 'Organization',
      timestamps: true,
      underscored: true,
    }
  )
  return Organization
}
