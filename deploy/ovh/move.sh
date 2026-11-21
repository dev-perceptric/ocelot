#!/bin/bash
# Moves every running app from the Hostinger VPS to the OVH server. Run on Hostinger, as root.
#
#   curl -fsSL https://raw.githubusercontent.com/dev-perceptric/ocelot/main/deploy/ovh/move.sh -o /root/move.sh
#   bash /root/move.sh key       # once: a key so Hostinger can log in to OVH. Prints one line to run on OVH.
#   bash /root/move.sh copy      # copies everything while the apps keep running, gets the images ready on OVH.
#                                # Changes nothing here. Safe to run again.
#   bash /root/move.sh cutover   # 5-15 minutes of downtime: stops the apps here, copies the last changes,
#                                # starts them on OVH and tests every site on OVH before any DNS change.
#   bash /root/move.sh test      # tests every site on OVH again
#   bash /root/move.sh rollback  # stops the apps on OVH and starts them here again (switch DNS back too)
#
# Everything is logged to /root/move/move.log. Only apps running right now move; stopped ones (Ocelot,
# autodeploy, the one-off magpie jobs) are copied but stay stopped on OVH too.
set -uo pipefail
NEW=149.56.19.140
OLD=45.90.109.7
KEY=/root/.ssh/move_ed25519
DIR=/root/move
LIST=$DIR/projects.txt
PATHS="/docker /opt/sb /opt/blazed-kitty /opt/backups /opt/supabase-move"
HOSTS="blazedkitty.com www.blazedkitty.com
morningtelos.com www.morningtelos.com chat.morningtelos.com db.morningtelos.com
capybaroar.com www.capybaroar.com app.capybaroar.com db.capybaroar.com
app.arrowsterr.com db.arrowsterr.com
app.tryclaritia.com db.tryclaritia.com
app.tryomniscient.com db.tryomniscient.com
app.magpiereply.com agent.magpiereply.com db.magpiereply.com
app.pulsearr.com db.pulsearr.com"

mkdir -p "$DIR"
exec > >(tee -a "$DIR/move.log") 2>&1
echo; echo "===== move.sh ${1:-} $(date -u '+%F %T') UTC ====="
step() { echo; echo "== $*"; }
die() { echo "STOPPED: $*"; exit 1; }
SSHOPT="-i $KEY -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o BatchMode=yes"
on_new() { ssh $SSHOPT root@$NEW "$@"; }
rs() { rsync -aHAX --numeric-ids --delete -e "ssh $SSHOPT" "$@"; }

# The part that runs on OVH: pull images, start or stop the apps in a safe order.
REMOTE='
LIST=/root/move/projects.txt
ordered() { grep "/traefik$" $LIST; grep "/sb-" $LIST | grep -v "/sb-public"; grep -vE "/traefik$|/sb-" $LIST; grep "/sb-public" $LIST; }
case $1 in
  pull) for d in $(ordered); do echo "-- $d"; (cd $d && docker compose pull -q 2>&1 | tail -n 3); done ;;
  start)
    failed=""
    for d in $(ordered); do
      echo "-- starting $d"
      out=$(cd $d && docker compose up -d 2>&1) || failed="$failed $d"
      echo "$out" | tail -n 2
    done
    for d in $failed; do
      echo "-- trying again: $d"; sleep 5
      (cd $d && docker compose up -d 2>&1 | tail -n 3) || echo "FAILED: $d"
    done ;;
  stop) for d in $(ordered | tac); do echo "-- stopping $d"; (cd $d && docker compose stop -t 60 >/dev/null 2>&1); done ;;
  running) docker ps -q | wc -l ;;
esac
'
remote() { on_new "bash -s -- $1" <<<"$REMOTE"; }

save_list() {
  # Every compose project that has a running container right now (its folder).
  local now
  now=$(docker ps --format '{{.Label "com.docker.compose.project.working_dir"}}' | grep -v '^$' | sort -u)
  if [ -n "$now" ]; then echo "$now" > "$LIST"; fi
  [ -s "$LIST" ] || die "no running apps found and no saved list at $LIST"
  echo "$(wc -l < "$LIST") apps: $(xargs -n1 basename < "$LIST" | tr '\n' ' ')"
}

test_sites() {  # test_sites <ip>: the HTTP code each site answers with at that address
  local ip=$1 h code
  for h in $HOSTS; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 --resolve "$h:443:$ip" "https://$h/")
    printf '%-26s %s\n' "$h" "$code"
  done
}

copy_files() {
  step "Copying app folders, settings and the ghcr.io login"
  for p in $PATHS; do
    [ -e "$p" ] || continue
    on_new "mkdir -p $p" && rs "$p/" "root@$NEW:$p/" && echo "copied $p"
  done
  on_new "mkdir -p /root/.docker /root/move"
  [ -f /root/.docker/config.json ] && rs /root/.docker/config.json "root@$NEW:/root/.docker/config.json" && echo "copied ghcr.io login"
  for f in /etc/cron.d/docker-builder-prune /etc/cron.d/docker-image-prune; do
    [ -f "$f" ] && rs "$f" "root@$NEW:$f" && echo "copied $f"
  done
  rs "$LIST" "root@$NEW:$LIST"
}

copy_volumes() {
  step "Copying Docker volumes (databases, uploads, certificates)"
  on_new "systemctl stop docker.socket docker" || die "couldn't stop Docker on OVH"
  rs --exclude backingFsBlockDev /var/lib/docker/volumes/ "root@$NEW:/var/lib/docker/volumes/" || { on_new "systemctl start docker"; die "volume copy failed"; }
  on_new "systemctl start docker" || die "Docker didn't start on OVH"
  echo "volumes copied: $(du -sh /var/lib/docker/volumes | cut -f1)"
}

copy_missing_images() {
  # Images that couldn't be pulled (built here, or their tag is gone) are copied over exactly as they are.
  step "Copying images that couldn't be pulled"
  local n=0 ref id
  while read -r ref id; do
    if ! on_new "docker image inspect -f . '$ref'" >/dev/null 2>&1; then
      echo "copying $ref"
      docker save "$id" | gzip -1 | on_new "gunzip | docker load -q >/dev/null && docker tag '$id' '$ref'" || echo "FAILED to copy $ref"
      n=$((n + 1))
    fi
  done < <(docker ps -a --filter label=com.docker.compose.project --format '{{.ID}}' \
           | xargs docker inspect -f '{{.Config.Image}} {{.Image}}' | sort -u)
  echo "$n copied"
}

check() {
  [ "$(id -u)" = 0 ] || die "run as root"
  command -v rsync >/dev/null || apt-get install -y -q rsync
  [ -f "$KEY" ] || die "run: bash /root/move.sh key"
  on_new true || die "can't log in to OVH as root. Did you run the line from 'move.sh key' on OVH?"
  on_new "docker version -f ." >/dev/null || die "Docker isn't ready on OVH. Run setup.sh there first."
}

case "${1:-}" in
  key)
    [ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N '' -C hostinger-move -f "$KEY"
    echo; echo "On OVH (ssh ubuntu@$NEW), paste this one line:"; echo
    echo "echo '$(cat "$KEY.pub")' | sudo tee -a /root/.ssh/authorized_keys"
    echo; echo "Then come back here and run: bash /root/move.sh copy" ;;

  copy)
    check
    [ -f "$DIR/cutover-done" ] && die "the cutover already happened. Copying again would overwrite newer data on OVH."
    [ "$(remote running)" = 0 ] || die "apps are already running on OVH. Nothing copied."
    step "Apps running here"; save_list
    step "How each site answers here (saved to compare after the move)"; test_sites "$OLD" | tee "$DIR/before.txt"
    copy_files
    copy_volumes
    step "Downloading images on OVH (the first time takes 10-20 minutes)"; remote pull
    copy_missing_images
    step "Done. Nothing was stopped here. When ready: bash /root/move.sh cutover" ;;

  cutover)
    check
    [ -f "$DIR/cutover-done" ] && [ "${FORCE:-}" != 1 ] && die "already done. Running it again would overwrite newer data on OVH."
    step "Apps running here"; save_list
    if docker ps -q --filter label=com.docker.compose.project | grep -q .; then
      test_sites "$OLD" > "$DIR/before.txt"
      docker ps --filter label=com.docker.compose.project --format '{{.Names}}' \
        | xargs docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' > "$DIR/restart-policies.txt"
    fi
    T0=$(date +%s)
    step "Stopping the apps here (Traefik stays up)"
    for d in $({ grep -v '/sb-' "$LIST"; grep '/sb-' "$LIST"; } | grep -v '/traefik$'); do echo "-- stopping $d"; (cd "$d" && docker compose stop -t 60 >/dev/null 2>&1); done
    # So a Hostinger reboot doesn't start them again next to OVH. rollback puts the old setting back.
    docker ps -a --filter label=com.docker.compose.project --format '{{.Names}}' | grep -v '^traefik' | xargs -r docker update --restart=no >/dev/null
    step "Making sure nothing runs on OVH yet"; remote stop
    copy_files
    copy_volumes
    copy_missing_images
    step "Starting the apps on OVH"; remote start
    echo "waiting 45 seconds for the apps to warm up"; sleep 45
    step "How each site answers on OVH (left: before, here; right: now, on OVH)"
    test_sites "$NEW" > "$DIR/after.txt"
    join <(sort "$DIR/before.txt") <(sort "$DIR/after.txt") | awk '{ok = ($2 == $3) ? "same" : "CHECK"; printf "%-26s %s  %s  %s\n", $1, $2, $3, ok}'
    step "Files on OVH that still mention the old IP ($OLD)"
    on_new "grep -rlF '$OLD' /docker /opt 2>/dev/null" || echo "none"
    touch "$DIR/cutover-done"
    step "Done in $(( ($(date +%s) - T0) / 60 )) minutes. Every app now runs on OVH."
    echo "Next: switch the DNS records to $NEW (list in deploy/ovh/README.md)."
    echo "If something is wrong: bash /root/move.sh rollback" ;;

  test)
    check
    step "How each site answers on OVH"; test_sites "$NEW" ;;

  rollback)
    check
    step "Stopping the apps on OVH"; remote stop
    step "Starting the apps here again"
    if [ -f "$DIR/restart-policies.txt" ]; then
      while read -r name policy; do docker update --restart="$policy" "${name#/}" >/dev/null; done < "$DIR/restart-policies.txt"
    fi
    for d in $(cat "$LIST"); do echo "-- starting $d"; (cd "$d" && docker compose up -d 2>&1 | tail -n 1); done
    rm -f "$DIR/cutover-done"
    sleep 30; step "How each site answers here"; test_sites "$OLD"
    echo "Point any DNS records you already changed back to $OLD." ;;

  *) sed -n '2,15p' "$0" ;;
esac
