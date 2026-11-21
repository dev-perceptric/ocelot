# Setup

Ocelot runs on the shared OVH server (SYS-1, Beauharnois, Canada) with its own self-hosted Supabase, laid out like the other apps there.
**The runbook is `deploy/README.md`**: DNS, the one-command server install (`deploy/install.sh`), the data move from
Supabase Cloud, the GitHub variables and the checks. This page covers local development, payments, Google sign-in,
the email templates and the running cost.

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
2. Developers → API keys → copy the Secret key into `STRIPE_SECRET_KEY` in `/docker/ocelot-web/.env` on the server.
3. Developers → Webhooks → Add endpoint `https://joinocelot.com/api/stripe/webhook` with the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its Signing secret into `STRIPE_WEBHOOK_SECRET` in the same file, then `cd /docker/ocelot-web && docker compose up -d`.
4. Settings → Customer emails → turn on receipts for successful payments.
5. Buy a listing in test mode with card 4242 4242 4242 4242 and check the job goes to review.
6. Switch to live keys (repeat steps 2 and 3 with the live ones), then turn payments on in Admin → Billing.

## Optional now, useful soon

- **Sentry** (errors): free plan, Next.js project, then add `SENTRY_DSN=...` to `/docker/ocelot-web/.env` and `/docker/ocelot-worker/.env` and `docker compose up -d` in each.
- **Google Search Console**: verify joinocelot.com with a DNS TXT record and submit `https://joinocelot.com/sitemap.xml` once jobs are live.

## Monthly cost of this setup

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| OVH SYS-1 (6 cores, 32 GB), already paid and shared with the other apps | $0 extra (check the OVH invoice) | $0 extra (check the OVH invoice) |
| Self-hosted Supabase on the server | $0 | $0 |
| Backups (on the server; Backblaze B2 copy optional) | $0, B2 under $1 (check) | $0, B2 about $1 (check) |
| Resend | $0 (free up to 3,000 emails) | $20 |
| Domain | $1 | $1 |
| **Total** | **about $2** | **about $22** |

Full totals with Stripe fees and monitoring are in `docs/plan.md`.

## Login email templates

The sign-in emails carry a 6-digit code as well as the link, so people can open them on a different device. The
self-hosted Supabase loads them from the app (`public/email-templates/`, set in `deploy/sb-ocelot/docker-compose.yml`), so
there is nothing to paste. `supabase/templates/` holds the same files for local Supabase; `tests/email-templates.test.ts`
keeps both copies the same. After changing one, copy it to the other and redeploy.

## Google sign-in

1. console.cloud.google.com → project `Ocelot` → Credentials → its OAuth client (Web application). Authorized redirect
   URI: `https://db.joinocelot.com/auth/v1/callback` (replace the old `supabase.co` one).
2. In `/docker/sb-ocelot/.env` set `GOOGLE_ENABLED=true`, `GOOGLE_CLIENT_ID=...` and `GOOGLE_SECRET=...`, then
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
node tests/e2e/agency.cjs
node tests/e2e/admin.cjs
node tests/e2e/agency-admin.cjs
node tests/e2e/jobs.cjs
node tests/e2e/search.cjs
node tests/e2e/reports.cjs
node tests/e2e/tracker.cjs
node tests/e2e/tasks.cjs
node tests/e2e/resumes.cjs
node tests/e2e/apply.cjs
SUPABASE_SECRET=<secret> node tests/e2e/pipeline.cjs
node tests/e2e/billing.cjs
node tests/e2e/agency-billing.cjs
SUPABASE_SECRET=<secret> node tests/e2e/alerts.cjs
SUPABASE_SECRET=<secret> node tests/e2e/boards.cjs
SUPABASE_SECRET=<secret> node tests/e2e/account.cjs
```

`billing.cjs` runs its own stand-in for the Stripe API on port 4243 and `boards.cjs` a stand-in job board on port 4244; the STRIPE_ and ATS_ values above are local test values, never real keys.

Between runs, clear test data (companies first, so the "company needs an owner" rule doesn't block it):

```
psql postgres://postgres:postgres@127.0.0.1:54322/postgres -c "delete from reports; delete from applications; delete from entitlements; delete from orders; delete from stripe_events; delete from saved_searches; delete from job_sources; delete from orgs; delete from auth.users; delete from jobs_queue; delete from audit_events;"
```
