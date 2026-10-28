#!/usr/bin/env bash
# Access boundary tests: builds a throwaway database from every migration, then checks that no one sees
# or changes what they shouldn't. Needs a local Postgres you can reach as a superuser.
#   DATABASE_URL=postgres://postgres@localhost/postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN="${DATABASE_URL:-postgres://postgres@localhost/postgres}"
DB="ocelot_test_$$"
psql "$ADMIN" -qX -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
trap 'psql "$ADMIN" -qX -c "drop database if exists $DB" >/dev/null' EXIT
URL="${ADMIN%/*}/$DB"
psql "$URL" -qX -v ON_ERROR_STOP=1 -f tests/db/supabase_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do
  psql "$URL" -qX -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "FAILED: $f"; exit 1; }
done
psql "$URL" -qX -v ON_ERROR_STOP=1 -o /dev/null -f tests/db/boundaries.sql
