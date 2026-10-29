# Job board sync

Ocelot pulls jobs from companies' public job boards so Find jobs fills up without each company posting by hand. It runs by itself:

1. **Finding boards.** A list of company names (about 425 companies hiring in Southeast Asia to start, plus every company that joins Ocelot) is checked once a week against every board type. A board with jobs that pass the filters is added under the company's name and synced at once. The worker's hourly run checks up to 120 names, for at most 30 seconds.
2. **Syncing boards.** Every board is synced every 6 hours.

When this was built (October 2026), a test run from the starting list found 70 boards and 651 live jobs within four hourly runs, with no errors.

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

## Rules

- Only jobs in the board's chosen countries come in (Vietnam, Singapore, Thailand, Malaysia, Indonesia and the Philippines by default), or remote jobs open to a region like APAC, Asia or worldwide. "Remote" with no place is left out, since it's often one country far away.
- By default only marketing, sales and customer success roles come in, read from the job title. Engineering, design, legal and recruiting titles are left out. Each board can take all roles instead.
- Imported jobs apply on the company's own site ("Did you apply?" as for any outside link). They go live without review: adding the board is the review. They stay live while they're on the board and close when they leave it; a job that comes back reopens.
- The company's team can close an imported job but can't edit it; changes come from the board.
- A board that fails to load changes nothing and shows its error in Admin → Job boards. An empty board where there were more than 5 live jobs is treated as a hiccup, not as every job closing.

## Running cost

| Item | Beta | Growth |
|---|---:|---:|
| Feeds: public, free | $0 | $0 |
| Sync and discovery: inside the existing hourly run on the web app, under a minute an hour | $0 | $0 |
| **Adds** | **$0** | **$0** |
