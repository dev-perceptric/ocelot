# Ocelot brand (v1.0, 28 October 2026)

Source: Ocelot Brand Guidelines PDF. This file is the working copy for the build.

## Words

- Tagline: **Find your next move.**
- Candidates: Find relevant jobs. Track every application. Keep your next step in sight.
- Employers: Meet your next great hire. Publish a role and manage applicants in one straightforward workspace.
- Short description: Ocelot helps people find work and organize their job search, while giving companies a simple way to post jobs and manage applicants.
- Names: "Ocelot" in sentences, "OCELOT" in the wordmark, joinocelot.com as the address. Product areas: **Jobs**, **My search**, **For employers**.
- Voice: confident, useful, honest, respectful, open about paid placement. Short sentences and plain verbs. No hunter or prey words, no hustle pressure, no jokes about rejection.

| Say | Avoid |
|---|---|
| Find your next move. | Unlock limitless career possibilities. |
| Add a follow-up for Friday. | Supercharge your career journey. |
| Your application was sent to Example Co. | You are one step closer to your dream job. |
| This role has closed. Your notes are still here. | You missed out! |
| Promoted listing. | Paid placement shown as a personal pick. |

UI copy:
- Empty tracker: "Your next move starts here. Save a job or add one you found elsewhere." Button: "Add a job".
- Application sent: "Application sent. You can track this role in My search." Button: "View application".
- External apply: "This opens the company's application page. After applying, mark the job as Applied."
- Form error: "Add an eligible hiring location so candidates know whether they can apply."
- Job rejected: "Your listing needs an update before it can go live." Then the exact issue and an Edit button.
- Privacy: "Only you can see these notes. The employer cannot access your job search tracker."

## Logo

- Wordmark: uppercase Lato Bold, wide letter spacing. Ink on white is primary; white on ink and ink on yellow are allowed.
- Clear space: the height of the O on every side. Minimum width 120 px.
- Favicon: ink square with a yellow O in the center. Export 16, 32, 48, 180 px.

## Tokens

```css
--color-brand: #FFE100;
--color-brand-hover: #E6CA00;
--color-ink: #1A1A1A;
--color-surface: #FFFFFF;
--color-canvas: #F2F3F4;
--color-muted: #595959;
--color-border: #D3D5D7;
--color-input-border: #8C8C8C;
--font-ui: Lato, Arial, sans-serif;
--font-editorial: Lora, Georgia, serif;
--radius-control: 4px;
--radius-card: 8px;
--control-height: 48px;
--space-unit: 4px;
--duration-fast: 160ms;
```

Status colors (text on surface), always with a text label:

| Meaning | Used for | Text | Surface |
|---|---|---|---|
| Success | Accepted, Hired, Published | #166534 | #DCFCE7 |
| Info | Applied, New | #1E40AF | #DBEAFE |
| In progress | Interviewing, Reviewing | #6B21A8 | #F3E8FF |
| Warning | Pending review, Expiring | #92400E | #FEF3C7 |
| Error | Destructive actions, real errors | #991B1B | #FEE2E2 |
| Neutral | Saved, Withdrawn, Archived, Rejected | ink | canvas |

Rejected is a neutral outcome, never red.

Color balance: marketing about 60% white and canvas, 25% ink, 15% yellow. Product about 85% neutral, 10% ink, 5% yellow. Never yellow text on white, never white text on yellow.

## Type

- Lato for headings and all product text. Lora for editorial body on marketing pages.
- Marketing display 64/70 desktop, 40/44 mobile, Lato 700–900, one short yellow highlight.
- Section heading 40/48 desktop, 30/36 mobile.
- Editorial body 20/32 marketing, 18/30 long form, Lora 400.
- Product: title 28/34, card title 20/26, body 16/24, metadata 14/20, label 12/16.
- Sentence case, left aligned, 55–75 characters a line. Load the Vietnamese subset and test diacritics.

## Layout

- Marketing: 1200 px max width, 12 columns, 24 px gutters, 80–112 px between sections.
- Product: 1440 px shell, 240 px sidebar, 24–32 px content padding.
- Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Page padding: 20 px phone, 32 px tablet, 48–64 px desktop.
- 1 px borders, very light or no shadows.
- Motifs (yellow highlight blocks, diagonal section edges, rosette loops) stay on marketing pages and away from data and forms.
- Icons: one outline set (Lucide), 20 or 24 px, 1.5–2 px stroke. No emoji in navigation.

## Components

- Primary button: yellow with ink text, hover #E6CA00. One per screen.
- Secondary button: ink fill or ink outline.
- Focus: 2 px ink ring with a 2 px white gap.
- Disabled: gray surface and real disabled behavior.
- Inputs: visible label, 48 px tall, help or error text under the field.
- Tap targets at least 44 × 44 px. Loading buttons keep their width and show a busy state.
- Saved job: icon plus the word "Saved".
- Header: yellow bar with the wordmark and "Find jobs", "My search", "For employers".
- Job card order: role, company, location eligibility, salary, how recent. Promoted listings are labeled.
- Tracker: board and list views, keyboard controls to move cards, yellow only for the next useful action.
- Employer nav: Overview, Jobs, Applicants, Company, Team, Billing.
- Publishing flow: Draft → Preview → Package → Review → Publish. Show cost, review status and listing length before payment. Show review status and payment status as two separate tags.

## Access and motion

- Target WCAG 2.2 AA. Ink on yellow 13.3:1, ink on white 17.4:1.
- Keyboard use everywhere, visible focus, linked labels, screen-reader status messages.
- 120–180 ms for hover and focus, up to 240 ms for panels. Respect reduced motion. Never animate a status toward an outcome that hasn't happened.

## Email

- 600 px single column, live text, one clear button, preference links.
- Application updates and promotional digests are separate emails.
- Digest lists role, company, eligible locations, salary when given and link, and says when it was compiled.
