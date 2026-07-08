import { Sequelize } from 'sequelize'
import { env } from './env'

const shared = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  dialect: 'postgres' as const,
  logging: process.env.LOG_SQL === 'true' ? console.log : false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
}

const logsShared = {
  host: env.LOG_PG_HOST,
  port: env.LOG_PG_PORT,
  username: env.LOG_PG_USER,
  password: env.LOG_PG_PASSWORD,
  dialect: 'postgres' as const,
  logging: process.env.LOG_SQL === 'true' ? console.log : false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
}

export const sequelizeUsersDb = new Sequelize({ ...shared, database: env.DB_USERS })
export const sequelizeDataDb  = new Sequelize({ ...shared, database: env.DB_DATA })
export const sequelizeLogsDb = new Sequelize({ ...logsShared, database: env.LOG_PG_DB })
