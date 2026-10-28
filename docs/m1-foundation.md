# Milestone 1: Foundation

Goal: every later milestone builds on parts that already work. When M1 is done, a person can sign in the way they like, say why they're here, fill in a profile they'll reuse to apply, set up a company with teammates, and get branded emails. You can run the platform from `/admin`. Nothing in M2–M6 should need to redo these parts or move data.

Starts from Milestone 0, which shipped: email-link login, the full table set with access rules, the public pages, the worker and the Fly deploy.

## What M1 fixes from M0

| Gap in M0 | Fix in M1 |
|---|---|
| Login link fails when opened on another device (common: request on laptop, open on phone) | Email also carries a 6-digit code; either works |
| Employer page always picks the first company | Company switcher, remembered in a cookie |
| Deleting a candidate account deletes their applications from the employer's list | Sent applications stay with the company, anonymized (decision D2) |
| Apply button on job pages goes to `/app` | Stays until M4; the job page shows "Applications open soon" for Ocelot-apply jobs |
| No way to edit a company, add a logo or invite people | Company settings and invites (part C) |
| No backups on Supabase Free | Nightly backup from GitHub Actions (part F) |
| Job locations are free text | A fixed list of cities, so M2 filters and location pages work (part G) |

## Parts

Each part ships as its own pull request, merged to `main` and deployed before the next one starts. Order matters: A and G come first because later parts use them.

### A. Shared parts (design system)

Every screen in M2–M5 uses these, so they're built and tested once.

| Part | Notes |
|---|---|
| `Select` | Own listbox with keyboard support (arrows, type to find, Esc). Single and multi pick. Replaces every browser dropdown |
| `Dialog`, `askConfirm`, `tell` | Focus stays inside, Esc closes, focus returns to the button that opened it. Destructive confirm uses the red button and an explicit verb ("Remove member") |
| `Toast` / status line | Announced to screen readers (`aria-live`). For "Saved", "Invite sent" |
| `Menu` | Row actions ("…" menus) |
| `Tabs` | Page sections with their own address (`?tab=`) |
| `Table`, `Pagination` | Member list, admin lists, later the applicant list |
| `Checkbox`, `Switch`, `RadioCards`, `TextArea` | Forms |
| `FileDrop` | Logo now, résumés in M3. Checks type and size before upload |
| `Avatar` / `CompanyLogo` | Initials on canvas when there's no image |
| `Loading` (skeleton) | Keeps layout stable while data loads |
| `ToolIntro` | A tool's first screen: one title, one line, one button |

Also:
- `/admin/ui`: every part on one page, admin only, for checking the look.
- `tests/ui-rules.test.ts`: fails the build on a raw hex color outside `globals.css`, a `<select>`, `window.alert/confirm/prompt`, an icon button with no label, or a status shown by color with no text.

### B. Sign in and profile

| Item | Detail |
|---|---|
| Email code | The Supabase email template shows both the link and `{{ .Token }}`. The login page gets a "Enter the code" field after sending. Uses `verifyOtp` |
| Google sign-in | "Continue with Google" button. Needs a Google Cloud OAuth client (your setup, 15 minutes, see below). Decision D1 |
| First-run question | After the first login: "What brings you to Ocelot?" with two cards: Find a job / Hire for my company. Saved as `profiles.intent`, sends people to `/app` or `/employer`. Either side stays one click away |
| Candidate profile `/app/profile` | Name, headline, current location (country and city), phone (optional), LinkedIn and other links, years of experience, countries they can work in, languages, open to (on-site, hybrid, remote), salary hope (amount, currency, period, private) |
| Account settings `/app/settings` | Email change, notification choices (part D), export my data, delete my account (part F) |
| Time zone | Saved on the profile, default `Asia/Ho_Chi_Minh`. Dates show in the viewer's zone |

Why the full profile now: in M4, applying should be one click with this profile copied into the application snapshot. Building it now also lets early candidates fill it in before jobs arrive.

### C. Companies and teams

| Item | Detail |
|---|---|
| Company settings `/employer/company` | Name, address on Ocelot (slug), website, logo, about, size (1–10, 11–50, 51–200, 201–1,000, 1,000+), industry, office cities |
| Changing the slug | Old address keeps working: `org_slug_history` table, old slugs redirect (protects search results and shared links) |
| Team `/employer/team` | Members with roles. Owner: everything, billing later. Admin: settings, members, jobs. Member: jobs and applicants |
| Invites | Owner or admin enters an email and role. Creates `org_invites` (email, role, hashed token, 7-day expiry). Email with a link `/invite/<token>`. The person must sign in with that same email to accept |
| Invite limits | 20 open invites per company, 50 sends per company per day (stops misuse as a spam tool) |
| Remove, leave, change role | With `askConfirm`. A trigger blocks removing or demoting the last owner |
| Transfer ownership | Owner picks another member; both become owner, then the old one can step down |
| Company switcher | For people in more than one company. Current company in a cookie, checked against membership on every request |
| Email verified label | Set on its own when a member's sign-in email domain matches the company website's domain. Free email domains (gmail.com, yahoo.com, outlook.com, icloud.com and others) never count |
| Company verified label | Set only by an admin (part E), with a note of what was checked |

### D. Email pipeline

| Item | Detail |
|---|---|
| Sending | The app puts emails in `jobs_queue` (`kind = 'email'`) with the finished subject, HTML and text. The worker sends them through Resend and retries with backoff. Nothing sends email inside a page request |
| Templates | `src/emails/`: one layout (600 px, white, ink, yellow button, wordmark) and one file per email. M1 emails: team invite, invite accepted, welcome (optional, decision D5). Plain-text version for each |
| Supabase auth emails | Magic link with code, email change, in the same look. Pasted into Supabase's template settings; copies kept in `supabase/templates/` |
| Preferences | `notification_prefs` table: application updates (default on), job alerts (on when a search is saved), weekly digest (off), product news (off). Private to the user |
| Unsubscribe | Every non-essential email has a signed one-click link and a `List-Unsubscribe` header. Invites and application updates are essential and always send |
| Logging | `email_log` table (to, kind, Resend id, status). Server only. Helps answer "I never got the email" |

### E. Admin `/admin`

Access: `platform_admins` only, checked on the server for every admin page and action. Admin actions use the service role and always write an `audit_events` row.

| Page | Contents |
|---|---|
| Overview | Counts: people, candidates with a profile, companies, members, emails sent today, failed queue tasks |
| Companies | Search, open one, see members and jobs. Actions: mark company verified (with note), mark trusted, suspend (hides all its jobs) |
| People | Search by email. See their companies. Actions: suspend sign-in, resend invite |
| Queue | Failed tasks with their error. Action: retry |
| Audit log | Every admin action and sensitive change, newest first |
| Review queue | Empty until M2. The page and its access rule exist now |

### F. Privacy, backups and monitoring

| Item | Detail |
|---|---|
| Delete account | Removes profile, tracker, tasks, interviews, notes, saved jobs, searches, documents and files. Sent applications follow decision D2. The person must type their email to confirm. Logged in `audit_events` without personal details |
| Export data | One JSON file with everything the person owns. Built by the server, given as a download |
| Terms and Privacy pages | `/terms`, `/privacy`. Draft from the plan's rules; needs a lawyer's read before public beta. Vietnam's personal data rules (Decree 13/2023) apply to candidates there (check) |
| Backups | GitHub Action every night: `pg_dump` of the database, encrypted, kept as a private build file for 30 days. Monthly restore test into a local Postgres in CI. Replaced by Supabase Pro backups later (decision D3) |
| Errors | Sentry free plan for the app and worker. Alerts to your email |
| Product numbers | PostHog free plan, cookieless mode, from day one. Events listed below (decision D4) |
| Uptime | Free external check on `https://joinocelot.com/api/health` every 5 minutes, alert by email (Better Stack or UptimeRobot free) |
| Database types | `supabase gen types` writes `src/lib/database.types.ts`. CI fails if it's out of date |

Events to track from day one (no personal details in event data):
`signed_up`, `intent_chosen`, `profile_completed`, `company_created`, `invite_sent`, `invite_accepted`, `job_viewed`, `search_run`. M2 onward adds job, tracker and application events. These feed the plan's success numbers: activation (tracks 3 jobs), employer responsiveness and interviews.

### G. Data decisions that later milestones depend on

Locked now so M2–M5 never move data.

| Decision | What M1 does | Used by |
|---|---|---|
| Places | `places` table: countries and main cities (Ho Chi Minh City, Hanoi, Da Nang, Singapore, Bangkok, Kuala Lumpur, Jakarta, Manila, Phnom Penh and others), each with a slug. Jobs and companies point to places by id | M2 filters, location pages (`/jobs/remote-vietnam`, `/jobs/ho-chi-minh-city`), Google job data |
| Currencies | Fixed list: VND, USD, SGD, THB, MYR, IDR, PHP | M2 job form, salary filters |
| Categories | Marketing, Sales, Customer success, plus sub-roles (SEO, content, performance, account executive, SDR, account manager, support…) | M2 form and filters, alerts |
| Candidate snapshot shape | Fixed JSON shape copied from the profile at apply time, with a version number | M4 applications |
| Deleted people | `applications.candidate_id` becomes nullable with "set null" on delete, plus `candidate_deleted_at` | M4 pipeline (decision D2) |
| Org slug history | Table and redirect | Company pages forever |
| Audit and queue | Already exist; M1 adds `email_log` and `notification_prefs` | M4 emails, M5 alerts |

All of these come in one migration `003_foundation_two.sql` with boundary tests.

## Boundary tests added

Each in `tests/db/boundaries.sql`, run in CI:

- A person can't accept an invite sent to another email.
- An admin can't invite someone as owner; a member can't invite anyone.
- The last owner can't leave, be removed or be demoted.
- An invite link works once and stops working after 7 days.
- Notification choices and the email log can't be read by anyone else.
- People who aren't platform admins can't call admin functions or read the audit log.
- Deleting an account removes their tracker and files, and leaves the company's copy of a sent application anonymized.
- A suspended company's jobs disappear from public lists.
- Unit tests: invite token hashing, email templates render with no missing values, unsubscribe link signing, free-email domain list.

## Order and size

| Step | Part | Size for one developer |
|---|---|---|
| 1 | A. Shared parts, ui-rules test (done) | 2–3 days |
| 2 | G. Data decisions migration, types generation (done) | 1 day |
| 3 | B. Sign in and profile (done) | 2–3 days |
| 4 | D. Email pipeline | 1–2 days |
| 5 | C. Companies and teams | 3–4 days |
| 6 | E. Admin | 2 days |
| 7 | F. Privacy, backups, monitoring | 2 days |
| | **Total** | **13–17 working days** |

## Done when

1. A new person signs in with Google or an email code on a phone, picks "Find a job" and completes a profile.
2. Another person picks "Hire", creates a company with a logo, invites a teammate, and the teammate joins from the email.
3. Both see the right labels: Email verified when the domain matches, Company verified after you approve it in `/admin`.
4. Deleting a test account removes its data, and the export file contains everything it owned.
5. Last night's backup exists and the restore test passed.
6. Sentry, PostHog and the uptime check all show the new events.
7. CI is green, with the new boundary tests.

## Your setup for M1

| Task | Where | When |
|---|---|---|
| Google OAuth client (web app, redirect `https://tqvtkdftgzlteayzbqvj.supabase.co/auth/v1/callback`), paste client id and secret into Supabase → Authentication → Providers → Google | console.cloud.google.com | Before part B ships |
| Sentry account with two projects (web, worker); add each `SENTRY_DSN` as a Fly secret on its app | sentry.io | Before part F |
| PostHog account (US or EU cloud), project key as GitHub variable `NEXT_PUBLIC_POSTHOG_KEY` | posthog.com | Before part F |
| Uptime check on `https://joinocelot.com/api/health` | betterstack.com or uptimerobot.com | Any time |
| Backup key: a long random passphrase as GitHub secret `BACKUP_PASSPHRASE`, also saved in your password manager | GitHub | Before part F |
| Read the Terms and Privacy drafts; get a lawyer's read before public beta | — | After part F |

## Decisions

Each has a default. M1 is built with the default unless you choose otherwise.

| # | Question | Default |
|---|---|---|
| D1 | Offer Google sign-in? | Yes, next to the email code |
| D2 | When a candidate deletes their account, what happens to applications they already sent? | The company keeps the application with name and contact details removed and the résumé deleted. Shows as "Deleted candidate" |
| D3 | Backups before Supabase Pro | Nightly GitHub backup now; move to Supabase Pro ($25) before the private beta |
| D4 | Product analytics | PostHog, cookieless, from M1 |
| D5 | Send a welcome email after signup? | No. Only emails people need |

## Running cost

Monthly totals. "Check" marks prices not confirmed on the vendor's own page.

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| Already running (M0): Supabase Free, Fly web and worker, Resend free, domain | about $7 | about $56–61 |
| Google sign-in | $0 | $0 |
| Sentry (free plan: 5,000 errors a month) | $0 (check) | $26, Team plan (check) |
| PostHog (free plan: 1 million events a month) | $0 (check) | $0–50, near the free limit (check) |
| Uptime check (free plan) | $0 (check) | $0 (check) |
| GitHub Actions for CI and backups (private repo: 2,000 free minutes a month; about 300 used) | $0 (check) | $0 (check) |
| Resend for invite emails (stays inside 3,000 free a month at Beta) | $0 | covered by the $20 plan already counted |
| **M1 adds** | **$0** | **about $26–76** |
| **Total after M1** | **about $7** (about $32 once Supabase Pro starts) | **about $82–137** |

## What M1 sets up for later

- **M2 Marketplace:** job form uses `Select`, places, currencies and categories. Review queue page exists in `/admin`. Company labels and slugs are ready for job and company pages.
- **M3 My search:** `FileDrop` and the private bucket rules are ready for résumés. Profile time zone drives task reminders.
- **M4 Applications:** one-click apply copies the profile into the fixed snapshot shape. Invite and email pipeline sends application emails. Deleted-candidate rule is settled.
- **M5 Billing and alerts:** notification choices and unsubscribe links exist, so alerts and the digest only add their content. Owner role is the one that pays.
- **M6 Private beta:** admin, audit, backups, error alerts and product numbers are running before the first real user.
