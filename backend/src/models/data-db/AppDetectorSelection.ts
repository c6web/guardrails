import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface AppDetectorSelectionAttributes {
  app_id: string
  detector_id: string
  created_at?: Date
  updated_at?: Date
}

type AppDetectorSelectionCreationAttributes = Optional<
  AppDetectorSelectionAttributes,
  'created_at' | 'updated_at'
>

export class AppDetectorSelection
  extends Model<AppDetectorSelectionAttributes, AppDetectorSelectionCreationAttributes>
  implements AppDetectorSelectionAttributes
{
  declare app_id: string
  declare detector_id: string
  declare readonly created_at: Date
  declare readonly updated_at: Date
}

export function initAppDetectorSelectionModel(sequelize: Sequelize): typeof AppDetectorSelection {
  AppDetectorSelection.init(
    {
      app_id:       { type: DataTypes.UUID, primaryKey: true },
      detector_id:  { type: DataTypes.UUID, primaryKey: true },
      created_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName:   'app_detector_selections',
      modelName:   'AppDetectorSelection',
      timestamps:  true,
      underscored: true,
    }
  )
  return AppDetectorSelection
}

