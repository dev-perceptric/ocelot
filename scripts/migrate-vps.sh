#!/usr/bin/env bash
# Applies new files in supabase/migrations to Ocelot's self-hosted Supabase on the VPS, in name order, each in one
# transaction. Applied files are recorded in supabase_migrations.schema_migrations (the same table and version format
# the Supabase CLI uses: the part of the file name before the first "_").
# Runs on the server: deploy-vps.sh calls it before the new web app starts. By hand: bash scripts/migrate-vps.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB_CONTAINER="${DB_CONTAINER:-sb-ocelot-db-1}"

psql_db() {
  # Signs in as postgres with the container's own password, so no password lives in this repo or the app's .env.
  docker exec -i "$DB_CONTAINER" sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"' psql "$@"
}

psql_db <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
SQL

applied=$(psql_db -At -c "select version from supabase_migrations.schema_migrations")
count=0
for file in supabase/migrations/*.sql; do
  base=$(basename "$file" .sql)
  version="${base%%_*}"
  name="${base#*_}"
  if grep -qx -- "$version" <<<"$applied"; then continue; fi
  echo "Applying $base"
  {
    cat "$file"
    printf "\ninsert into supabase_migrations.schema_migrations (version, name) values ('%s', '%s');\n" "$version" "$name"
  } | psql_db --single-transaction
  count=$((count + 1))
done
echo "Migrations: $count applied."
