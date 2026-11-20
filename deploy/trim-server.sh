#!/bin/bash
# Lowers CPU use on the shared Hostinger VPS (KVM 2 is throttled when the 24-hour average stays above 30%).
# Safe to run again: every change is skipped when it's already there.
#
#   curl -fsSL https://raw.githubusercontent.com/dev-perceptric/ocelot/main/deploy/trim-server.sh -o /root/trim.sh
#   nohup bash /root/trim.sh > /dev/null 2>&1 &     # keeps going if the terminal disconnects
#   tail -f /root/trim.log                           # watch it (Ctrl+C stops watching, not the script)
#
# What it does, for every docker-compose.yml under /docker and /opt:
#   1. Backs the file up next to itself (docker-compose.yml.bak-<time>).
#   2. Health checks run once a week instead of every 5-30 seconds. They still run every 5 seconds for the first
#      5 minutes after a start (Traefik only routes to a container once its check passes), so stacks start as fast
#      as before and a slow start never leaves a site waiting a week. Docker never
#      restarts a container because a health check failed; restart: unless-stopped handles crashes either way.
#   3. Every PostgREST keeps idle database connections for 10 minutes instead of 30 seconds
#      (PGRST_DB_POOL_MAX_IDLETIME), so it stops opening new Postgres connections all the time.
#   4. Supabase Studio helpers (meta, studio) are set to scale: 0. Nothing the apps use needs them.
#   5. Checks each changed file with `docker compose config` and puts the backup back if it doesn't pass.
# Then for Ocelot: board discovery off (max_imported_jobs 10,000) and each job board syncs twice a week (84 hours).
# Then restarts each changed stack, one at a time, waiting for it to be healthy before the next.
# Traefik is edited but not restarted (every site goes through it); the change applies on its next restart.
set -u
TS=$(date +%Y%m%d-%H%M)
LOG=/root/trim.log
exec >>"$LOG" 2>&1
echo
echo "===== trim-server $TS ====="

FILES=$(ls /docker/*/docker-compose.yml /opt/*/docker-compose.yml 2>/dev/null)
[ -z "$FILES" ] && { echo "No compose files found under /docker or /opt."; exit 1; }

# start_interval needs Docker Engine 25 or newer. Without it, a weekly interval would leave containers "starting"
# for a week and block stacks that wait for a healthy database, so older engines get hourly checks instead.
ENGINE=$(docker version -f '{{.Server.Version}}' 2>/dev/null | cut -d. -f1)
if [ "${ENGINE:-0}" -ge 25 ]; then INTERVAL=168h; else INTERVAL=1h; fi
echo "Docker Engine $ENGINE: health checks every $INTERVAL"

for f in $FILES; do cp "$f" "$f.bak-$TS"; done

CHANGED=$(python3 - "$INTERVAL" $FILES <<'PY'
import re, sys

interval, files = sys.argv[1], sys.argv[2:]
indent = lambda s: len(s) - len(s.lstrip(" "))

def seconds(v):
    """'30s', '1m30s', '2m' -> seconds. Anything unreadable counts as 0, so it gets the 300s window."""
    v = v.split("#")[0].strip().strip("'\"")
    total, found = 0, False
    for num, unit in re.findall(r"(\d+(?:\.\d+)?)(h|ms|m|s)", v):
        found = True
        total += float(num) * {"h": 3600, "m": 60, "s": 1, "ms": 0.001}[unit]
    return total if found else 0

def fix_healthchecks(lines):
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = re.match(r"^(\s*)healthcheck:\s*$", line)
        if not m:
            i += 1
            continue
        base = len(m.group(1))
        j = i + 1
        block = []
        while j < len(lines) and (not lines[j].strip() or indent(lines[j]) > base):
            block.append(lines[j])
            j += 1
        keys = [b for b in block if b.strip() and not b.strip().startswith("#")]
        if not keys or any(k.strip().startswith(("<<", "disable:")) for k in keys) or any('"NONE"' in k for k in keys):
            out.extend(block)
            i = j
            continue
        child = min(indent(k) for k in keys)
        pad = " " * child
        names = {k.strip().split(":")[0] for k in keys if indent(k) == child}
        new = []
        for b in block:
            s = b.strip()
            if s and indent(b) == child and s.startswith("interval:"):
                new.append(f"{pad}interval: {interval}\n")
            elif s and indent(b) == child and s.startswith("start_period:") and seconds(s.split(":", 1)[1]) < 300:
                new.append(f"{pad}start_period: 300s\n")
            else:
                new.append(b)
        # Add missing keys after the last line of the block that has content.
        last = max(n for n, b in enumerate(new) if b.strip())
        extra = []
        if "interval" not in names:
            extra.append(f"{pad}interval: {interval}\n")
        if "start_period" not in names:
            extra.append(f"{pad}start_period: 300s\n")
        if interval == "168h" and "start_interval" not in names:
            extra.append(f"{pad}start_interval: 5s\n")
        new[last + 1:last + 1] = extra
        out.extend(new)
        i = j
    return out

def add_pgrst_idle(lines):
    text = "".join(lines)
    if "PGRST_DB_URI" not in text or "PGRST_DB_POOL_MAX_IDLETIME" in text:
        return lines
    out = []
    for line in lines:
        out.append(line)
        s = line.strip()
        if s.startswith("PGRST_DB_URI:"):
            out.append(" " * indent(line) + "PGRST_DB_POOL_MAX_IDLETIME: 600\n")
        elif re.match(r"^-\s*PGRST_DB_URI=", s):
            out.append(" " * indent(line) + "- PGRST_DB_POOL_MAX_IDLETIME=600\n")
    return out

def scale_off(lines, names=("meta", "studio")):
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = re.match(r"^( {2,4})(\w[\w-]*):\s*$", line)
        if m and m.group(2) in names:
            base = len(m.group(1))
            j = i + 1
            block = []
            while j < len(lines) and (not lines[j].strip() or indent(lines[j]) > base):
                block.append(lines[j])
                j += 1
            keys = [b for b in block if b.strip()]
            # A service has an image or build; this skips same-named keys that aren't services.
            if keys and any(k.strip().startswith(("image:", "build:")) for k in keys):
                child = min(indent(k) for k in keys)
                if not any(indent(k) == child and k.strip().startswith("scale:") for k in keys):
                    out.append(" " * child + "scale: 0\n")
            out.extend(block)
            i = j
            continue
        i += 1
    return out

changed = []
for f in files:
    lines = open(f).read().splitlines(keepends=True)
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    new = fix_healthchecks(lines)
    new = add_pgrst_idle(new)
    if "/sb-" in f:
        new = scale_off(new)
    if new != lines:
        open(f, "w").write("".join(new))
        changed.append(f)
print(" ".join(changed))
PY
)

GOOD=""
for f in $CHANGED; do
  d=$(dirname "$f")
  if (cd "$d" && docker compose config -q 2>/tmp/trim-err); then
    echo "edited: $f"
    GOOD="$GOOD $d"
  else
    echo "RESTORED (didn't pass docker compose config): $f: $(head -n 2 /tmp/trim-err)"
    cp "$f.bak-$TS" "$f"
  fi
done

echo "== Ocelot: discovery off, boards sync twice a week"
docker exec sb-ocelot-db-1 psql -U postgres -c \
  "update app_settings set max_imported_jobs = least(max_imported_jobs, 10000) where id; update job_sources set sync_hours = 84 where sync_hours < 84;" \
  || echo "Ocelot settings not changed (is sb-ocelot-db-1 running?)"

wait_healthy() {
  for _ in $(seq 1 36); do
    states=$(docker compose ps --format '{{.Health}}' 2>/dev/null | grep -cE "starting|unhealthy")
    [ "$states" = "0" ] && return 0
    sleep 5
  done
  echo "  still not healthy after 3 minutes:"; docker compose ps --format '  {{.Name}} {{.Status}}'
}

# Supabase stacks first (Ocelot's last), then the apps. Traefik waits for its next restart.
ORDER=$(for d in $GOOD; do case "$d" in */sb-ocelot) echo "2 $d";; */sb-*) echo "1 $d";; *traefik*) ;; *) echo "3 $d";; esac; done | sort | cut -d' ' -f2)
for d in $ORDER; do
  echo "== restarting $d"
  (cd "$d" && docker compose up -d 2>&1 | tail -n 3 && wait_healthy)
  sleep 5
done
for d in $GOOD; do case "$d" in *traefik*) echo "edited, not restarted (applies on its next restart): $d";; esac; done

echo "== CPU by app after (share of one core; the server has 2)"
docker stats --no-stream --format "{{.Name}} {{.CPUPerc}} {{.MemUsage}}" | awk '{n=$1; sub(/^sb-public-/,"",n); sub(/^sb-/,"",n); split(n,a,"-"); app=a[1]; c=$2; sub(/%/,"",c); m=$3; v=m+0; if(m~/GiB/)v*=1024; else if(m~/KiB/)v/=1024; else if(m!~/MiB/)v/=1048576; cpu[app]+=c; mem[app]+=v; cnt[app]++; tc+=c; tm+=v} END{for(k in cpu) printf "%-14s %4d %7.1f %8.0f\n",k,cnt[k],cpu[k],mem[k]; printf "%-14s %4s %7.1f %8.0f\n","TOTAL","",tc,tm}' | sort -k3 -rn
echo "===== done. Backups: *.bak-$TS next to each file. ====="
