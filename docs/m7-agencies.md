# Milestone 7: Agencies

Goal: a recruiting agency runs hiring for many client companies from one place. Agency staff see every client's jobs and applicants, and the agency pays once for all of them. Everything Ocelot promises still holds: candidates know who gets their application, their search stays private, and every listing says who posted it.

## Where this sits in the plan

Ocelot is a job marketplace and a private job search workspace in one (`docs/plan.md`). Agencies add more employers and more jobs to the marketplace. They never get a view into My search.

| Ocelot rule | What it means for agencies |
|---|---|
| Privacy first | Agency staff reach applications sent to their clients' jobs. Tracker items, notes, tasks and résumés outside an application stay out of reach, as they do for any employer |
| Honest states | Every agency job says "Posted by {agency} for {client}". Candidates see who receives their application before they send it |
| Open about paid placement | Agency jobs follow the same Standard and Featured rules. Featured is labeled "Promoted listing" |
| Trust and safety | Each new agency goes through review, like a first-time company. No fees charged to candidates, ever. An agency that breaks this is suspended with all its client jobs |
| One account, many hats | One sign-in can be a candidate, a company member and agency staff at once |

## Step 0: finish the OVH move for Ocelot

Every app now runs on the OVH SYS-1 (6 cores, 32 GB). The Hostinger CPU limits that slowed Ocelot no longer apply.

| Task | Status |
|---|---|
| Docs moved from Hostinger to OVH (`CLAUDE.md`, `deploy/README.md`, `docs/setup.md`, `docs/plan.md`, `docs/job-boards.md`, `docs/legal.md`) | Done |
| Privacy page names OVHcloud and says data is stored in Canada | Done (needs the lawyer's read in `docs/legal.md`) |
| Migration `038_ovh_limits.sql`: imported job cap back to 25,000, boards sync every 6 hours (name list) or daily (crawl) | Done. `ocelot-migrate` applies it once it's on `main` |
| New boards found by discovery use the same intervals (`src/lib/ats/discover.ts`) | Done |
| `ocelot-jobs` gets one full CPU core | Done in the repo. Copy `deploy/ocelot-jobs/docker-compose.yml` to `/docker/ocelot-jobs` and run `docker compose up -d` |
| Start Ocelot on OVH if it is still stopped from the move | On the server |
| Point `@`, `www` and `db` for joinocelot.com at `149.56.19.140` | Namecheap |
| Backups and the uptime check on OVH (`deploy/ovh/README.md`, step 6) | On the server |

## Names

"Account" already means a person's sign-in in the code (`src/lib/account.ts`, account export and delete in settings). So the new tables are called `agencies`, and the product says **Agency**.

## Data model

Step 1 (done): migration `039_agencies.sql`. Step 4 (done) adds the billing columns in `041_agency_credits.sql`: a credit is spent from the company's own first, then its agency's, and only agency staff spend the agency's.

| Table | Holds | Who can read | Who can write |
|---|---|---|---|
| `agencies` | Name, slug, logo, website, about, `business_verified_at`, `suspended_at` | Public when a client has a live job. Staff always | Agency owner and admin |
| `agency_members` | agency, user, role (owner, admin, recruiter) | Staff of that agency | Owner and admin, through functions |
| `agency_invites` | Same shape and limits as `org_invites` | Owner and admin | Functions only |
| `agency_client_requests` | An agency asks to manage a company that already has its own team | Both sides | Functions only |
| `orgs.agency_id` | The agency that manages this company, or empty | Same as the company | Functions only |
| `orgs.suspended_by_agency` | The company is suspended because its agency is | Same as the company | Ocelot only |
| `orders.agency_id`, `entitlements.agency_id` (step 4) | Credits bought by the agency. Each row has a company or an agency, never both | Agency staff | Server only (webhook) |

How access works:
- Every access rule already goes through `is_org_member` (`supabase/migrations/001_foundation.sql:70`). It also returns true for staff of the company's agency. Agency owners and admins act as company admins. Recruiters act as company members.
- Agency staff never become company owners. Only a company's own owner can delete the company. The owner, or the agency's owners and admins, can end the arrangement (`remove_agency_client`).
- Managing a company's own team (roles, removals, invites) uses `is_direct_org_member`, so agency staff can't touch it.
- Suspending an agency (`suspend_agency`, Ocelot only) suspends every client with it, so every list that hides suspended companies hides them too. Lifting it clears only those suspensions.
- Logos: `<org id>/<file>` for companies, `agencies/<agency id>/<file>` for agencies (`can_write_logo`).
- Job board discovery never matches an imported board to an agency's client by name (`src/lib/ats/discover.ts`).
- An agency owner can delete a client company the agency made, when nobody else is in it (`delete_agency_client`). When the last person leaves an agency, the agency goes, and so do the clients it ran alone.

How a company joins an agency:
- **New client.** Agency staff create the company from the agency page. It starts out managed by the agency.
- **Existing company.** The agency sends a request. The company owner accepts it on `/employer/team`. Removing the agency later takes effect at once.
- **Imported company** (from job board sync, no members). Agencies can't attach to these. A company has to claim its page first.

## Product

| Area | Change |
|---|---|
| Job pages and cards | "Posted by {agency} for {client}", with both names linked. Google `JobPosting` keeps the client as `hiringOrganization` (check Google's rules for staffing agencies) |
| Company pages | "Hiring through {agency}" on managed companies |
| Agency page `/agencies/[slug]` | Public profile with its clients' live jobs |
| Find jobs | New filter: "Hide agency jobs" |
| Apply form | "Your application goes to {agency}, recruiting for {client}." Shown above the Send button |
| Application snapshot | Records the agency at send time, so the candidate always sees who received it |
| My search | Tracker cards from agency jobs show both names. Nothing else changes |
| For employers | Switcher groups clients under their agency. New pages: `/employer/agency` (profile, clients, add a client), `/employer/agency/team`, `/employer/agency/billing` |
| Applicants | Agency staff see one list across all clients, with a client filter |
| Invites | `/invite/[token]` accepts agency invites |
| Emails | Agency invite, client request, and a client request answer. Application emails go to the client's team and the agency staff |
| Alerts and weekly digest | Agency jobs show up labeled. Saved searches with "Hide agency jobs" leave them out |
| Admin | `/admin/agencies`: review, verify, suspend. Suspending an agency hides every client job it posted |
| Account delete | `deletionPlan` stops the only owner of an agency with other staff from deleting their sign-in, the same way it does for companies |

## Boundary tests

Added to `tests/db/boundaries.sql`:

- Staff of agency A can't read agency B's clients, jobs, applicants or hiring notes.
- A recruiter can't invite staff, change roles or buy credits.
- Agency staff can't delete a company that has its own team, or make themselves its owner.
- No agency can manage an existing company without its owner's approval, or an imported company at all.
- Removing a company from its agency cuts off staff access in the same transaction.
- Agency credits can be spent only on that agency's clients.
- A suspended agency's client jobs drop out of public lists, search, alerts and the sitemap.
- No agency query reaches tracker items, tracker events, tasks, interviews, saved jobs or résumés outside an application.
- The application snapshot names the agency, and later changes to the agency don't change it.

## Order and size

| Step | Part | Size for one developer |
|---|---|---|
| 0 | Finish the OVH move for Ocelot, update docs, raise limits (repo part done) | 1 day |
| 1 | Migration, `is_org_member` change, boundary tests (done) | 2–3 days |
| 2 | Agency pages, staff, invites, client requests (done; end-to-end test `tests/e2e/agency.cjs`) | 3–4 days |
| 3 | Labels on jobs, companies, apply form, tracker, filter (done; migration `040_agency_labels.sql`) | 2 days |
| 4 | Shared credits and the webhook (done; migration `041_agency_credits.sql`, end-to-end test `tests/e2e/agency-billing.cjs`) | 1–2 days |
| 5 | Admin review and suspend, emails, end-to-end test | 2 days |
| | **Total** | **11–14 working days** |

## Done when

1. An agency signs up, passes review and invites a recruiter.
2. The recruiter creates two clients and publishes a job for each with agency credits.
3. A candidate sees "Posted by {agency} for {client}", applies, and tracks the job in My search.
4. The recruiter moves the applicant to Interviewing. The candidate's tracker stage stays where they put it.
5. An existing company accepts the agency, then removes it, and the agency loses access right away.
6. CI is green with the new boundary tests.

## Decisions

Each has a default. M7 is built with the default unless you choose otherwise.

| # | Question | Default |
|---|---|---|
| D1 | Can an agency hide the client's name ("Confidential client")? | No. Ocelot shows who is hiring |
| D2 | Agency prices | Same as companies ($49 Standard, $99 Featured), with credits shared across clients |
| D3 | Can a client company's own team read the agency's hiring notes? | Yes. Notes belong to the company's hiring, and both sides work on it |
| D4 | Do agency jobs count toward the imported job cap? | No. Only job board sync counts |

## Running cost

Monthly totals. "Check" marks prices not confirmed on the vendor's own page.

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| Already running (`docs/plan.md`), with the OVH SYS-1 in place of the Hostinger KVM 2. The server is shared with the other apps and already paid | about $27 (check the OVH invoice) | about $258 (check the OVH invoice) |
| New tables and pages (same Postgres and containers on the OVH server) | $0 | $0 |
| Agency emails (inside the Resend plan already counted) | $0 | $0 |
| Stripe fees on agency sales | counted in the sales line already | counted in the sales line already |
| **M7 adds** | **$0** | **$0** |
| **Total after M7** | **about $27** | **about $258** |
