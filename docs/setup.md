# Setup from scratch

Everything runs on the Hostinger VPS (`45.90.109.7`, KVM 2: 2 CPUs, 8 GB), the same server as Capybaroar, Claritia and
Omniscient, set up the same way:

- **Caddy** on the host takes ports 80 and 443 and gets the HTTPS certificates (`ops/vps/Caddyfile.ocelot`).
- **Ocelot's own Supabase** in `/docker/sb-ocelot` at `db.joinocelot.com`, ports on `127.0.0.1` only
  (`ops/vps/sb-ocelot.override.yml`).
- **The app and the worker** in `/docker/ocelot` (`compose.yaml`), the web app on `127.0.0.1:3400`.
- **CI** builds both images, loads them onto the server over SSH and runs `scripts/deploy-vps.sh`, which applies new
  migrations (`scripts/migrate-vps.sh`) and restarts the containers.

Ports Ocelot uses on `127.0.0.1`: web 3400; Supabase Kong 8400 and 8401, Studio 3410, Postgres 5440, pooler 6550,
meta 8410, analytics 4400. Never paste the service role key, passwords or tokens into chat or the code.

**Fast path:** in hPanel → VPS → **Browser terminal**, run

```
bash <(curl -fsSL https://raw.githubusercontent.com/dev-perceptric/ocelot/main/ops/vps/install.sh)
```

It does steps 0 and 3 to 5 below (and asks for the Resend key), then prints exactly what goes into GitHub (step 7).
Safe to run again. You still do step 1 (DNS), step 6 (data move) and step 7 (paste into GitHub).

## 0. Check the server has room

```
free -h
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
ss -tlnp | grep -E ':(3400|3410|4400|5440|6550|8400|8401|8410) '
```

A Supabase stack uses about 1.5–2.5 GB of memory and the app up to 1.25 GB. With three Supabase stacks already
running, check there are at least 4 GB free before you start. If not, move the VPS to KVM 4 (16 GB) in hPanel first.
The `ss` line must print nothing (those ports are free).

## 1. Domain records

At your domain company, for `joinocelot.com`:
- `A` record, name `@`, value `45.90.109.7`
- `A` record, name `db`, value `45.90.109.7`
- `CNAME` record, name `www`, value `joinocelot.com`
- Delete the old Fly `A` and `AAAA` records.

## 2. Resend (email)

The `joinocelot.com` domain and its key may already exist in Resend (dev-omniscient login). If not:
1. **Domains → Add domain** → `joinocelot.com`, add the DNS records Resend lists, wait for **Verified**.
2. **API Keys → Create API key** → copy it (`RESEND_API_KEY`).

## 3. Ocelot's Supabase on the VPS

1. Copy an existing stack's files (same Supabase version and container naming as the others), without its data,
   secrets or override:
   ```
   mkdir -p /docker/sb-ocelot
   cp /docker/sb-capybaroar/docker-compose.yml /docker/sb-capybaroar/.env /docker/sb-ocelot/
   rsync -a --exclude db/data --exclude storage /docker/sb-capybaroar/volumes/ /docker/sb-ocelot/volumes/
   ls /docker/sb-ocelot/volumes/db              # only .sql setup files, no data folder: the new stack starts empty
   ```
2. Fresh secrets. On your Mac, in the repo, print a new set: `node ops/vps/supabase-keys.mjs`.
   In `/docker/sb-ocelot/.env`, replace every line it printed (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`,
   `SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD`, `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, the two
   `LOGFLARE_*` tokens). Never reuse Capybaroar's. Then set:
   ```
   SITE_URL=https://joinocelot.com
   API_EXTERNAL_URL=https://db.joinocelot.com
   SUPABASE_PUBLIC_URL=https://db.joinocelot.com
   ADDITIONAL_REDIRECT_URLS=https://joinocelot.com/auth/callback
   STUDIO_DEFAULT_PROJECT=Ocelot
   POOLER_TENANT_ID=ocelot
   ENABLE_EMAIL_AUTOCONFIRM=false
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_USER=resend
   SMTP_PASS=<RESEND_API_KEY>
   SMTP_ADMIN_EMAIL=hello@joinocelot.com
   SMTP_SENDER_NAME=Ocelot
   ```
   `chmod 600 /docker/sb-ocelot/.env`. Keep `ANON_KEY` and `SERVICE_ROLE_KEY` handy for steps 4 and 7.
3. The override (ports on `127.0.0.1`, Ocelot's sign-in settings) and start:
   ```
   scp ops/vps/sb-ocelot.override.yml root@45.90.109.7:/docker/sb-ocelot/docker-compose.override.yml   # from your Mac
   cd /docker/sb-ocelot                       # on the server
   docker compose config --services          # names must match the override
   docker compose config | grep -E 'host_ip|published'
   docker compose up -d
   docker compose ps                          # all healthy after a minute or two
   ```
   The container names should start with `sb-ocelot-` (for example `sb-ocelot-db-1`, which the scripts use). If yours
   differ, set `DB_CONTAINER` when you run them.

## 4. The app on the VPS

1. A deploy user for CI (skip `adduser` if `deploy` already exists from another project):
   ```
   adduser --disabled-password --gecos "" deploy
   usermod -aG docker deploy
   apt-get install -y rsync
   mkdir -p /docker/ocelot && chown deploy:deploy /docker/ocelot
   ```
   On your Mac: `ssh-keygen -t ed25519 -f ~/.ssh/ocelot_deploy -N ""`. Add `~/.ssh/ocelot_deploy.pub` to
   `/home/deploy/.ssh/authorized_keys` (owner `deploy`, mode 600). The private half is `VPS_SSH_KEY`. The output of
   `ssh-keyscan -t ed25519 45.90.109.7` is `VPS_KNOWN_HOSTS`. Being in the `docker` group gives `deploy` full control of
   Docker on this server, so keep this key only in GitHub.
2. Copy the repo's server files up once by hand (CI does it on every deploy after this):
   `rsync -az --relative compose.yaml scripts/ supabase/migrations/ ops/ deploy@45.90.109.7:/docker/ocelot/`
3. `/docker/ocelot/.env` (as `deploy`, then `chmod 600`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://db.joinocelot.com
   NEXT_PUBLIC_SITE_URL=https://joinocelot.com
   SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from step 3>
   RESEND_API_KEY=<resend key>
   EMAIL_FROM=Ocelot <hello@joinocelot.com>
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   ```

## 5. Caddy

```
scp ops/vps/Caddyfile.ocelot root@45.90.109.7:/etc/caddy/Caddyfile.ocelot     # from your Mac
cat /etc/caddy/Caddyfile.ocelot >> /etc/caddy/Caddyfile                        # on the server
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
curl -s https://db.joinocelot.com/auth/v1/health                               # answers once the certificate is in
```

Studio: `ssh -L 3410:127.0.0.1:3410 root@45.90.109.7`, then http://localhost:3410 (DASHBOARD_USERNAME /
DASHBOARD_PASSWORD from `/docker/sb-ocelot/.env`).

## 6. Move the data from Supabase Cloud (once)

1. Restore the paused cloud project: https://supabase.com/dashboard/project/tqvtkdftgzlteayzbqvj → **Restore**.
2. From its dashboard copy: **Connect → Session pooler** connection string (with the database password), and **Project
   Settings → API Keys** → the secret key.
3. On the server:
   ```
   cd /docker/ocelot
   read -rs CLOUD_DB_URL && export CLOUD_DB_URL          # paste, Enter (not shown, not saved in history)
   read -rs CLOUD_SERVICE_KEY && export CLOUD_SERVICE_KEY
   export CLOUD_URL=https://tqvtkdftgzlteayzbqvj.supabase.co
   bash ops/vps/move-from-cloud.sh
   ```
   It applies the migrations to the new database, copies sign-ins and every `public` table, copies the résumé and logo
   files, points logo links at `db.joinocelot.com` and prints row counts side by side. It ends with "every table
   matches", or marks the tables that differ.
4. Everyone signs in again once (sessions can't move). Passwords, Google links and accounts all carry over.
5. Once the site works on the VPS for a week, delete the cloud project.

## 7. GitHub

https://github.com/dev-perceptric/ocelot → **Settings → Secrets and variables → Actions**.

- **Secrets:** `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`. Delete `FLY_API_TOKEN`, `SUPABASE_ACCESS_TOKEN` and
  `SUPABASE_DB_PASSWORD`.
- **Variables:** `VPS_HOST` = `45.90.109.7`; `NEXT_PUBLIC_SUPABASE_URL` = `https://db.joinocelot.com`;
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the new `ANON_KEY` (public: it is built into the pages); `NEXT_PUBLIC_SITE_URL` =
  `https://joinocelot.com`. Delete `SUPABASE_PROJECT_REF`.

## 8. First deploy

**Actions → Check and deploy → Run workflow** on `main`. It runs the checks, builds both images, loads them on the
server and runs `scripts/deploy-vps.sh`.

Check: https://joinocelot.com/api/health shows `{"ok":true}`. On the server, `cd /docker/ocelot && docker compose ps`
shows `web` healthy and `worker` running, and `docker compose logs worker` shows `ocelot worker started`.

By hand: `cd /docker/ocelot && TAG=<commit> bash scripts/deploy-vps.sh` (any of the 3 newest commits; `docker images
ocelot-web` lists them).

## 9. Shut down the old services

- Fly: `fly apps destroy ocelot-web` and `fly apps destroy ocelot-worker`, then remove the card in **Billing**.
- Supabase Cloud: delete the project after step 6.5.

## 10. Backups

Use Capybaroar's nightly backup (`ops/backup.sh` and `ops/README.md` in that repo) with its own settings file
`/etc/ocelot/backup.env`: `DB_CONTAINER=sb-ocelot-db-1`, `SUPABASE_DIR=/docker/sb-ocelot`,
`MEDIA_DIR=/docker/sb-ocelot/volumes/storage`, `EXTRA_FILES=/docker/ocelot/.env`, its own bucket `ocelot-backups`
and its own cron line. Until this runs, the database has no backups: Supabase Cloud's free plan had none either.

## 11. Try the loop

1. Open https://joinocelot.com/login, enter your email, open the link or type the code. You land on **My search**.
2. Make yourself an admin (Studio SQL editor, step 5) if the move didn't bring it over:
   ```sql
   insert into platform_admins (user_id) select id from auth.users where email = '<your email>' on conflict do nothing;
   ```
3. Open **For employers** → your company, and **Admin → Job boards** shows the hourly run.

## Local development (optional)

```
cp .env.example .env.local   # fill in the Supabase URL and keys
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run test:db              # access tests, needs a local Postgres (DATABASE_URL)
```

## Stripe (Milestone 5)

Billing runs from Ocelot's Singapore company. Prices (USD) live in `src/lib/packages.ts`. Payments stay off until you turn them on, so jobs need no credit until then.

1. Make a Stripe account for the Singapore company and finish its verification. Start in test mode.
2. Developers → API keys → copy the Secret key into `STRIPE_SECRET_KEY` in `/docker/ocelot/.env`.
3. Developers → Webhooks → Add endpoint `https://joinocelot.com/api/stripe/webhook` with the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its Signing secret into `STRIPE_WEBHOOK_SECRET` in `/docker/ocelot/.env`, then `cd /docker/ocelot && docker compose up -d web` on the server.
4. Settings → Customer emails → turn on receipts for successful payments.
5. Buy a listing in test mode with card 4242 4242 4242 4242 and check the job goes to review.
6. Switch to live keys (repeat steps 2 and 3 with the live ones), then turn payments on in Admin → Billing.

## Optional now, useful soon

- **Sentry** (errors): free plan, Next.js project, then add `SENTRY_DSN=...` to `/docker/ocelot/.env` and `docker compose up -d web worker`.
- **Google Search Console**: verify joinocelot.com with a DNS TXT record and submit `https://joinocelot.com/sitemap.xml` once jobs are live.

## Monthly cost of this setup

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| Hostinger VPS KVM 2, already paid and shared with other projects (KVM 4 if memory runs short, step 0) | $0 extra (check) | $0 extra, or the KVM 4 difference (check) |
| Self-hosted Supabase on the VPS | $0 | $0 |
| Backups (Backblaze B2, a few GB) | under $1 (check) | about $1 (check) |
| Resend | $0 (free up to 3,000 emails) | $20 |
| Domain | $1 | $1 |
| **Total** | **about $2** | **about $22** |

Full totals with Stripe fees and monitoring are in `docs/plan.md`.

## Login email templates

The sign-in emails carry a 6-digit code as well as the link, so people can open them on a different device. The
self-hosted Supabase loads them from the app (`public/email-templates/`, set in `ops/vps/sb-ocelot.override.yml`), so
there is nothing to paste. `supabase/templates/` holds the same files for local Supabase; `tests/email-templates.test.ts`
keeps both copies the same. After changing one, copy it to the other and redeploy.

## Google sign-in

1. console.cloud.google.com → project `Ocelot` → Credentials → its OAuth client (Web application). Authorized redirect
   URI: `https://db.joinocelot.com/auth/v1/callback` (replace the old `supabase.co` one).
2. In `/docker/sb-ocelot/.env` add `GOOGLE_ENABLED=true`, `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...`, then
   `cd /docker/sb-ocelot && docker compose up -d auth`.

The "Continue with Google" button appears on its own within 5 minutes.

## End-to-end tests (local, optional)

Needs Docker. Runs the real sign-in, company, invite and team flows against a local Supabase.

```
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta
# copy PUBLISHABLE_KEY and SECRET_KEY from the output
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable> NEXT_PUBLIC_SITE_URL=http://localhost:3100 npm run build
cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
(cd .next/standalone && PORT=3100 HOSTNAME=localhost SUPABASE_SERVICE_ROLE_KEY=<secret> STRIPE_SECRET_KEY=sk_test_local STRIPE_WEBHOOK_SECRET=whsec_local STRIPE_API_URL=http://127.0.0.1:4243 ATS_TEST_URL=http://127.0.0.1:4244 node server.js) &
node tests/e2e/team.cjs
node tests/e2e/admin.cjs
node tests/e2e/jobs.cjs
node tests/e2e/search.cjs
node tests/e2e/reports.cjs
node tests/e2e/tracker.cjs
node tests/e2e/tasks.cjs
node tests/e2e/resumes.cjs
node tests/e2e/apply.cjs
SUPABASE_SECRET=<secret> node tests/e2e/pipeline.cjs
node tests/e2e/billing.cjs
SUPABASE_SECRET=<secret> node tests/e2e/alerts.cjs
SUPABASE_SECRET=<secret> node tests/e2e/boards.cjs
SUPABASE_SECRET=<secret> node tests/e2e/account.cjs
```

`billing.cjs` runs its own stand-in for the Stripe API on port 4243 and `boards.cjs` a stand-in job board on port 4244; the STRIPE_ and ATS_ values above are local test values, never real keys.

Between runs, clear test data (companies first, so the "company needs an owner" rule doesn't block it):

```
psql postgres://postgres:postgres@127.0.0.1:54322/postgres -c "delete from reports; delete from applications; delete from entitlements; delete from orders; delete from stripe_events; delete from saved_searches; delete from job_sources; delete from orgs; delete from auth.users; delete from jobs_queue; delete from audit_events;"
```
