#!/usr/bin/env bash
# Deploys Ocelot on the VPS: applies new database migrations, starts the new web app, waits for it to be healthy, then
# starts the worker. CI loads the images first and runs this in /docker/ocelot with TAG set to the commit.
# By hand: cd /docker/ocelot && TAG=<commit or latest> bash scripts/deploy-vps.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export TAG="${TAG:-latest}"

if [ ! -f .env ]; then
  echo ".env is missing in $(pwd). See docs/setup.md, \"4. The app on the VPS\"." >&2
  exit 1
fi

bash scripts/migrate-vps.sh

# Web first. The worker starts its hourly job right away, so it starts only once the new web app is healthy.
docker compose up -d --no-build web
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

docker compose up -d --no-build --remove-orphans worker

# Keep the 3 newest images of each, so an earlier commit can be started again with TAG=<sha>.
for repo in ocelot-web ocelot-worker; do
  docker images "$repo" --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' | sort -r | tail -n +4 | cut -f2 \
    | grep -v ":$TAG\$" | xargs -r docker rmi >/dev/null 2>&1 || true
done
docker compose ps
