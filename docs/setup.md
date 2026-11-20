# Setup from scratch

Everything lives under the **dev-omniscient** accounts. Do the steps in order. Supabase runs in **Singapore** (`ap-southeast-1`). The site and the worker run on the Hostinger VPS with Docker.

Keep a scratch note open while you go. You'll copy these values into it:

| Value | Where it comes from | Where it goes |
|---|---|---|
| Project ref | Supabase step 1 | GitHub variable `SUPABASE_PROJECT_REF` |
| Project URL | Supabase step 1 | VPS `.env`: `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable (anon) key | Supabase step 1 | VPS `.env`: `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret (service role) key | Supabase step 1 | VPS `.env`: `SUPABASE_SERVICE_ROLE_KEY` |
| Database password | Supabase step 1 | GitHub secret `SUPABASE_DB_PASSWORD` |
| Supabase access token | Supabase step 4 | GitHub secret `SUPABASE_ACCESS_TOKEN` |
| Deploy SSH key (private half) | VPS step 2 | GitHub secret `VPS_SSH_KEY` |
| Server fingerprint | VPS step 2 | GitHub secret `VPS_KNOWN_HOSTS` |
| Resend API key | Resend step 3 | VPS `.env`: `RESEND_API_KEY`, Supabase SMTP |

Never paste the service role key, passwords or tokens into chat or the code.

## 0. GitHub: make `main`

The repo's only branch is `claude/bold-dirac-xp6421`. Deploys run from `main`.

1. Open https://github.com/dev-perceptric/ocelot, click the branch menu (top left of the code view), type `main` → **Create branch main from claude/bold-dirac-xp6421**.
2. **Settings → General → Default branch** → switch to `main`.

## 1. Supabase project

1. Open the **dev-omniscient's Org** dashboard → **New project**.
   - Name: `ocelot`
   - Database password: **Generate**, then save it (this is `SUPABASE_DB_PASSWORD`).
   - Region: **Southeast Asia (Singapore)**.
   - Compute: the default (Nano on Free).
2. Wait about 2 minutes.
3. Click **Connect** (top bar) or **Project Settings → API Keys / Data API** and copy:
   - Project URL (`https://<ref>.supabase.co`). The `<ref>` part is the project ref.
   - Publishable key (also called anon key).
   - Secret key (also called service_role key).

Free plan notes: it allows 2 active projects, and you have 1, so `ocelot` fits. A free project pauses after 7 days with no activity. The worker talks to it every minute, which should keep it awake (check). Move to Pro ($25/month) before real users arrive, for daily backups and no pausing.

## 2. Supabase login settings

1. **Authentication → Sign In / Providers → Email**: on. Turn **Confirm email** on.
2. **Authentication → URL Configuration**:
   - Site URL: `https://joinocelot.com`
   - Redirect URLs, add both:
     - `https://joinocelot.com/auth/callback`
     - `http://localhost:3000/auth/callback`
3. **Authentication → Emails → Templates → Magic Link**: change the subject to `Your Ocelot login link`. Keep the `{{ .ConfirmationURL }}` link in the body.
4. SMTP comes in step 5 (Resend). Until then Supabase sends only a few emails an hour, which is fine for testing.

## 3. The database tables

Pick one way.

**A. Paste (fastest, first time).** **SQL Editor → New query**. Paste all of `supabase/migrations/001_foundation.sql`, run it. Then the same for `002_storage.sql`. Then record them so the auto-deploy doesn't run them twice:

```sql
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('001', 'foundation'), ('002', 'storage')
on conflict do nothing;
```

**B. Automatic.** Finish step 4 and GitHub step 7. Every push to `main` then applies new migration files on its own.

Check: **Table Editor** shows `jobs`, `orgs`, `tracker_items` and the rest, each with a lock icon (row level security on). **Storage** shows the private `resumes` bucket and the public `logos` bucket.

Make yourself an admin after you log in once (step 9):

```sql
insert into platform_admins (user_id) select id from auth.users where email = 'vincent@perceptric.com';
```

## 4. Supabase access token (for automatic migrations)

https://supabase.com/dashboard/account/tokens → **Generate new token** → name `ocelot-github` → copy (`SUPABASE_ACCESS_TOKEN`).

## 5. Resend (email)

1. Sign up at https://resend.com (use the dev-omniscient email).
2. **Domains → Add domain** → `joinocelot.com`, region **Tokyo** (closest offered; check).
3. Add the DNS records Resend lists at your domain company (MX and TXT for `send`, the DKIM TXT, and a DMARC TXT `_dmarc` → `v=DMARC1; p=none;`). Wait for **Verified**.
4. **API Keys → Create API key** → full access → copy (`RESEND_API_KEY`).
5. Back in Supabase: **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   - Sender email `hello@joinocelot.com`, sender name `Ocelot`
   - Host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key.

## 6. VPS (Hostinger KVM 2)

The server already runs Docker and Traefik. Traefik takes ports 80 and 443 and gets the HTTPS certificates. Ocelot joins its network with the labels in `compose.yaml`.

1. **Find Traefik's settings.** Log in to the server (`ssh root@45.90.109.7`) and run:
   ```
   docker network ls
   docker ps --filter name=traefik
   ```
   Note the network Traefik is on, the name of its HTTPS entrypoint and its certificate resolver (in Traefik's config file or `docker inspect <traefik container>`). The defaults in `compose.yaml` are `traefik`, `websecure` and `letsencrypt`. If yours differ, set `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT` and `TRAEFIK_CERTRESOLVER` in `.env` (step 3).
2. **Make a deploy user and key.**
   ```
   adduser --disabled-password --gecos "" deploy
   usermod -aG docker deploy
   apt-get install -y rsync
   mkdir -p /opt/ocelot && chown deploy:deploy /opt/ocelot
   ```
   On your Mac, make a key just for deploys: `ssh-keygen -t ed25519 -f ~/.ssh/ocelot_deploy -N ""`. Put the public half (`~/.ssh/ocelot_deploy.pub`) in `/home/deploy/.ssh/authorized_keys` on the server (owner `deploy`, mode 600). The private half (`~/.ssh/ocelot_deploy`) is `VPS_SSH_KEY`. Then run `ssh-keyscan -t ed25519 45.90.109.7` on your Mac; its output line is `VPS_KNOWN_HOSTS`.
   Being in the `docker` group gives `deploy` full control of Docker on this server, so keep this key only in GitHub.
3. **Write the server's `.env`.** As `deploy`, create `/opt/ocelot/.env` and run `chmod 600 /opt/ocelot/.env`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
   NEXT_PUBLIC_SITE_URL=https://joinocelot.com
   SUPABASE_SERVICE_ROLE_KEY=<secret key>
   RESEND_API_KEY=<resend key>
   EMAIL_FROM=Ocelot <hello@joinocelot.com>
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   # Only if step 1 found different names:
   # TRAEFIK_NETWORK=traefik
   # TRAEFIK_ENTRYPOINT=websecure
   # TRAEFIK_CERTRESOLVER=letsencrypt
   ```
   Every deploy reads this file. It never goes into git, and the deploy copy step never overwrites it.

## 7. GitHub secrets and variables

https://github.com/dev-perceptric/ocelot → **Settings → Secrets and variables → Actions**.

**Secrets** tab → **New repository secret**:
- `VPS_SSH_KEY`
- `VPS_KNOWN_HOSTS`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

**Variables** tab → **New repository variable**:
- `VPS_HOST` = `45.90.109.7`
- `SUPABASE_PROJECT_REF` = the project ref

Delete the old `FLY_API_TOKEN` secret and the `NEXT_PUBLIC_*` variables; the VPS `.env` holds those values now.

## 8. First deploy

**Actions** tab → **Check and deploy** → **Run workflow** on `main` (or push anything to `main`). It runs lint, type checks, the tests and the database access tests, pushes migrations, copies the code to `/opt/ocelot` and runs `scripts/deploy-vps.sh` there. The first build on the server takes a few minutes.

Check on the server: `cd /opt/ocelot && docker compose ps` shows `web` as healthy and `worker` running. `docker compose logs worker` shows `ocelot worker started`.

You can also deploy by hand on the server: `cd /opt/ocelot && bash scripts/deploy-vps.sh`.

## 9. Domain: joinocelot.com

1. At your domain company:
   - `A` record, name `@`, value `45.90.109.7`
   - `CNAME` record, name `www`, value `joinocelot.com`
   - Delete the old Fly `A` and `AAAA` records.
2. Wait for DNS to update, then open https://joinocelot.com/api/health. It shows `{"ok":true}` once Traefik has its certificate.
3. Shut down Fly so it stops billing: `fly apps destroy ocelot-web` and `fly apps destroy ocelot-worker`, then remove the card in Fly **Billing**.

## 10. Try the loop

1. Open https://joinocelot.com/login, enter your email, open the link. You land on **My search**.
2. Run the admin SQL from step 3.
3. Open **For employers** → create a company.

Posting jobs comes in Milestone 2.

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
2. Developers → API keys → copy the Secret key into `STRIPE_SECRET_KEY` in the VPS `.env`.
3. Developers → Webhooks → Add endpoint `https://joinocelot.com/api/stripe/webhook` with the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its Signing secret into `STRIPE_WEBHOOK_SECRET` in the VPS `.env`, then run `bash scripts/deploy-vps.sh` on the server.
4. Settings → Customer emails → turn on receipts for successful payments.
5. Buy a listing in test mode with card 4242 4242 4242 4242 and check the job goes to review.
6. Switch to live keys (repeat steps 2 and 3 with the live ones), then turn payments on in Admin → Billing.

## Optional now, useful soon

- **Sentry** (errors): free plan, Next.js project, then add `SENTRY_DSN=...` to the VPS `.env` and redeploy.
- **Google Search Console**: verify joinocelot.com with a DNS TXT record and submit `https://joinocelot.com/sitemap.xml` once jobs are live.
- **Claude in later sessions**: claude.ai → Settings → Connectors → Supabase → reconnect and allow the dev-omniscient org, so Claude can run migrations and read logs.

## Monthly cost of this setup

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| Hostinger VPS KVM 2, already paid and shared with other projects | $0 extra (check) | $0 extra; KVM 4 if it gets busy (check) |
| Supabase (Free to start, Pro before launch) | $0, then $25 | $25–30 (check) |
| Resend | $0 (free up to 3,000 emails) | $20 |
| Domain | $1 | $1 |
| **Total** | **about $1, then $26** | **about $46–51** |

Full totals with Stripe fees and monitoring are in `docs/plan.md`.

## Login email templates (Milestone 1, part B)

The login email carries a 6-digit code as well as the link, so people can open it on a different device. Paste each file into Supabase → Authentication → Emails → Templates, then **Save**:

| Supabase template | Subject | File |
|---|---|---|
| Confirm signup | `Your Ocelot code` | `supabase/templates/confirm_signup.html` |
| Magic Link | `Your Ocelot code` | `supabase/templates/magic_link.html` |
| Change Email Address | `Confirm your new email` | `supabase/templates/email_change.html` |

## Google sign-in (Milestone 1, part B)

1. console.cloud.google.com → create a project `Ocelot` → APIs & Services → OAuth consent screen: External, app name `Ocelot`, support email, logo optional, authorized domain `joinocelot.com`. Publish it.
2. Credentials → Create credentials → OAuth client ID → Web application. Authorized redirect URI: `https://tqvtkdftgzlteayzbqvj.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Sign In / Providers → Google: turn on, paste the client ID and secret, **Save**.

The "Continue with Google" button appears on its own within 5 minutes of turning Google on.

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
