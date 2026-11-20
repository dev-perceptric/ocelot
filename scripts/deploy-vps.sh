#!/usr/bin/env bash
# Builds and restarts Ocelot on the VPS. GitHub Actions copies the code to /opt/ocelot and runs this there.
# By hand: cd /opt/ocelot && bash scripts/deploy-vps.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env is missing in $(pwd). See docs/setup.md, \"6. VPS\"." >&2
  exit 1
fi

docker compose build --pull

# Web first. The worker starts its hourly job right away, so it starts only once the new web app is healthy.
docker compose up -d web
for try in $(seq 1 36); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q web)")
  [ "$status" = "healthy" ] && break
  if [ "$try" = 36 ]; then
    echo "The web app didn't become healthy in 3 minutes." >&2
    docker compose logs --tail 80 web >&2
    exit 1
  fi
  sleep 5
done

docker compose up -d --remove-orphans worker
docker image prune -f >/dev/null
docker compose ps
