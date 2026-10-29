# Milestone 4: Applications

Goal: the full loop. A candidate applies on Ocelot, the company moves them through its hiring stages, and both get the emails that matter. Done when a candidate can apply with a résumé and screening answers, the company sees exactly what was sent, moves the applicant to a stage, and the candidate sees the update on their tracker card.

Rules that hold across every part:
- Companies see only applications sent to them. Hiring notes are for the company only.
- What was sent stays as it was sent: the snapshot never changes when the profile or job changes later.
- The company's hiring stage and the candidate's tracker stage are separate and never overwrite each other.
- A deleted account leaves the company a record with no personal details and no résumé.

## Parts

Each ships as its own pull request.

### 1. Apply on Ocelot (done)

| Item | Detail |
|---|---|
| `/jobs/[slug]/apply` | Signed in. Name and phone (filled from the profile, saved back to it), a résumé (pick one or upload a new one), the job's screening questions, an optional note to the company (3,000 characters) |
| Sending | One database function checks everything and saves the application: job is live and takes Ocelot applications, company isn't suspended, the résumé is yours, required questions are answered, you're not on the company's team, one application per job, 50 a day at most. People can't add application rows any other way |
| Snapshot | Name, email, phone, headline, city, experience, languages, links, salary hope, the questions with answers, the note, and the job title as they were when sent |
| Tracker | The card moves to Applied (or is made) and records the résumé sent (already in the database) |
| Résumés that were sent | Deleting one hides it from your list and keeps the file for the companies that got it. Deleting your account removes it everywhere |
| Withdraw | From the tracker card. The company sees Withdrawn and can't move it after that |
| Job page | "Apply" opens the form. After applying it reads "Applied 3 Nov" and links to the card |
| Email | A receipt to the candidate |

### 2. Applicant pipeline (done)

| Item | Detail |
|---|---|
| `/employer/applicants` and per job | Table of applicants: name, headline, job, applied, stage. Stage tabs with counts. Select several and move them |
| Stages | New, Reviewing, Interviewing, Offer, Hired, Not moving forward. Withdrawn is set by the candidate only |
| `/employer/applicants/[id]` | The snapshot, answers and note, the résumé through a short signed link, the stage picker, hiring notes from the team, and history |
| Candidate side | The card's "Updates from the company" shows Interviewing, Offer, Hired and Not moving forward. Reviewing stays internal |

### 3. Emails

| Email | To | Can be turned off |
|---|---|---|
| Application sent (receipt) | Candidate | No |
| New applicant | Company members | Yes, per person ("New applicants" in settings) |
| Stage update: Interviewing, Offer, Hired, Not moving forward | Candidate | Yes ("Application updates") |

## Running cost

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| Application rows and events in Postgres | $0 | $0 |
| Email: about 3 per application. Beta about 300 applications a month (900 emails), Growth about 6,000 (18,000 emails). Resend Free covers 3,000 a month, Pro is $20 for 50,000 and is already in the plan's total | $0 (check) | $0 added, inside the $20 already counted (check) |
| Résumé files: sent files are kept, not copied | $0 | $0 |
| **Milestone 4 adds** | **$0** | **$0** |
