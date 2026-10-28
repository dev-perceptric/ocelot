# Setup from scratch

The old QualiaLabs Supabase and Fly accounts are gone, so everything starts new. Do the steps in order. Each one takes about 5–15 minutes.

Region for everything: **Singapore** (closest to Vietnam). Supabase calls it `ap-southeast-1`, Fly calls it `sin`.

## 1. Supabase (database, login, file storage)

1. Go to https://supabase.com/dashboard and sign in with the account you want to own Ocelot (GitHub sign-in is easiest).
2. Make a new organization: top-left menu → **New organization**.
   - Name: `QualiaLabs` (or `Ocelot`).
   - Type: Company.
   - Plan: **Free** to start. Switch to **Pro ($25/month)** before real users arrive. Free projects pause after a week with no traffic and have no daily backups.
3. In that organization, click **New project**.
   - Name: `ocelot`.
   - Database password: click **Generate**, then save it in your password manager. You need it for migrations.
   - Region: **Southeast Asia (Singapore)**.
4. Wait about 2 minutes for it to start.
5. Copy these from **Project Settings → API** (or **Connect** at the top):
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable (anon) key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Secret (service role) key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the browser)
   - Project ref (the id in the URL, like `abcd1234...`) → `SUPABASE_PROJECT_REF`
6. **Authentication → Sign In / Providers**: keep Email on. Turn on Google later if you want "Continue with Google".
7. **Authentication → URL Configuration**:
   - Site URL: `https://joinocelot.com`
   - Redirect URLs: `https://joinocelot.com/auth/callback`, `http://localhost:3000/auth/callback`
8. **Authentication → Emails → SMTP Settings**: turn on custom SMTP with Resend (step 3 below). Supabase's built-in email only sends a few messages an hour.
9. **Storage**: make a bucket named `resumes`, set to **Private**. (The first migration can also do this.)

To let Claude manage the database in later sessions: claude.ai → Settings → Connectors → Supabase → reconnect, and give it access to the new organization. Right now the connector only sees the Arrowsterr organization.

## 2. Fly.io (runs the website and the worker)

1. Go to https://fly.io/app/sign-up and make an account. Add a card under **Billing** (Fly needs one even for small apps).
2. Make an organization: **Dashboard → Organizations → Create** → name it `qualialabs` (or use your personal org).
3. Install the command line tool on your computer:
   - Mac: `brew install flyctl`
   - Windows: `pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"`
   - Linux: `curl -L https://fly.io/install.sh | sh`
4. Sign in: `fly auth login`
5. Make the two apps (names must be unique on Fly):
   ```
   fly apps create ocelot-web --org qualialabs
   fly apps create ocelot-worker --org qualialabs
   ```
6. Make a deploy token for GitHub:
   ```
   fly tokens create org --org qualialabs
   ```
   Copy the whole output (it starts with `FlyV1`).
7. In GitHub: **dev-perceptric/ocelot → Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `FLY_API_TOKEN`, value: the token from step 6.
   After this, every push to `main` deploys (the workflow comes with Milestone 0).
8. Give the app its secrets (run once, and again when a key changes):
   ```
   fly secrets set --app ocelot-web \
     NEXT_PUBLIC_SUPABASE_URL=... \
     NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
     SUPABASE_SERVICE_ROLE_KEY=... \
     RESEND_API_KEY=... \
     STRIPE_SECRET_KEY=... \
     STRIPE_WEBHOOK_SECRET=...
   ```
   Do the same for `ocelot-worker` (it needs the Supabase URL, service role key and Resend key).

## 3. Domain: joinocelot.com

1. After the first deploy, add the domain on Fly:
   ```
   fly certs add joinocelot.com --app ocelot-web
   fly certs add www.joinocelot.com --app ocelot-web
   ```
   Fly prints the DNS records to add.
2. At your domain registrar, add:
   - `A` record for `@` → the IPv4 address Fly shows (`fly ips list --app ocelot-web`; run `fly ips allocate-v4 --shared --app ocelot-web` if there is none).
   - `AAAA` record for `@` → the IPv6 address Fly shows.
   - `CNAME` for `www` → `ocelot-web.fly.dev`.
3. Check with `fly certs show joinocelot.com --app ocelot-web` until it says Issued.

## 4. Resend (email)

1. Sign up at https://resend.com.
2. **Domains → Add domain** → `joinocelot.com`, region Tokyo or Singapore if offered.
3. Add the DNS records it lists (SPF, DKIM, and a DMARC record) at your registrar. Wait for **Verified**.
4. **API Keys → Create** → copy to `RESEND_API_KEY`.
5. Back in Supabase SMTP settings: host `smtp.resend.com`, port `465`, user `resend`, password = the API key, sender `hello@joinocelot.com`, name `Ocelot`.

## 5. Stripe (payments, needed at Milestone 5)

1. Stripe does not accept businesses based in Vietnam. Pick the company that will bill employers (for example a Singapore or US company) and sign up at https://dashboard.stripe.com/register with that entity. (check)
2. Stay in **Test mode** until launch.
3. **Developers → API keys** → copy the secret key to `STRIPE_SECRET_KEY`.
4. **Developers → Webhooks → Add endpoint** → `https://joinocelot.com/api/stripe/webhook`, event `checkout.session.completed`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.

## 6. Optional now, useful soon

- **Sentry** (errors): free plan, make a Next.js project, copy the DSN to `SENTRY_DSN`.
- **PostHog** (product analytics): free plan, copy the project key to `NEXT_PUBLIC_POSTHOG_KEY`.
- **Google Search Console**: verify joinocelot.com with a DNS TXT record and submit `/sitemap.xml` once jobs are live.

## What to send back

When steps 1 and 2 are done, send these so the build can start:
- Supabase project URL and project ref. (Keys go into Fly secrets and GitHub, never into chat or the repo.)
- Confirmation that `FLY_API_TOKEN` is saved in the GitHub repo.
- Confirmation that the Supabase connector can see the new organization.

## Monthly cost of this setup

| Item | Beta | Growth |
|---|---:|---:|
| Supabase Pro | $25 | $25–30 (check) |
| Fly web + worker | about $6 (check) | about $10 (check) |
| Resend | $0 | $20 |
| Domain | $1 | $1 |
| **Total before Stripe fees and optional tools** | **about $32** | **about $56–61** |

Full totals, with Stripe fees and monitoring, are in `docs/plan.md`.
