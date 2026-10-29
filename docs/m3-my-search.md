# Milestone 3: My search

Goal: a candidate tracks jobs from Ocelot and jobs found anywhere else in one private place. Done when someone can save an Ocelot job, add an outside job by link, move both through their stages, keep private notes, tasks and interviews on them, and attach the résumé they used.

The tracker is private: only its owner can read it (row level security, tested). Employer hiring stages never change a candidate's tracker stage.

## Parts

Each ships as its own pull request.

### 1. The tracker (done)

| Item | Detail |
|---|---|
| Board `/app/tracker` | Columns Saved, Applied, Interviewing, Offer, Accepted. Closed items (Rejected, Withdrawn, Archived) in their own view. Move cards by dragging or with the card's menu (keyboard friendly) |
| List view | Same items as a table, sortable by stage and date. The default on phones |
| Add a job | Title, company, link, location, pay, stage, notes. For jobs found anywhere |
| Save from Ocelot | "Save job" on every job page. Saved jobs link back to the listing |
| Outside Apply | Clicking "Apply on company site" opens the page, then asks "Did you apply?" Only a Yes moves the card to Applied |
| Card page `/app/tracker/[id]` | Edit details, change stage, private notes, contacts, history of changes, archive or delete |
| Overview `/app` | Counts per stage and the most recent cards |

### 2. Tasks and interviews (done)

| Item | Detail |
|---|---|
| Tasks `/app/tasks` | Follow-ups and deadlines, on a card or on their own, with due dates; overdue, today, upcoming, done |
| Interviews | Date and time in the person's time zone, meeting link, prep notes, on the card |
| Overview | "Next up": the next tasks and interviews |
| Cards | Show the next step: "Interview tomorrow", "Follow up Friday", "Add a next step" |

### 3. Résumés

| Item | Detail |
|---|---|
| `/app/resumes` | Upload PDF or Word (5 MB), name versions, download, delete |
| Checks | Type and size checked in the browser, by storage rules, and by the server reading the file's first bytes (a renamed file is refused and removed) |
| On cards | Pick which résumé version was used for each job |
| Downloads | Short signed links, never public addresses |

## Running cost

| Item | Beta (1,000 candidates) | Growth (20,000 candidates) |
|---|---:|---:|
| Tracker rows in Postgres | $0 | $0 |
| Résumé storage: about 2 files of 300 KB each per active candidate. Supabase includes 1 GB on Free and 100 GB on Pro | $0 (about 0.6 GB) | $0 (about 12 GB, inside Pro) (check) |
| **Milestone 3 adds** | **$0** | **$0** |
