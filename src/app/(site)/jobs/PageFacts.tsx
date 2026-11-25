import type { PageSummary } from "@/lib/seoData";

// "$85k" or "CAD 85k".
export function money(n: number, currency: string | null) {
  const k = `${Math.round(n / 1000)}k`;
  return currency === "USD" || !currency ? `$${k}` : `${currency} ${k}`;
}

// The middle half of listed yearly pay, when enough jobs list it to mean something.
export function payRange(s: PageSummary): string | null {
  if (s.pay_listed < 3 || s.pay_low == null || s.pay_high == null) return null;
  const low = money(s.pay_low, s.pay_currency), high = money(s.pay_high, s.pay_currency);
  return low === high ? low : `${low}–${high}`;
}

// One line for search results and link previews: what the page has that others don't.
export function factsLine(heading: string, s: PageSummary | null, { companies: showCompanies = true } = {}): string {
  if (!s || !s.jobs) return `${heading} on Ocelot. Apply on the company's site and track every application.`;
  const what = `${heading.charAt(0).toLowerCase()}${heading.slice(1)}`;
  const top = s.top.slice(0, 3).map((t) => t.name);
  const companies = !showCompanies ? "" : s.companies > 1 && top.length ? ` from ${s.companies.toLocaleString("en-US")} companies, including ${top.length > 1 ? `${top.slice(0, -1).join(", ")} and ${top.at(-1)}` : top[0]}` : top.length ? ` at ${top[0]}` : "";
  const pay = payRange(s);
  return `${s.jobs.toLocaleString("en-US")} ${what}${companies}.${pay ? ` Typical pay ${pay} a year.` : ""} Updated every day.`;
}

// Under a role and place page's heading: the numbers for this search.
export function PageFacts({ s }: { s: PageSummary | null }) {
  if (!s || !s.jobs) return null;
  const pay = payRange(s);
  const remoteShare = Math.round((s.remote / s.jobs) * 100);
  const facts = [
    { value: s.jobs.toLocaleString("en-US"), label: s.jobs === 1 ? "open job" : "open jobs" },
    ...(s.companies > 1 ? [{ value: s.companies.toLocaleString("en-US"), label: "companies hiring" }] : []),
    ...(pay ? [{ value: pay, label: `typical yearly pay, from ${s.pay_listed.toLocaleString("en-US")} listings` }] : []),
    ...(remoteShare > 0 && remoteShare < 100 ? [{ value: `${remoteShare}%`, label: "remote" }] : []),
  ];
  return (
    <section aria-label="About these jobs" className="mt-5">
      {/* Each box grows to fit its number, so pay like "$109k–$191k" stays on one line beside a photo. */}
      <dl className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {facts.map((f) => (
          <div key={f.label} className="border border-border bg-surface p-4 rounded-[var(--radius-card)] sm:min-w-36 sm:flex-1">
            <dt className="text-meta text-muted">{f.label}</dt>
            <dd className="mt-1 whitespace-nowrap text-card font-bold">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
