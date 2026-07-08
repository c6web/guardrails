#!/usr/bin/env bash
set -e

# Wait for postgres to be ready
for i in $(seq 1 30); do
  if pg_isready -h ${DB_HOST:-postgres} -p ${DB_PORT:-5432} -U ${DB_USER:-c6admin}; then
    break
  fi
  sleep 1
done

# Create missing databases from the default DB
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-c6admin}
: ${DB_PASSWORD:?DB_PASSWORD is required}
DEFAULT_DB=ai_gateway_data

for db in ${DB_USERS} ${DB_LOGS}; do
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1 || \
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tc \
    "CREATE DATABASE $db" > /dev/null 2>&1 || true
done

# Run migrations and seeds. Both are tracked in-database (SequelizeMeta / SequelizeData),
# so re-running on every start is a no-op for already-applied files — no duplication.
echo "Running migrations and seeds (tracked, idempotent)..."
npm run migrate
npm run seed

exec "$@"
