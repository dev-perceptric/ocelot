// US states (and DC) and Canadian provinces and territories, for "where" search. Codes are stored on jobs as
// "US-TX" or "CA-ON" (supabase/migrations/028_regions.sql checks the shape). Plain data, so tests can load it.

export type Region = { code: string; name: string; country: "US" | "CA"; short: string };

const US: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];
const CA: [string, string][] = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"],
  ["NS", "Nova Scotia"], ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"],
  ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"],
];

export const REGIONS: Region[] = [
  ...US.map(([short, name]) => ({ code: `US-${short}`, name, country: "US" as const, short })),
  ...CA.map(([short, name]) => ({ code: `CA-${short}`, name, country: "CA" as const, short })),
];
const BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));
export const regionName = (code: string) => BY_CODE.get(code)?.name ?? code;
export const isRegion = (code: string | null | undefined): code is string => !!code && BY_CODE.has(code);

// The state or province of each US and Canadian city on Ocelot's list (the database keeps the same, places.region).
export const CITY_REGION: Record<string, string> = {
  "new-york": "US-NY", "san-francisco": "US-CA", "los-angeles": "US-CA", seattle: "US-WA", austin: "US-TX", boston: "US-MA",
  chicago: "US-IL", denver: "US-CO", atlanta: "US-GA", miami: "US-FL", "washington-dc": "US-DC", dallas: "US-TX", houston: "US-TX",
  "san-diego": "US-CA", "san-jose": "US-CA", phoenix: "US-AZ", philadelphia: "US-PA", portland: "US-OR", "salt-lake-city": "US-UT",
  minneapolis: "US-MN", nashville: "US-TN", raleigh: "US-NC", pittsburgh: "US-PA", detroit: "US-MI",
  toronto: "CA-ON", vancouver: "CA-BC", montreal: "CA-QC", calgary: "CA-AB", ottawa: "CA-ON", waterloo: "CA-ON", edmonton: "CA-AB",
};

// States and provinces named in a job's location text: "Austin, TX", "Toronto, ON", "Remote - Texas", "Ontario, Canada".
// Two-letter codes count only after a comma or dash, so "IN" or "OR" inside words don't match; state names that are
// also cities or countries (New York, Washington, Georgia) count only after a comma or dash too.
const AMBIGUOUS = new Set(["New York", "Washington", "Georgia", "District of Columbia"]);
export function regionsIn(places: string[]): string[] {
  const out = new Set<string>();
  for (const p of places) {
    for (const r of REGIONS) {
      const code = new RegExp(`[,–—-]\\s*${r.short}\\b`).test(p); // upper case only: ", in" isn't Indiana
      // "Kansas City" is in Missouri; "West Virginia" isn't Virginia.
      const named = new RegExp(`${AMBIGUOUS.has(r.name) ? "[,–—-]\\s*" : "(?<!west\\s)\\b"}${r.name}\\b(?!\\s+city)`, "i").test(p);
      if (code || named) out.add(r.code);
    }
  }
  // "Toronto, ON, CA": CA is Canada there, not California.
  if ([...out].some((c) => c.startsWith("CA-")) && out.has("US-CA") && !places.some((p) => /california/i.test(p))) out.delete("US-CA");
  return [...out];
}
