# Running Ocelot on the Hostinger VPS

Ocelot runs on the shared Hostinger VPS (`45.90.109.7`) the same way as PulseARR, Arrowsterr and the other apps. It
changes a production server that runs the other apps, so read each step before running it. Every secret goes into a
`.env` file on the server (chmod 600), never into the repo, chat or a ticket.

Each folder here is one Docker Compose project in `/docker` on the server:

| Folder | What it is | Memory limit |
|---|---|---|
| `sb-ocelot/` | Ocelot's Supabase: Postgres 17, GoTrue, PostgREST, Storage, Envoy gateway (shared files in `/opt/sb/files`) | 512 + 128 + 128 + 256 + 128 MB |
| `sb-public-ocelot/` | `db.joinocelot.com` through Traefik to the gateway | 64 MB |
| `ocelot-migrate/` | Applies new `supabase/migrations/NNN_*.sql` from `main` every 2 minutes, recorded in `ops.schema_migrations` | 128 MB |
| `ocelot-web/` | `joinocelot.com` (and `www`), image `ghcr.io/dev-perceptric/ocelot-web`. Only serves visitors (`CRON_DISABLED=1`), with twice the default CPU weight | 768 MB |
| `ocelot-jobs/` | The same image with no public address: runs the hourly alerts and job board sync, discovery and logos, so that work never slows the site. At most half a CPU core | 1 GB |
| `ocelot-worker/` | The background worker, image `ghcr.io/dev-perceptric/ocelot-worker`. Calls `ocelot-jobs` hourly over the `ocelot-jobs` network | 256 MB |
| `ocelot-backup/` | Nightly `pg_dump` at 03:15 UTC into `/opt/backups/ocelot`, 14 days; copies to Backblaze B2 when set | 128 MB |
| `ocelot-move/` | The one-time data move from Supabase Cloud | runs once |
| `uptime/gatus-endpoint.yaml` | The health checks for the `uptime` project's Gatus | |

Real use is about 1.5 GB. `migrate.sh` and `backup.sh` are embedded in their compose files as base64, because
Hostinger's Docker manager can't place files next to a project: after editing one, run `build.sh` in its folder.

## 1. DNS (Namecheap, joinocelot.com, Advanced DNS)

- `A` `@` → `45.90.109.7`
- `A` `db` → `45.90.109.7`
- `CNAME` `www` → `joinocelot.com.`
- No `AAAA` record (the old one pointed at Fly). Keep the Resend records (`send`, `rsend`, `resend._domainkey`,
  `_dmarc`).

Check: `dig +short joinocelot.com db.joinocelot.com` prints `45.90.109.7` twice.

## 2 to 5. The server, in one command

In hPanel → VPS → **Browser terminal** (as root):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/dev-perceptric/ocelot/main/deploy/install.sh)
```

It checks memory and the shared Supabase files, copies these folders to `/docker`, makes fresh secrets for
`sb-ocelot` (matching `sb-arrowsterr`'s key format), asks for the Resend key, starts the stack, waits for Storage,
starts `db.joinocelot.com`, the migrate runner (and waits for every migration), the backup, and the jobs copy, web app
and worker once their images are on ghcr.io, and adds `ocelot-web ocelot-jobs ocelot-worker` to the autodeploy list. It keeps every
`.env` that already exists, so it is safe to run again. At the end it prints the public anon key for GitHub.

## 6. Move the data from Supabase Cloud (once)

1. Restore the paused project: https://supabase.com/dashboard/project/tqvtkdftgzlteayzbqvj → **Restore**.
2. Copy **Connect → Session pooler** (with the database password) and **Project Settings → API Keys** → the secret key.
3. On the server:
   ```bash
   cd /docker/ocelot-move
   read -rsp "Cloud DB URL: " CLOUD_DB_URL; echo; export CLOUD_DB_URL
   read -rsp "Cloud secret key: " CLOUD_SERVICE_KEY; echo; export CLOUD_SERVICE_KEY
   export CLOUD_URL=https://tqvtkdftgzlteayzbqvj.supabase.co
   bash move-from-cloud.sh
   ```
   It copies sign-ins, every `public` table and the résumé and logo files, fixes logo links and compares row counts.
   Everyone signs in again once. Delete the cloud project after a week on the VPS.

## 7. GitHub

https://github.com/dev-perceptric/ocelot/settings/variables/actions

- Variables: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (printed by the install), `NEXT_PUBLIC_SUPABASE_URL` =
  `https://db.joinocelot.com`, `NEXT_PUBLIC_SITE_URL` = `https://joinocelot.com`.
- Delete the old secrets `FLY_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VPS_SSH_KEY`,
  `VPS_KNOWN_HOSTS` and the variables `SUPABASE_PROJECT_REF`, `VPS_HOST` if they exist.
- **Actions → Check and deploy → Run workflow** builds both images. The server is already logged in to ghcr.io for
  the other apps; if `docker pull ghcr.io/dev-perceptric/ocelot-web:latest` is refused there, open each package on
  GitHub (Packages → ocelot-web, ocelot-worker → Package settings) and give the server's token read access, or make
  the package public (the repo is public). autodeploy starts both within 5 minutes of the pull working.

## 8. Uptime

Add `uptime/gatus-endpoint.yaml` under `endpoints:` in the `uptime` project's Gatus config with the same alerts as
the other apps, then `docker compose restart` in `/docker/uptime`.

## 9. Check it works

- [ ] https://joinocelot.com/api/health answers `{"ok":true}` with a valid certificate; `www` redirects to it.
- [ ] `curl -s https://db.joinocelot.com/auth/v1/health -H "apikey: <anon key>"` returns GoTrue's JSON.
- [ ] Sign in at https://joinocelot.com/login: the 6-digit code email arrives from `hello@joinocelot.com`.
- [ ] `docker exec sb-ocelot-db-1 psql -U postgres -c 'select count(*) from ops.schema_migrations'` matches the files
  in `supabase/migrations`.
- [ ] `docker logs ocelot-worker-worker-1` shows `ocelot worker started` and an `hourly:` line; Admin → Job boards shows
  the hourly run; `docker logs ocelot-jobs-jobs-1` shows `boards: … synced`.
- [ ] `docker logs ocelot-backup-backup-1` shows a `Done:` line; a file is in `/opt/backups/ocelot`.
- [ ] `free -m` stays under about 6.4 GB in use.

## Logs and Studio

- Logs: `docker logs ocelot-web-web-1`, `ocelot-jobs-jobs-1`, `ocelot-worker-worker-1`, `ocelot-migrate-migrate-1`, `sb-ocelot-auth-1`.
- SQL: `docker exec -it sb-ocelot-db-1 psql -U postgres`.

## Undo

`docker compose down` in each folder (add `-v` on `sb-ocelot` only to delete the database too), take
`ocelot-web ocelot-jobs ocelot-worker` off the autodeploy list (the install left a `.bak-ocelot` copy of
`/docker/autodeploy/docker-compose.yml`), and point
DNS elsewhere.
