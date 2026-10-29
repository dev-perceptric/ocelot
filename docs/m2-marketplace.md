# Milestone 2: Marketplace (done)

Goal: a company posts a job, Ocelot reviews it, and it shows in job search. Done when an employer publishes a reviewed job and candidates can find it by search and filters, open it, and report it.

Built on Milestone 1: shared parts, fixed lists (places, roles, currencies), companies and teams, the email pipeline and the admin area.

## Parts

Each ships as its own pull request.

### 1. Posting and review (done)

| Item | Detail |
|---|---|
| Jobs list `/employer/jobs` | Every job with its state: Draft, Pending review, Needs an update (with the reviewer's note), Published, Closed, Expired |
| Job form `/employer/jobs/new`, `/employer/jobs/[id]` | Title, role, seniority, employment type, workplace, office cities (on-site and hybrid), eligible countries (always), salary range with currency and period (optional, encouraged), description, apply on the company's site. Applying on Ocelot and its up to 5 screening questions switch on in Milestone 4 |
| Preview | The public job page as it will look, before sending for review |
| Actions | Save draft, Send for review, Withdraw from review, Close, Duplicate, Delete (drafts only) |
| Review rules (database) | A job can go to review only when it's complete: description of at least 200 characters, role, seniority, type, workplace, eligible countries, office cities for on-site and hybrid, a link for outside applications, and currency and period whenever pay is given. Suspended companies can't send jobs |
| Trusted companies | Skip review: sending for review publishes at once |
| Editing a live job | For companies that aren't trusted, changing what candidates see sends the job back to review |
| Admin review `/admin/review/[id]` | The job as candidates will see it, the company's labels and history. Publish (live for 30 days) or Send back with a note. Emails to the company's owners and admins either way. Audit log |

### 2. Search and job pages (done)

| Item | Detail |
|---|---|
| Search `/jobs` | Keywords across title, description and company name; part of a word finds titles. Filters: remote / hybrid / on-site, country you can be hired from, US state or Canadian province (offices there plus remote jobs open to the whole country; typing just the name, like "Texas", does the same), city, category and role, company, when it was posted, lowest yearly pay, seniority, employment type, pay shown. Best match (promoted first, then companies take turns: each one's best job, then each one's second, in an order that changes daily) or Newest. 20 per page. One row of filter buttons under the search box (sideways scroll on phones). 50 a page with numbered pages. A job listed more than once (same company, title without place words, workplace and places) shows once. |
| Job page | Company logo and labels, where you can be hired from, pay, facts, description, screening questions listed, apply button (outside link now; Ocelot applications arrive in Milestone 4) |
| Closed and expired jobs | Page stays with "This role has closed", no Google job data, not indexed |
| Company page | Logo, labels, facts, open jobs |

### 3. Reports (done)

| Item | Detail |
|---|---|
| Report button | On every job page. Reason (scam, asks for a fee, misleading, expired, other) and details. Works signed in or out; signed-out reports are limited per visitor |
| Admin `/admin/reports` | Open reports with the job and company, mark actioned or dismissed, link to suspend the company |

## Not in this milestone

Role and city landing pages for search engines (after there are enough live jobs), job alerts (Milestone 5), applications on Ocelot (Milestone 4), payments (Milestone 5).

## Running cost

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| Search runs in Postgres; no search service | $0 | $0 |
| Role and place pages (`/sales-jobs-in-texas`, `/remote-marketing-jobs`, `/jobs-in-ontario`): 24 areas × the US, Canada, every state and province, their cities on the list, and remote. Pages with 3 or more jobs are in the sitemap (in parts of 40,000) and open to search engines; filter mixes without a page of their own stay on `/jobs` and out of search engines | $0 | $0 |
| Job descriptions shown as headings, paragraphs and lists, read from the text on each page view | $0 | $0 |
| Review and report emails (inside Resend free 3,000 a month at Beta) | $0 | covered by the $20 plan already counted |
| **Milestone 2 adds** | **$0** | **$0** |

Growth may need a larger Supabase compute size once search traffic grows (already counted in `docs/plan.md`).
