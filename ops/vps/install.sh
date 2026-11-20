#!/usr/bin/env bash
# Sets up Ocelot on the VPS in one go (docs/setup.md, steps 0 and 3 to 5): Ocelot's own Supabase in /docker/sb-ocelot,
# the app folder /docker/ocelot with its .env, a deploy user and key for GitHub Actions, and the Caddy sites.
# Run as root in hPanel's browser terminal:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/dev-perceptric/ocelot/main/ops/vps/install.sh)
#
# Safe to run again: it keeps what already exists (secrets, data, keys) and only fills in what's missing.
# It asks for the Resend key (typed, not shown). At the end it prints what goes into GitHub.
set -euo pipefail

REPO=https://github.com/dev-perceptric/ocelot
SB=/docker/sb-ocelot
APP=/docker/ocelot
FROM_SB=${FROM_SB:-/docker/sb-capybaroar}
PORTS="3400 3410 4400 5440 6550 8400 8401 8410"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
ask() { local a; read -rp "$1 [y/N] " a; [[ "$a" =~ ^[Yy] ]]; }
# Sets KEY=value in an env file, replacing the line if it's there.
set_env() {
  local file=$1 key=$2 value=$3
  if grep -q "^$key=" "$file"; then
    awk -v k="$key" -v v="$value" 'BEGIN { FS = OFS = "=" } $1 == k { print k "=" v; next } { print }' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}
get_env() { grep "^$2=" "$1" | head -1 | cut -d= -f2-; }

[ "$(id -u)" = 0 ] || die "Run this as root."

say "0. Room on the server"
free -h | sed -n 1,2p
avail_gb=$(awk '/MemAvailable/ { printf "%d", $2 / 1048576 }' /proc/meminfo)
if [ ! -d "$SB" ] && [ "$avail_gb" -lt 4 ]; then
  echo "Only ${avail_gb} GB free. Ocelot's Supabase and app need about 3.5 GB. Moving the VPS to KVM 4 in hPanel avoids slowing the other sites."
  ask "Continue anyway?" || exit 1
fi
if [ ! -d "$SB" ]; then
  for p in $PORTS; do
    ss -tln | awk '{ print $4 }' | grep -qE "[:.]$p\$" && die "Port $p is already in use. Change it in ops/vps/sb-ocelot.override.yml, compose.yaml and Caddyfile.ocelot first."
  done
fi
command -v rsync >/dev/null || apt-get install -y -qq rsync >/dev/null
command -v git >/dev/null || apt-get install -y -qq git >/dev/null

say "1. Ocelot's code"
SRC=$(mktemp -d)
trap 'rm -rf "$SRC"' EXIT
git clone -q --depth 1 "$REPO" "$SRC"
mkdir -p "$APP"
rsync -a --relative "$SRC/./compose.yaml" "$SRC/./scripts/" "$SRC/./supabase/migrations/" "$SRC/./ops/" "$APP/"

say "2. Ocelot's Supabase in $SB"
if [ ! -f "$SB/docker-compose.yml" ]; then
  [ -f "$FROM_SB/docker-compose.yml" ] || die "Can't find $FROM_SB to copy Supabase from. Set FROM_SB to another stack's folder."
  mkdir -p "$SB"
  cp "$FROM_SB/docker-compose.yml" "$FROM_SB/.env" "$SB/"
  rsync -a --exclude 'db/data' --exclude 'storage' "$FROM_SB/volumes/" "$SB/volumes/"
  # Fresh secrets: never share Capybaroar's.
  docker run --rm -v "$APP/ops/vps:/w:ro" node:22-alpine node /w/supabase-keys.mjs > "$SB/.keys"
  while IFS='=' read -r k v; do set_env "$SB/.env" "$k" "$v"; done < "$SB/.keys"
  rm -f "$SB/.keys"
  echo "Copied from $FROM_SB with new secrets."
else
  echo "Already there; keeping its secrets and data."
fi
for kv in SITE_URL=https://joinocelot.com API_EXTERNAL_URL=https://db.joinocelot.com SUPABASE_PUBLIC_URL=https://db.joinocelot.com \
  ADDITIONAL_REDIRECT_URLS=https://joinocelot.com/auth/callback STUDIO_DEFAULT_PROJECT=Ocelot POOLER_TENANT_ID=ocelot \
  ENABLE_EMAIL_AUTOCONFIRM=false SMTP_HOST=smtp.resend.com SMTP_PORT=465 SMTP_USER=resend \
  SMTP_ADMIN_EMAIL=hello@joinocelot.com SMTP_SENDER_NAME=Ocelot; do
  set_env "$SB/.env" "${kv%%=*}" "${kv#*=}"
done
resend=$(get_env "$APP/.env" RESEND_API_KEY 2>/dev/null || true)
if [ -z "$resend" ]; then
  read -rsp "Resend API key for joinocelot.com (typed, not shown; Enter to skip for now): " resend; echo
fi
set_env "$SB/.env" SMTP_PASS "$resend"   # empty until a key is given: never another product's
chmod 600 "$SB/.env"
cp "$APP/ops/vps/sb-ocelot.override.yml" "$SB/docker-compose.override.yml"
(cd "$SB" && docker compose up -d --quiet-pull)

ANON=$(get_env "$SB/.env" ANON_KEY)
SERVICE=$(get_env "$SB/.env" SERVICE_ROLE_KEY)
printf 'Waiting for Supabase'
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON" http://127.0.0.1:8400/auth/v1/health || true)
  [ "$code" = 200 ] && break
  [ "$i" = 60 ] && { echo; (cd "$SB" && docker compose ps); die "Supabase didn't come up in 5 minutes. Read: cd $SB && docker compose logs --tail 50"; }
  printf '.'; sleep 5
done
echo " up."
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^sb-ocelot-db' | head -1)
[ -n "$DB_CONTAINER" ] || die "Can't find Ocelot's database container (expected sb-ocelot-db-1)."
(cd "$APP" && DB_CONTAINER="$DB_CONTAINER" bash scripts/migrate-vps.sh)

say "3. The app's settings in $APP/.env"
touch "$APP/.env"
set_env "$APP/.env" NEXT_PUBLIC_SUPABASE_URL https://db.joinocelot.com
set_env "$APP/.env" NEXT_PUBLIC_SITE_URL https://joinocelot.com
set_env "$APP/.env" SUPABASE_SERVICE_ROLE_KEY "$SERVICE"
[ -n "$resend" ] && set_env "$APP/.env" RESEND_API_KEY "$resend"
grep -q '^EMAIL_FROM=' "$APP/.env" || echo 'EMAIL_FROM=Ocelot <hello@joinocelot.com>' >> "$APP/.env"
grep -q '^STRIPE_SECRET_KEY=' "$APP/.env" || printf 'STRIPE_SECRET_KEY=\nSTRIPE_WEBHOOK_SECRET=\n' >> "$APP/.env"
[ "$DB_CONTAINER" = sb-ocelot-db-1 ] || set_env "$APP/.env" DB_CONTAINER "$DB_CONTAINER"
chmod 600 "$APP/.env"

say "4. Deploy user and key for GitHub Actions"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy >/dev/null
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
KEY=/root/.ocelot-deploy-key
if [ ! -f "$KEY" ]; then
  docker run --rm -v /root:/k alpine:3.20 sh -c 'apk add -q openssh-keygen && ssh-keygen -q -t ed25519 -N "" -C ocelot-deploy -f /k/.ocelot-deploy-key'
fi
chmod 600 "$KEY"
touch /home/deploy/.ssh/authorized_keys
grep -qF "$(cut -d' ' -f2 "$KEY.pub")" /home/deploy/.ssh/authorized_keys || cat "$KEY.pub" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy "$APP"

say "5. Caddy"
CADDY=/etc/caddy/Caddyfile
if grep -q 'joinocelot.com' "$CADDY"; then
  echo "Ocelot's sites are already in $CADDY."
else
  cp "$CADDY" "$CADDY.before-ocelot"
  printf '\n' >> "$CADDY"; cat "$APP/ops/vps/Caddyfile.ocelot" >> "$CADDY"
  if caddy validate --config "$CADDY" >/dev/null 2>&1; then
    systemctl reload caddy && echo "Added and reloaded."
  else
    cp "$CADDY.before-ocelot" "$CADDY"
    caddy validate --config "$CADDY" 2>&1 | tail -5
    die "Caddy didn't accept the new sites, so $CADDY is back as it was."
  fi
fi

say "Done on the server. Put these into GitHub:"
echo "https://github.com/dev-perceptric/ocelot/settings/secrets/actions"
echo
echo "Secret VPS_SSH_KEY (copy everything from BEGIN to END, both lines included):"
cat "$KEY"
echo
echo "Secret VPS_KNOWN_HOSTS:"
echo "45.90.109.7 $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
echo
echo "Variables tab:"
echo "  VPS_HOST = 45.90.109.7"
echo "  NEXT_PUBLIC_SUPABASE_URL = https://db.joinocelot.com"
echo "  NEXT_PUBLIC_SITE_URL = https://joinocelot.com"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY = $ANON"
echo
echo "The ANON key is public (it's built into the pages). Keep VPS_SSH_KEY only in GitHub."
echo "Next: the data move from Supabase Cloud (docs/setup.md, step 6): bash $APP/ops/vps/move-from-cloud.sh"
