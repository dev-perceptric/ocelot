#!/usr/bin/env bash
# One-time move of Ocelot's data from Supabase Cloud to the self-hosted Supabase on the VPS (docs/setup.md, "6. Move
# the data"). Run on the server in /docker/ocelot after the new Supabase is up and before the app takes traffic:
#
#   export CLOUD_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
#   export CLOUD_URL='https://<ref>.supabase.co' CLOUD_SERVICE_KEY='<cloud secret key>'
#   bash ops/vps/move-from-cloud.sh
#
# It copies sign-ins (auth.users, auth.identities), every table in public, and the files in the resumes and logos
# buckets, then compares row counts. Sessions don't move: everyone signs in again once. It never changes the cloud
# project. Run it on an empty new database: it empties public's tables first.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${CLOUD_DB_URL:?Set CLOUD_DB_URL (Supabase dashboard -> Connect -> Session pooler)}"
: "${CLOUD_URL:?Set CLOUD_URL (https://<ref>.supabase.co)}"
: "${CLOUD_SERVICE_KEY:?Set CLOUD_SERVICE_KEY (the cloud project secret key)}"
DB_CONTAINER="${DB_CONTAINER:-sb-ocelot-db-1}"
NEW_URL="${NEW_URL:-http://127.0.0.1:8400}"
NEW_SERVICE_KEY="${NEW_SERVICE_KEY:-$(grep '^SERVICE_ROLE_KEY=' /docker/sb-ocelot/.env | cut -d= -f2-)}"
NEW_PUBLIC_URL="${NEW_PUBLIC_URL:-https://db.joinocelot.com}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# The new database as its superuser, with the container's own password.
new_db() {
  docker exec -i "$DB_CONTAINER" sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"' psql "$@"
}
# The cloud database, with a client of the same major version as the cloud server.
cloud_major=$(docker run --rm -e CLOUD_DB_URL postgres:17-alpine sh -c 'psql "$CLOUD_DB_URL" -At -c "show server_version_num"' | cut -c1-2)
cloud() { docker run --rm -i -e CLOUD_DB_URL "postgres:${cloud_major}-alpine" sh -c "$1"; }
echo "Cloud Postgres $cloud_major, new Postgres $(new_db -At -c 'show server_version_num' | cut -c1-2)."

echo "1/5 Tables on the new database"
bash scripts/migrate-vps.sh

echo "2/5 Dumping from the cloud"
cloud 'pg_dump "$CLOUD_DB_URL" --data-only --no-owner --no-privileges -t auth.users -t auth.identities' > "$WORK/auth.sql"
cloud 'pg_dump "$CLOUD_DB_URL" --data-only --no-owner --no-privileges --schema=public' > "$WORK/public.sql"
# Settings a newer pg_dump writes that an older server doesn't know.
sed -i '/^SET transaction_timeout/d' "$WORK/auth.sql" "$WORK/public.sql"

echo "3/5 Loading into the new database"
tables=$(new_db -At -c "select string_agg(format('%I.%I', schemaname, tablename), ', ') from pg_tables where schemaname = 'public'")
{
  echo "set session_replication_role = replica;"
  echo "truncate $tables cascade;"
  cat "$WORK/auth.sql" "$WORK/public.sql"
  echo "update public.orgs set logo_url = replace(logo_url, '$CLOUD_URL', '$NEW_PUBLIC_URL') where logo_url like '$CLOUD_URL%';"
} | new_db --single-transaction

echo "4/5 Copying résumé and logo files"
docker run --rm --network host -e CLOUD_URL -e CLOUD_SERVICE_KEY -e NEW_URL="$NEW_URL" -e NEW_SERVICE_KEY="$NEW_SERVICE_KEY" \
  -v "$PWD/ops/vps:/w:ro" node:22-alpine node /w/copy-storage.mjs resumes logos

echo "5/5 Row counts (cloud, new)"
count_sql="select 'auth.users', count(*) from auth.users union all select 'auth.identities', count(*) from auth.identities"
for t in $(new_db -At -c "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  count_sql="$count_sql union all select 'public.$t', count(*) from public.\"$t\""
done
echo "$count_sql;" | cloud 'psql "$CLOUD_DB_URL" -At -F " "' | sort > "$WORK/cloud.txt"
echo "$count_sql;" | new_db -At -F ' ' | sort > "$WORK/new.txt"
join "$WORK/cloud.txt" "$WORK/new.txt" | awk '{ flag = ($2 == $3) ? "" : "  <- differs"; printf "%-40s %8s %8s%s\n", $1, $2, $3, flag; bad += ($2 != $3) } END { exit bad > 0 }' \
  && echo "Done: every table matches." || { echo "Some tables differ. Read the lines marked above before going live." >&2; exit 1; }
