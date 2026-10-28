# Ocelot

A job marketplace with a built-in job search workspace (joinocelot.com). Companies publish jobs. Candidates find jobs and track every application, including jobs they found elsewhere. Launch niche: English-speaking marketing, sales and customer success roles in Vietnam and Southeast Asia.

Start with `docs/plan.md` (what to build and in what order), `docs/setup.md` (Supabase, Fly and the other accounts) and `docs/brand.md` (look and copy).

Stack: Next.js 16 and TypeScript on Fly.io (`ocelot-web`, `ocelot-worker`, region `sin`), Supabase (Postgres, Auth, Storage) in Singapore under the dev-omniscient org, Stripe Checkout, Resend for email.

Commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test` (unit), `npm run test:db` (access boundary tests on a local Postgres, `DATABASE_URL`), `npm run build`. CI runs all of them, then deploys `main` to Fly and pushes new files in `supabase/migrations`.

Where things are: tables and access rules in `supabase/migrations/`, boundary tests in `tests/db/boundaries.sql`, Supabase clients in `src/lib/supabase/`, job fields and Google JobPosting data in `src/lib/jobs.ts`, shared parts in `src/components/` (`ui.tsx` for buttons, fields, tags and tables; `Select`, `Dialog` with `askConfirm`/`askText`/`tell`, `Toast`, `Menu`, `Switch`, `FileDrop`, `Tabs`; previewed at `/admin/ui`), fixed lists in `src/lib/places.ts` and `src/lib/taxonomy.ts` (mirrors of the database lists, checked by `tests/lists.test.ts`), database types in `src/lib/database.types.ts` (`npm run types`), brand tokens in `src/app/globals.css`, background work in `scripts/worker.mjs` (reads `jobs_queue`). Email: templates in `src/lib/email/templates.ts` with samples previewed at `/admin/emails`; send only through `queueEmail` in `src/lib/email/send.ts`, never inside a page request. Emails people can turn off set `pref` and get signed unsubscribe links.

## Rule: every build includes its running cost
- Every build plan, feature or milestone states what it adds to the monthly bill: servers plus every paid service. Give monthly totals at two stages: Beta (50 employers, 1,000 candidates) and Growth (500 employers, 20,000 candidates).
- Mark any price that couldn't be confirmed on the vendor's own page as "check".

## Rule: privacy first
- Every table has row-level security on. Employers see only applications sent to their company. Tracker items, tracker notes and tasks belong to the candidate alone and no employer query can reach them.
- Résumés live in a private bucket and are opened with short signed links.
- Never ship a change to access rules, applications, payments or job publishing without a test in `tests/db/boundaries.sql` that proves the boundary.
- The service role client (`createAdmin`) skips row level security. Use it only after the server has checked who is asking.

## Rule: honest states
- An application record exists only when a candidate submitted through Ocelot. Clicking an external Apply link never marks a job as Applied; ask the candidate.
- The employer's hiring stage and the candidate's tracker stage are separate fields and never overwrite each other.
- A job goes live only when review and payment (when needed) are both done.

## Rule: no browser pop-ups or browser dropdowns
- Never use `<select>`, `window.prompt`, `window.confirm` or `window.alert`. Use `Select` from `src/components/Select.tsx` and `askConfirm`, `askText` or `tell` from `src/components/Dialog.tsx`. `tests/ui-rules.test.ts` fails the build on these, on raw hex colors and on spinning loaders.

## Rule: one brand style
- Follow `docs/brand.md` for the app, the website and emails. Colors and sizes come from the tokens in `src/app/globals.css`, never a raw hex.
- Yellow is for the one primary action, a selected state or a short highlighted phrase. Status always has a text label.
