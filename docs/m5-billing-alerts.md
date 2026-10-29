# Milestone 5: Billing and alerts

Goal: companies pay for listings, and candidates hear about new jobs. Done when a paid job goes live only after both payment and review, and a candidate who saved a search gets an email with the new matches.

Billing runs through Stripe from a Singapore company (Stripe doesn't take businesses based in Vietnam). Prices are in US dollars.

Rules that hold across every part:
- With payments on, a job goes to review and goes live only with a listing credit attached. The database checks this, not just the screens.
- The webhook is the only thing that marks an order paid. It checks Stripe's signature and handles each Stripe event once.
- A credit stays with its job: a job that's sent back keeps it for the fixed version.
- Alerts and digests can be turned off from every email and from Settings.

## Parts

Each ships as its own pull request.

### 1. Listing credits and Stripe Checkout (done)

| Item | Detail |
|---|---|
| Packages | Standard $49 (30 days), Featured $99 (30 days, shown first in search for 7 days and in the next digest), Founding (free, given by Ocelot during beta) |
| Payments switch | Off until Stripe is set up. While off, jobs need no credit, as today. Ocelot turns it on in admin |
| Sending for review | Uses a credit the company already has (founding or bought). With none, the button opens Stripe Checkout for the chosen package and the job goes to review once the payment lands |
| Webhook | `/api/stripe/webhook`: checks the signature, stores each event id once, marks the order paid, adds the credit, attaches it to the job and sends the job to review |
| Going live | Review passes and a credit is attached. Featured sets 7 days of promotion from the publish date |
| Setup | Stripe account for the Singapore company, two Fly secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and the webhook address. Steps in `docs/setup.md` |

### 2. Billing pages (done)

| Item | Detail |
|---|---|
| `/employer/billing` | Credits left by package, buy credits ahead, orders with Stripe receipts |
| `/admin/billing` | Payments switch, give founding credits to a company, every order, refund an order whose job never went live (refunds through Stripe, removes the credit, moves the job back to draft) |

### 3. Alerts, digest and reminders

| Item | Detail |
|---|---|
| Save this search | On Find jobs: saves the filters with a name. Daily or weekly. Listed in Settings with frequency and delete |
| Alert email | Only jobs published since the last alert, up to 10, with a link to the full search. Nothing new, no email |
| Weekly digest | Mondays, for people who turned it on: featured jobs first, then the week's new jobs |
| Task reminders | The morning a task is due (8:00 in the person's time zone), one email listing that day's tasks |
| Timing | The worker calls a signed app address every hour; the app finds what's due and queues the emails |

## Running cost

| Item | Beta (50 employers, 1,000 candidates) | Growth (500 employers, 20,000 candidates) |
|---|---:|---:|
| Stripe fees, Singapore account: about 3.4% + S$0.50 per card payment, more for cards from other countries | about $5 on $100 of sales (check) | about $140 on $3,000 of sales (check) |
| Resend email. Beta: about 3,300 a month with alerts, past the free 3,000, so Pro at $20. Growth: about 63,000 a month (alerts 24,000, digest 16,000, applications 18,000, reminders 5,000), past Pro's 50,000, so Scale at $90 | $20 (check) | $90 (check) |
| Worker and app: an hourly call, no new machines | $0 | $0 |
| **Milestone 5 total** | **about $25** | **about $230** |

Against the plan's earlier totals this adds $20 at Beta (Resend Pro) and $120 at Growth (Stripe $50 more with Singapore rates, Resend $70 more for Scale). `docs/plan.md` has the new totals.
