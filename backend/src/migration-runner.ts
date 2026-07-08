import type { Sequelize, QueryInterface } from 'sequelize'
import { readdir } from 'fs/promises'
import { join } from 'path'

interface MigrationResult {
  file: string
  status: 'ok' | 'skipped' | 'error'
  message?: string
}

async function loadMigrations(dirPath: string): Promise<string[]> {
  try {
    const files = await readdir(dirPath)
    return files.filter(f => f.endsWith('.js')).sort()
  } catch {
    return []
  }
}

async function runMigrations(sequelize: Sequelize, migrationsDir: string): Promise<MigrationResult[]> {
  const results: MigrationResult[] = []
  
  // Get already executed migrations from SequelizeMeta
  const executed = new Set<string>()
  try {
    const queryInterface = sequelize.getQueryInterface() as QueryInterface
    const metaRows = await queryInterface.sequelize.query(
      'SELECT "name" FROM "SequelizeMeta" ORDER BY "name"',
      { type: 'SELECT' }
    )
    for (const row of (metaRows as any[])) {
      executed.add(row.name)
    }
  } catch {
    // SequelizeMeta doesn't exist yet — will be created on first migration
  }
  
  try {
    const files = await loadMigrations(migrationsDir)
    
    for (const file of files) {
      if (executed.has(file)) {
        results.push({ file, status: 'skipped', message: 'Already executed' })
        continue
      }
      
      try {
        const modulePath = join(migrationsDir, file)
        const migration = await import(modulePath)
        
        const queryInterface = sequelize.getQueryInterface() as QueryInterface
        
        if (migration.up) {
          await migration.up(queryInterface, sequelize.Sequelize)
        }
        
        // Mark as executed in SequelizeMeta
        try {
          await queryInterface.sequelize.query(
            'CREATE TABLE IF NOT EXISTS "SequelizeMeta" ("name" VARCHAR(255) PRIMARY KEY)'
          )
        } catch {}
        try {
          await queryInterface.sequelize.query(
            'INSERT INTO "SequelizeMeta" ("name") VALUES ($1) ON CONFLICT DO NOTHING',
            { bind: [file] }
          )
        } catch {
          // skip tracking
        }
        
        results.push({ file, status: 'ok', message: 'Executed successfully' })
} catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        
        // Check if error is idempotent (already exists)
        const idempotentPatterns = [
          /already exists/i,
          /duplicate.*constraint/i,
          /relation.*already exists/i,
          /column.*already exists/i,
          /table.*already exists/i,
          /index.*already exists/i,
          /sequence.*already exists/i,
        ]
        
        const isIdempotent = idempotentPatterns.some(pattern => pattern.test(errorMsg))
        
        if (isIdempotent) {
          results.push({ file, status: 'skipped', message: `Already exists: ${errorMsg}` })
        } else {
          results.push({ file, status: 'error', message: errorMsg })
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
    results.push({
      file: '*',
      status: 'error',
      message: `Cannot read migrations directory: ${migrationsDir}`
    })
  }
  
  return results
}

export async function runAllMigrations(sequelizeUsersDb: Sequelize, sequelizeDataDb: Sequelize, sequelizeLogsDb: Sequelize): Promise<void> {
  const migrationConfigs = [
    { db: sequelizeUsersDb, dir: join(__dirname, 'migrations', 'users-db') },
    { db: sequelizeDataDb, dir: join(__dirname, 'migrations', 'data-db') },
    { db: sequelizeLogsDb, dir: join(__dirname, 'migrations', 'logs-db') },
  ]
  
  let hasErrors = false
  
  for (const config of migrationConfigs) {
    try {
      const results = await runMigrations(config.db, config.dir)
      
      for (const r of results) {
        if (r.status === 'ok') {
          console.log(`[migration] ${config.dir}: ${r.file} — OK`)
        } else if (r.status === 'skipped') {
          console.log(`[migration] ${config.dir}: ${r.file} — SKIPPED`)
        } else {
          console.error(`[migration] ${config.dir}: ${r.file} — ERROR: ${r.message}`)
          hasErrors = true
        }
      }
} catch (err) {
      console.error(`[migration] Failed to run migrations from ${config.dir}:`, err instanceof Error ? err.message : String(err))
      hasErrors = true
    }
  }
  
  if (hasErrors) {
    console.warn('[migration] Some migrations failed — application started with partial migration state')
  } else {
    console.log('[migration] All migrations completed successfully')
  }
}
