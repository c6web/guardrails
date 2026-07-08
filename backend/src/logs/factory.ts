import type { ILogStore } from './ILogStore'

export function createLogStore(): ILogStore {
  const driver = process.env['LOG_STORE_DRIVER'] ?? 'postgresql'

  switch (driver) {
    case 'postgresql': {
      const { PostgreSQLLogStore } = require('./adapters/postgresql')
      return new PostgreSQLLogStore()
    }
    default:
      throw new Error(`[LogStore] Unknown LOG_STORE_DRIVER: "${driver}". Valid values: postgresql`)
  }
}
