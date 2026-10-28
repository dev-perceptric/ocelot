#!/usr/bin/env bash
# Writes src/lib/database.types.ts from the migrations: builds a throwaway database, then asks the Supabase CLI
# for its types. Needs a local Postgres (DATABASE_URL) and Docker. CI fails if the checked-in file is out of date.
#   DATABASE_URL=postgres://postgres@localhost/postgres npm run types
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN="${DATABASE_URL:-postgres://postgres@localhost/postgres}"
DB="ocelot_types_$$"
psql "$ADMIN" -qX -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
trap 'psql "$ADMIN" -qX -c "drop database if exists $DB" >/dev/null' EXIT
URL="${ADMIN%/*}/$DB"
psql "$URL" -qX -v ON_ERROR_STOP=1 -f tests/db/supabase_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do psql "$URL" -qX -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
npx -y supabase@2.122.0 gen types typescript --db-url "$URL" --schema public 2>/dev/null > src/lib/database.types.ts
