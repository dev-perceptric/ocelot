# Job board sync

Ocelot pulls jobs from companies' public job boards so Find jobs fills up without each company posting by hand. It runs by itself:

1. **Finding boards.** Two lists feed it:
   - Company names (about 1,300, mostly companies hiring in the US and Canada, plus every company that joins Ocelot), checked once a week against every board type whose address is the company's name. The board's company name must match.
   - About 44,600 boards of the 16 kinds below, found in three months of the public web crawl (Common Crawl, October 2026; `supabase/migrations/029_more_boards.sql`), checked once a month.

   A board with jobs that pass the filters is added under the company's name and synced at once. Discovery stops adding boards once 15,000 imported jobs are live (`app_settings.max_imported_jobs`), so the database stays inside its plan. Raise it after moving Supabase to Pro.
2. **Syncing boards.** Boards from the name list sync every 6 hours; boards from the crawl, once a day.

The hourly call answers at once; board work runs after it: syncing for up to 4 minutes (six boards at a time), finding for up to 4 minutes (up to 1,000 checks, ten at a time), then logos.

When the name list was built (October 2026), a test run found 398 boards and about 4,600 live US and Canadian jobs within three hourly runs. A test of 30 random crawl boards of each kind found US and Canadian jobs on a third of them, which points to roughly 40,000 to 50,000 more jobs across the crawl list (before the cap).

Admin → Job boards shows every board, its live jobs and last error, and has Sync now, Pause and Delete. "Look for a company" adds a name to the list; "Add job board" adds a board by its link. A board Ocelot deletes is never found again.

## Boards

| Board | Link to paste | Feed |
|---|---|---|
| Greenhouse | boards.greenhouse.io/company | `boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true` |
| Lever | jobs.lever.co/company | `api.lever.co/v0/postings/{board}?mode=json` |
| Ashby | jobs.ashbyhq.com/company | `api.ashbyhq.com/posting-api/job-board/{board}` |
| SmartRecruiters | jobs.smartrecruiters.com/Company | `api.smartrecruiters.com/v1/companies/{board}/postings`, plus one call per job for its text |
| Recruitee | company.recruitee.com | `{board}.recruitee.com/api/offers/` |
| Workable | apply.workable.com/company | `apply.workable.com/api/v1/widget/accounts/{board}?details=true` (not yet tried on a live board: it was rate limited when this was built) |

All are public feeds made for career pages. No keys.
| Workday | company.wd5.myworkdayjobs.com/Site | `{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` (searches for sales, marketing and customer success), plus one call per job |
| BambooHR | company.bamboohr.com/careers | `{board}.bamboohr.com/careers/list`, plus one call per job |
| Breezy | company.breezy.hr | `{board}.breezy.hr/json`, plus each job's page |
| Rippling | ats.rippling.com/company/jobs | `api.rippling.com/platform/api/ats/v1/board/{board}/jobs`, plus one call per job |
| Pinpoint | company.pinpointhq.com | `{board}.pinpointhq.com/postings.json` |
| Teamtailor | company.teamtailor.com/jobs | `{board}.teamtailor.com/jobs.rss` |
| Personio | company.jobs.personio.de | `{board}.jobs.personio.de/xml` |
| Jobvite | jobs.jobvite.com/company | the jobs page, plus each job's page |
| JazzHR | company.applytojob.com | the jobs page, plus each job's page |
| iCIMS | careers-company.icims.com/jobs | the search pages, plus each job's page |

Boards read through several calls (`src/lib/ats/readers.ts`) only open jobs whose title Ocelot wants, up to 40 per board. Job pages are read from the JobPosting data they carry for search engines.

## Rules

- Only jobs in the board's chosen countries come in (the United States and Canada by default), or remote jobs open to a region that covers them, like North America or worldwide. Locations are read from cities ("New York", "NYC", "SF"), state and province codes ("Austin, TX", "Toronto, ON") and names. "Remote" with no place is left out, since it could be anywhere.
- By default only marketing, sales and customer success roles come in, read from the job title. Engineering, design, legal, finance, HR, IT support, shop floor and seasonal titles are left out. Each board can take all roles instead.
- Imported jobs apply on the company's own site ("Did you apply?" as for any outside link). They go live without review: adding the board is the review. They stay live while they're on the board and close when they leave it; a job that comes back reopens.
- The company's team can close an imported job but can't edit it; changes come from the board.
- A board that fails to load changes nothing and shows its error in Admin → Job boards. An empty board where there were more than 5 live jobs is treated as a hiccup, not as every job closing.

- Discovery checks the name: a board whose company name isn't the company Ocelot looked for (the same name without words like "Inc" or "Careers", or that name plus one word) is left out. Page names like "HackerRank Careers" become "HackerRank".
- Imported jobs keep their US states and Canadian provinces, read from the location text ("Austin, TX", "Remote - Texas") and their office cities.

## Logos

- Each hourly run, after sync and discovery, looks for logos for every company that has a job board and no logo (up to 1,000, for at most 8 minutes) (`due_logos`, migration 024). A company is looked at again after 30 days if nothing was found.
- Logos are tried in this order until one is found:
  1. The company's website, known from where its jobs link to (a careers page on its own site), where its board sends people, the site its board links to, or a website in its name ("Honeycomb.io"). The logo is the site's phone icon, drawn (SVG) icon or largest icon, then the icons Google and DuckDuckGo keep for it. A site that turns robots away still gets those.
  2. The logo the company uploaded to its job board (Greenhouse, Lever, Ashby). "Your logo here" placeholders are skipped.
  3. A guess at its website (<name>.com, .io, .ai, .co, .app, .ca, also without words like "Labs" or "AI") whose page title names the company.
  4. <name>.com when that site turns robots away: the icon Google keeps for it.
- Pictures are PNG, JPEG, WebP or SVG. An SVG is kept only when it has no scripts, events, embedded pages or outside links. An .ico gives its largest PNG.
- Logos show in their own shape (as tall as the spot, as wide as they are), with no frame. Tracker cards show the logo when the company is on Ocelot.
- Only https addresses with real public names are opened, each redirect is checked, and pages are cut at 2 MB and images refused over 1 MB.
- A company that set its own logo or website keeps it. A live check on the 42 live companies that had no logo found 41, all right; the one left is a wrongly imported board.

## Running cost

| Item | Beta | Growth |
|---|---:|---:|
| Feeds: public, free | $0 | $0 |
| Sync and discovery: inside the existing hourly run on the web app, up to about 8 minutes an hour | $0 | $0 |
| Web app memory 512 MB to 1 GB for the larger board work | $2 (check) | $4, two machines (check) |
| Database: 15,000 imported jobs (about 120 MB) fits Supabase Free; more needs Pro, already in the plan before real users | $0 | $0 |
| Logos: about 10 KB each in Supabase Storage (under 20 MB for 2,000 companies, inside the plan's 100 GB) | $0 | $0 |
| **Adds** | **$2 (check)** | **$4 (check)** |
