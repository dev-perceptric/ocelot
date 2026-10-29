# Setup from scratch

Everything lives under the **dev-omniscient** accounts. Do the steps in order. Region for everything: **Singapore** (Supabase `ap-southeast-1`, Fly `sin`).

Keep a scratch note open while you go. You'll copy 8 values into it:

| Value | Where it comes from | Where it goes |
|---|---|---|
| Project ref | Supabase step 1 | GitHub variable `SUPABASE_PROJECT_REF` |
| Project URL | Supabase step 1 | GitHub variable `NEXT_PUBLIC_SUPABASE_URL`, Fly secret `SUPABASE_URL` (worker) |
| Publishable (anon) key | Supabase step 1 | GitHub variable `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret (service role) key | Supabase step 1 | Fly secret `SUPABASE_SERVICE_ROLE_KEY` |
| Database password | Supabase step 1 | GitHub secret `SUPABASE_DB_PASSWORD` |
| Supabase access token | Supabase step 4 | GitHub secret `SUPABASE_ACCESS_TOKEN` |
| Fly deploy token | Fly step 4 | GitHub secret `FLY_API_TOKEN` |
| Resend API key | Resend step 3 | Fly secret `RESEND_API_KEY`, Supabase SMTP |

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
   - Redirect URLs, add all three:
     - `https://joinocelot.com/auth/callback`
     - `https://ocelot-web.fly.dev/auth/callback`
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

## 6. Fly.io

1. Sign in at https://fly.io with the dev-omniscient account. **Billing** → add a card.
2. Install the command line tool on your Mac: `brew install flyctl`, then `fly auth login`.
3. Make the two apps (in your personal org, or add `--org <name>`):
   ```
   fly apps create ocelot-web
   fly apps create ocelot-worker
   ```
   If a name is taken, pick another and change `app = ...` in `fly.toml` or `fly.worker.toml`, and the names in `.github/workflows/deploy.yml`.
4. Deploy token: `fly tokens create org` → copy the whole line starting with `FlyV1` (`FLY_API_TOKEN`).
5. Secrets for the app (the server side reads these when it runs):
   ```
   fly secrets set --app ocelot-web --stage \
     SUPABASE_SERVICE_ROLE_KEY='<secret key>' \
     RESEND_API_KEY='<resend key>'
   ```
6. Secrets for the worker:
   ```
   fly secrets set --app ocelot-worker --stage \
     SUPABASE_URL='https://<ref>.supabase.co' \
     SUPABASE_SERVICE_ROLE_KEY='<secret key>' \
     RESEND_API_KEY='<resend key>' \
     EMAIL_FROM='Ocelot <hello@joinocelot.com>'
   ```
   `--stage` saves them for the first deploy without trying to restart a machine that doesn't exist yet.

## 7. GitHub secrets and variables

https://github.com/dev-perceptric/ocelot → **Settings → Secrets and variables → Actions**.

**Secrets** tab → **New repository secret**, three times:
- `FLY_API_TOKEN`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

**Variables** tab → **New repository variable**, four times:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the publishable key
- `NEXT_PUBLIC_SITE_URL` = `https://joinocelot.com` (use `https://ocelot-web.fly.dev` until the domain is connected)
- `SUPABASE_PROJECT_REF` = the project ref

The URL and publishable key are safe to be public; they are built into the pages. The service role key stays in Fly only.

## 8. First deploy

**Actions** tab → **Check and deploy** → **Run workflow** on `main` (or push anything to `main`). It runs lint, type checks, the tests and the database access tests, then deploys both apps and pushes migrations. About 5 minutes.

Check: https://ocelot-web.fly.dev shows the yellow Ocelot home page, and https://ocelot-web.fly.dev/api/health shows `{"ok":true}`. Worker logs: `fly logs --app ocelot-worker` shows `ocelot worker started`.

## 9. Domain: joinocelot.com

1. Add the domain on Fly:
   ```
   fly ips allocate-v4 --shared --app ocelot-web
   fly ips allocate-v6 --app ocelot-web
   fly certs add joinocelot.com --app ocelot-web
   fly certs add www.joinocelot.com --app ocelot-web
   ```
2. At your domain company, add:
   - `A` record, name `@`, value = the IPv4 from `fly ips list --app ocelot-web`
   - `AAAA` record, name `@`, value = the IPv6 from the same list
   - `CNAME` record, name `www`, value `ocelot-web.fly.dev`
3. Wait until `fly certs show joinocelot.com --app ocelot-web` says the certificate is issued.
4. Change the GitHub variable `NEXT_PUBLIC_SITE_URL` to `https://joinocelot.com` and run the workflow again.

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

## Later: Stripe (Milestone 5)

Stripe does not accept businesses based in Vietnam (check). Sign up with the company that will bill employers (for example one in Singapore or the US). Stay in test mode. Webhook endpoint: `https://joinocelot.com/api/stripe/webhook`, event `checkout.session.completed`. Then `fly secrets set --app ocelot-web STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...`.

## Optional now, useful soon

- **Sentry** (errors): free plan, Next.js project, then `fly secrets set --app ocelot-web SENTRY_DSN=...`.
- **Google Search Console**: verify joinocelot.com with a DNS TXT record and submit `https://joinocelot.com/sitemap.xml` once jobs are live.
- **Claude in later sessions**: claude.ai → Settings → Connectors → Supabase → reconnect and allow the dev-omniscient org, so Claude can run migrations and read logs.

## Monthly cost of this setup

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| Supabase (Free to start, Pro before launch) | $0, then $25 | $25–30 (check) |
| Fly web, shared-cpu-1x 512 MB, always on | about $4 (check) | about $8, two machines (check) |
| Fly worker, shared-cpu-1x 256 MB | about $2 (check) | about $2 (check) |
| Resend | $0 (free up to 3,000 emails) | $20 |
| Domain | $1 | $1 |
| **Total** | **about $7, then $32** | **about $56–61** |

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
(cd .next/standalone && PORT=3100 HOSTNAME=localhost SUPABASE_SERVICE_ROLE_KEY=<secret> node server.js) &
node tests/e2e/team.cjs
node tests/e2e/admin.cjs
node tests/e2e/jobs.cjs
node tests/e2e/search.cjs
node tests/e2e/reports.cjs
node tests/e2e/tracker.cjs
node tests/e2e/tasks.cjs
node tests/e2e/resumes.cjs
node tests/e2e/apply.cjs
SUPABASE_SECRET=<secret> node tests/e2e/account.cjs
```

Between runs, clear test data (companies first, so the "company needs an owner" rule doesn't block it):

```
psql postgres://postgres:postgres@127.0.0.1:54322/postgres -c "delete from reports; delete from applications; delete from orgs; delete from auth.users; delete from jobs_queue; delete from audit_events;"
```
