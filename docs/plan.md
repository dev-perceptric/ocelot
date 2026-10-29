# Ocelot build plan

Goal for the first milestone: an employer publishes a real job, a candidate finds it and applies, the candidate tracks it, and the employer replies. Everything else is built around making that loop happen again and again.

## Product areas

| Area | Name in the product | Routes |
|---|---|---|
| Public marketplace | Jobs | `/`, `/jobs`, `/jobs/[slug]`, `/companies/[slug]` |
| Candidate workspace | My search | `/app`, `/app/tracker`, `/app/tasks`, `/app/profile`, `/app/resumes`, `/app/settings` |
| Employer workspace | For employers | `/for-employers`, `/pricing`, `/employer`, `/employer/jobs`, `/employer/jobs/new`, `/employer/jobs/[id]/applicants`, `/employer/company`, `/employer/team`, `/employer/billing` |
| Admin | — | `/admin` (review queue, reports, suspensions, audit log) |
| Auth | — | `/login`, `/signup`, `/auth/callback` |

One account can be a candidate and also a member of one or more companies. Employer access comes only from `org_members`.

## Data model (Supabase Postgres)

| Table | Holds | Who can read | Who can write |
|---|---|---|---|
| `profiles` | Name, headline, location, preferences | Owner. Employers see a snapshot only through an application | Owner |
| `orgs` | Company: name, slug, logo, site, about, `verified_email_domain`, `verified_business` | Public when it has a live job | Members (owner, admin) |
| `org_members` | user, org, role (owner, admin, member) | Members of that org | Owner, admin |
| `jobs` | Title, slug, description, category, seniority, employment type, workplace (on-site, hybrid, remote), eligible countries, time zones, salary min/max/currency/period, apply method (ocelot or external URL), `status`, `published_at`, `expires_at`, `source` | Public when `status = 'published'`. Members always | Members. Status changes only through server functions |
| `job_questions` | Screening questions per job | Public with the job | Members |
| `applications` | candidate, job, org, `hiring_stage`, `snapshot` (profile and answers at send time), `resume_id`, `submitted_at` | The candidate and that org's members | Candidate inserts. Members change `hiring_stage` only |
| `application_events` | Stage changes and messages on an application | Same as the application | Server only |
| `application_notes` | Private hiring notes | That org's members only | Members |
| `tracker_items` | Candidate's private card: optional `job_id`, optional `application_id`, title, company, URL, salary, location, `stage`, contacts, notes, `resume_id` | Owner only | Owner |
| `tracker_events` | Timeline of a tracker item | Owner only | Owner, server |
| `tasks` | Due date, title, done, optional tracker item | Owner only | Owner |
| `interviews` | Date, link, prep notes on a tracker item | Owner only | Owner |
| `documents` | Résumé files and versions (path in private bucket) | Owner. Org members only through a signed link for an application | Owner |
| `saved_jobs` | candidate, job | Owner | Owner |
| `saved_searches` | Query, filters, alert frequency | Owner | Owner |
| `orders` | Stripe session, package, amount, status | Org members | Server only (webhook) |
| `entitlements` | Listing credits and featured days per org | Org members | Server only |
| `reports` | Job or company reported, reason, status | Reporter, admins | Anyone signed in inserts. Admins update |
| `audit_events` | Admin and sensitive actions | Admins | Server only |
| `jobs_queue` | Background work: alerts, expiry, emails, retries | Server only | Server only |

States:
- Job: `draft → pending_review → published → closed / expired`, plus `rejected` and `suspended`.
- Hiring stage (employer): `new → reviewing → interviewing → offer → hired`, plus `rejected` and `withdrawn`.
- Tracker stage (candidate): `saved → applied → interviewing → offer → accepted`, plus `rejected`, `withdrawn` and `archived`.

Links between the two sides:
- A native application creates or links a tracker item (`tracker_items.application_id`). The candidate sees employer updates on that card. Hiring stage changes never move the tracker stage.
- An external job gets a tracker item with no application.
- Clicking an external Apply link opens the page, then asks "Did you apply?" before the card moves to Applied.
- `applications.snapshot` freezes what the employer received. Later profile edits never change it.

Search: Postgres full-text search on `jobs` (a generated `tsvector` column over title, company and description, with a GIN index), plus plain column filters. Move to a search service only if speed or ranking needs it.

## Background work

One small worker on Fly reads `jobs_queue` (same pattern as Claritia and Omniscient). Tasks:
- Expire jobs past `expires_at`.
- Send saved-search alerts (daily or weekly).
- Send application emails (sent, new applicant, stage changed).
- Task reminders for candidates.
- Retry failed emails and webhooks.
- Weekly jobs digest.

## Payments

- Stripe Checkout, one-time payments. Packages: Standard listing $49 for 30 days, Featured $99 for 30 days (7 days promoted plus the next digest). Founding employers get free credits during beta.
- The webhook is signed and idempotent (store the Stripe event id, ignore repeats).
- A paid job goes live only after both payment and review pass. The 30 days start at publish.
- A rejected paid listing keeps its credit for a fixed version, or gets a refund on request.
- Stripe availability: Stripe does not support businesses based in Vietnam. Ocelot bills from its Singapore company.

## Trust and safety

- First-time employers go through review. Trusted orgs can publish right away later.
- "Email verified" (work email on the company domain) and "Company verified" (checked by an admin) are separate labels.
- Every job page has a Report button. No listings that charge candidates fees.
- File uploads: PDF and DOCX only, 5 MB max, checked type, private bucket.
- Account export and delete in settings.
- Candidate pages, tracker pages and résumés are `noindex` and never in the sitemap.

## SEO

- Job pages carry `JobPosting` structured data matching the visible listing, with `applicantLocationRequirements` and `jobLocationType` for remote roles, and `validThrough`.
- Expired jobs: remove the structured data and show "This role has closed", or return 410 after a grace period.
- XML sitemap of live jobs and companies. Role and location pages only where real jobs exist.

## Milestones

Each milestone ends with tests on its access rules.

| # | Milestone | What ships | Done when |
|---|---|---|---|
| 0 | Setup | Supabase project, Fly apps, domain, Resend, repo skeleton, all tables with access rules and tests, CI deploy, worker | `joinocelot.com` serves the app from Fly. Code done; accounts per `docs/setup.md` |
| 1 | Foundation (`docs/m1-foundation.md`) | Shared parts, email code and Google sign-in, profile, company settings and invites, email pipeline, admin, delete and export, backups, monitoring, places and categories | A user can sign up, make a company and invite a teammate. Tests prove one org can't read another |
| 2 | Marketplace (`docs/m2-marketplace.md`, done) | Job form, preview, review queue, job and company pages, search and filters, report button | An employer publishes a reviewed job and it shows in search |
| 3 | My search (`docs/m3-my-search.md`, done) | Tracker board and list, add external job by URL, notes, tasks, interviews, résumé upload | A candidate tracks Ocelot jobs and outside jobs together |
| 4 | Applications (`docs/m4-applications.md`, done) | Apply on Ocelot, screening answers, snapshot, applicant pipeline, emails | The full loop works end to end |
| 5 | Billing and alerts (`docs/m5-billing-alerts.md`, done) | Stripe Checkout, webhook, credits, saved-search alerts, weekly digest | A paid job goes live only after payment and review |
| 6 | Private beta (job board sync: `docs/job-boards.md`) | Founding employers, 50–100 live jobs, fixes | The loop runs with real people |

Planning estimate for one full-time developer: 10–14 weeks to public beta.

## Running cost

Monthly totals. Anything not confirmed on the vendor's own page is marked "check".

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| Supabase (dev-omniscient org: Free while testing, Pro before real users; Micro compute covered by the $10 credit) | $25 | $25 |
| Supabase compute upgrade (Small at Growth) | $0 | $5 (check) |
| Fly.io web app, shared-cpu-1x 512 MB, always on, Singapore | $4 (check) | $8, two machines (check) |
| Fly.io worker, shared-cpu-1x 256 MB | $2 (check) | $2 (check) |
| Resend email (Pro $20 for 50,000 a month at Beta once alerts start, Scale $90 for 100,000 at Growth) | $20 (check) | $90 (check) |
| Stripe fees (Singapore account, about 3.4% + S$0.50 per card payment) | about $5 on $100 of sales (check) | about $140 on $3,000 of sales (check) |
| Sentry errors (free tier) | $0 | $26 (check) |
| PostHog analytics (free tier) | $0 | $0 (check) |
| Domain joinocelot.com (about $12 a year) | $1 | $1 |
| Claude tokens | $0 (no AI at launch) | $0 |
| **Total** | **about $57** | **about $297** |

AI is off for launch. When URL extraction for outside jobs is added (Milestone 7 or later), add its token cost here.
