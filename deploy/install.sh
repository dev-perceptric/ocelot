#!/usr/bin/env bash
# Sets up Ocelot on the Hostinger VPS the same way as PulseARR and the other apps (deploy/README.md, steps 1 to 5):
#   /docker/sb-ocelot         Ocelot's own Supabase stack (Postgres, GoTrue, PostgREST, Storage, Envoy gateway)
#   /docker/sb-public-ocelot  db.joinocelot.com through Traefik
#   /docker/ocelot-migrate    runs new supabase/migrations files from main
#   /docker/ocelot-web        joinocelot.com (image from ghcr.io, kept current by autodeploy)
#   /docker/ocelot-jobs       a private copy of the app that runs the hourly job board work (same; half a CPU core)
#   /docker/ocelot-worker     the background worker; calls ocelot-jobs hourly (same)
#   /docker/ocelot-backup     nightly database dump to /opt/backups/ocelot
#   /docker/ocelot-move       the one-time data move from Supabase Cloud (step 6)
# Run as root in hPanel's browser terminal:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/dev-perceptric/ocelot/main/deploy/install.sh)
#
# Safe to run again: it keeps every .env, secret and database that already exists and only fills in what's missing.
set -euo pipefail

REPO=https://github.com/dev-perceptric/ocelot
D=/docker
SB=$D/sb-ocelot
REF_SB=${REF_SB:-$D/sb-arrowsterr}

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
ask() { local a; read -rp "$1 [y/N] " a; [[ "$a" =~ ^[Yy] ]]; }
set_env() {  # set_env FILE KEY VALUE: replaces the line if it's there, adds it if not
  local file=$1 key=$2 value=$3
  touch "$file"
  if grep -q "^$key=" "$file"; then
    awk -v k="$key" -v v="$value" 'BEGIN { FS = OFS = "=" } $1 == k { print k "=" v; next } { print }' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}
add_env() { grep -q "^$2=" "$1" 2>/dev/null || printf '%s=%s\n' "$2" "$3" >> "$1"; }  # only if missing
get_env() { grep "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- || true; }
psql_sb() { docker exec -i sb-ocelot-db-1 sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At "$@"' psql "$@"; }

[ "$(id -u)" = 0 ] || die "Run this as root."

say "0. Checks"
free -m | sed -n 1,2p
avail=$(awk '/MemAvailable/ { printf "%d", $2 / 1024 }' /proc/meminfo)
if [ ! -d "$SB" ] && [ "$avail" -lt 1500 ]; then
  warn "Only ${avail} MB available. Ocelot uses about 1.2 GB."
  ask "Continue anyway?" || exit 1
fi
for f in /opt/sb/files/db/webhooks.sql /opt/sb/files/db/roles.sql /opt/sb/files/db/jwt.sql /opt/sb/files/api/envoy/envoy.yaml \
  /opt/sb/files/api/envoy/cds.yaml /opt/sb/files/api/envoy/lds.template.yaml /opt/sb/files/api/envoy/docker-entrypoint.sh; do
  [ -f "$f" ] || die "Missing $f, which every sb-<app> stack shares. Compare with $REF_SB/docker-compose.yml before going on."
done
echo "Shared Supabase files are in place."

say "1. Ocelot's files"
SRC=$(mktemp -d)
trap 'rm -rf "$SRC"' EXIT
git clone -q --depth 1 "$REPO" "$SRC"
for p in sb-ocelot sb-public-ocelot ocelot-migrate ocelot-web ocelot-jobs ocelot-worker ocelot-backup ocelot-move; do
  mkdir -p "$D/$p"
  # Every file from the repo folder; .env files are never in the repo, so existing ones stay.
  cp -r "$SRC/deploy/$p/." "$D/$p/"
done
mkdir -p /opt/backups/ocelot
migrations=$(ls "$SRC/supabase/migrations" | grep -cE '^[0-9]{3}_.*\.sql$')
echo "Copied. $migrations migrations in the repo."

say "2. Supabase stack: $SB"
if [ ! -s "$SB/.env" ]; then
  docker run --rm -v "$SB:/w:ro" node:22-alpine node /w/make-keys.mjs > "$SB/.env"
  # Match the other stacks' key format: drop the opaque keys if sb-arrowsterr doesn't use them.
  if [ -f "$REF_SB/.env" ] && ! grep -q '^PUBLISHABLE_KEY=.\+' "$REF_SB/.env"; then
    sed -i '/^PUBLISHABLE_KEY=/d; /^SECRET_KEY=/d' "$SB/.env"
  fi
  echo "New secrets made for Ocelot only."
else
  echo "Keeping the existing secrets."
fi
add_env "$SB/.env" GOOGLE_ENABLED false
add_env "$SB/.env" GOOGLE_CLIENT_ID ""
add_env "$SB/.env" GOOGLE_SECRET ""
resend=$(get_env "$SB/.env" RESEND_API_KEY)
if [ -z "$resend" ]; then
  read -rsp "Resend API key for joinocelot.com (typed, not shown; Enter to skip for now): " resend; echo
  set_env "$SB/.env" RESEND_API_KEY "$resend"
fi
chmod 600 "$SB/.env"
if [ -f "$REF_SB/.env" ]; then
  missing=$(comm -23 <(grep -oE '^[A-Z_]+=' "$REF_SB/.env" | sort -u) <(grep -oE '^[A-Z_]+=' "$SB/.env" | sort -u) | tr -d '=' | tr '\n' ' ')
  [ -n "$missing" ] && warn "$REF_SB/.env has names Ocelot's doesn't: $missing(check whether sb-ocelot needs them)."
fi
(cd "$SB" && docker compose up -d --quiet-pull)

printf 'Waiting for the database and Storage'
for i in $(seq 1 60); do
  if psql_sb -c "select to_regclass('storage.buckets') is not null" 2>/dev/null | grep -q t; then break; fi
  [ "$i" = 60 ] && { echo; (cd "$SB" && docker compose ps); die "Not ready after 5 minutes: cd $SB && docker compose logs --tail 50"; }
  printf '.'; sleep 5
done
echo " ready."

say "3. db.joinocelot.com"
(cd "$D/sb-public-ocelot" && docker compose up -d --quiet-pull)
echo "Started. Traefik gets the certificate once db.joinocelot.com points at this server."

say "4. Migrations"
set_env "$D/ocelot-migrate/.env" PGPASSWORD "$(get_env "$SB/.env" POSTGRES_PASSWORD)"
chmod 600 "$D/ocelot-migrate/.env"
(cd "$D/ocelot-migrate" && docker compose up -d --quiet-pull)
printf 'Applying %s migrations' "$migrations"
for i in $(seq 1 90); do
  done_n=$(psql_sb -c "select count(*) from ops.schema_migrations" 2>/dev/null || echo 0)
  [ "$done_n" -ge "$migrations" ] && break
  if docker logs ocelot-migrate-migrate-1 2>&1 | tail -5 | grep -q 'FAILED'; then
    echo; docker logs --tail 30 ocelot-migrate-migrate-1; die "A migration failed (above)."
  fi
  [ "$i" = 90 ] && { echo; docker logs --tail 30 ocelot-migrate-migrate-1; die "Still not done after 15 minutes (logs above)."; }
  printf '.'; sleep 10
done
echo " all applied."

say "5. App, worker and backups"
SERVICE=$(get_env "$SB/.env" SERVICE_ROLE_KEY)
ANON=$(get_env "$SB/.env" ANON_KEY)
W=$D/ocelot-web/.env
set_env "$W" NEXT_PUBLIC_SUPABASE_URL https://db.joinocelot.com
set_env "$W" NEXT_PUBLIC_SUPABASE_ANON_KEY "$ANON"
set_env "$W" NEXT_PUBLIC_SITE_URL https://joinocelot.com
set_env "$W" SUPABASE_SERVICE_ROLE_KEY "$SERVICE"
set_env "$W" RESEND_API_KEY "$resend"
add_env "$W" EMAIL_FROM "Ocelot <hello@joinocelot.com>"
add_env "$W" STRIPE_SECRET_KEY ""
add_env "$W" STRIPE_WEBHOOK_SECRET ""
K=$D/ocelot-worker/.env
set_env "$K" SUPABASE_URL https://db.joinocelot.com
set_env "$K" SUPABASE_SERVICE_ROLE_KEY "$SERVICE"
set_env "$K" SITE_URL https://joinocelot.com
set_env "$K" RESEND_API_KEY "$resend"
add_env "$K" EMAIL_FROM "Ocelot <hello@joinocelot.com>"
set_env "$D/ocelot-backup/.env" PGPASSWORD "$(get_env "$SB/.env" POSTGRES_PASSWORD)"
# ocelot-jobs is the same app with no public address, so it gets the same settings.
cp "$W" "$D/ocelot-jobs/.env"
chmod 600 "$W" "$K" "$D/ocelot-jobs/.env" "$D/ocelot-backup/.env"
(cd "$D/ocelot-backup" && docker compose up -d --quiet-pull)

images_ok=true
for img in ocelot-web ocelot-worker; do
  docker pull -q "ghcr.io/dev-perceptric/$img:latest" >/dev/null 2>&1 || images_ok=false
done
if $images_ok; then
  # ocelot-jobs first: it creates the network the worker joins.
  (cd "$D/ocelot-jobs" && docker compose up -d)
  (cd "$D/ocelot-web" && docker compose up -d)
  (cd "$D/ocelot-worker" && docker compose up -d)
  echo "Web and worker started."
else
  warn "The images aren't on ghcr.io yet, or this server can't read them. Web and worker start once they are (see the end)."
fi

say "6. autodeploy"
# autodeploy's project list sits in its compose file as a base64 script: decode it, add Ocelot's projects, encode it.
AD=$D/autodeploy/docker-compose.yml
old=$(grep -oE 'echo [A-Za-z0-9+/=]{100,}' "$AD" 2>/dev/null | head -1 | cut -d' ' -f2 || true)
if [ -z "$old" ]; then
  warn "Couldn't read the project list in $AD. Add 'ocelot-web ocelot-jobs ocelot-worker' to it by hand."
else
  script=$(echo "$old" | base64 -d)
  list=$(grep -m1 -E '^\s*for p in ' <<<"$script")
  newlist=$list
  for p in ocelot-web ocelot-jobs ocelot-worker; do
    grep -qw -- "$p" <<<"$newlist" || newlist=$(sed "s/; do\$/ $p; do/" <<<"$newlist")
  done
  if [ "$newlist" = "$list" ]; then
    echo "Ocelot is already on the autodeploy list."
  else
    cp "$AD" "$AD.bak-ocelot"
    new=$(awk -v a="$list" -v b="$newlist" '$0 == a { print b; next } { print }' <<<"$script" | base64 -w0)
    sed -i "s|$old|$new|" "$AD"
    echo "$new" | base64 -d | grep -m1 'for p in'
    (cd "$D/autodeploy" && docker compose up -d) >/dev/null 2>&1 && echo "Added and restarted autodeploy (backup: $AD.bak-ocelot)." \
      || warn "Added; restart autodeploy by hand: cd $D/autodeploy && docker compose up -d"
  fi
fi

say "Done on the server."
echo "Memory now:"; free -m | sed -n 2p
echo
echo "In GitHub (https://github.com/dev-perceptric/ocelot/settings/variables/actions), set the variable:"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY = $ANON"
echo "(It's public: it's built into the pages.) Also NEXT_PUBLIC_SUPABASE_URL = https://db.joinocelot.com."
$images_ok || echo "Then run Actions > Check and deploy > Run workflow. autodeploy starts web, jobs and worker within 5 minutes of the images landing."
echo
echo "Next: move the data from Supabase Cloud (deploy/README.md step 6): cd $D/ocelot-move && bash move-from-cloud.sh"
