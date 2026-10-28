// Countries and cities. Mirrors the places table (supabase/migrations/003_lists_and_profiles.sql);
// tests/lists.test.ts fails if the two drift apart. No imports, so tests can load it directly.

export type Place = { slug: string; kind: "country" | "city"; name: string; country_code: string };

export const PLACES: Place[] = [
  { slug: "vietnam", kind: "country", name: "Vietnam", country_code: "VN" },
  { slug: "singapore", kind: "country", name: "Singapore", country_code: "SG" },
  { slug: "thailand", kind: "country", name: "Thailand", country_code: "TH" },
  { slug: "malaysia", kind: "country", name: "Malaysia", country_code: "MY" },
  { slug: "indonesia", kind: "country", name: "Indonesia", country_code: "ID" },
  { slug: "philippines", kind: "country", name: "Philippines", country_code: "PH" },
  { slug: "cambodia", kind: "country", name: "Cambodia", country_code: "KH" },
  { slug: "laos", kind: "country", name: "Laos", country_code: "LA" },
  { slug: "myanmar", kind: "country", name: "Myanmar", country_code: "MM" },
  { slug: "brunei", kind: "country", name: "Brunei", country_code: "BN" },
  { slug: "hong-kong", kind: "country", name: "Hong Kong", country_code: "HK" },
  { slug: "taiwan", kind: "country", name: "Taiwan", country_code: "TW" },
  { slug: "japan", kind: "country", name: "Japan", country_code: "JP" },
  { slug: "south-korea", kind: "country", name: "South Korea", country_code: "KR" },
  { slug: "india", kind: "country", name: "India", country_code: "IN" },
  { slug: "australia", kind: "country", name: "Australia", country_code: "AU" },
  { slug: "new-zealand", kind: "country", name: "New Zealand", country_code: "NZ" },
  { slug: "united-arab-emirates", kind: "country", name: "United Arab Emirates", country_code: "AE" },
  { slug: "united-kingdom", kind: "country", name: "United Kingdom", country_code: "GB" },
  { slug: "ireland", kind: "country", name: "Ireland", country_code: "IE" },
  { slug: "germany", kind: "country", name: "Germany", country_code: "DE" },
  { slug: "netherlands", kind: "country", name: "Netherlands", country_code: "NL" },
  { slug: "france", kind: "country", name: "France", country_code: "FR" },
  { slug: "united-states", kind: "country", name: "United States", country_code: "US" },
  { slug: "canada", kind: "country", name: "Canada", country_code: "CA" },
  { slug: "ho-chi-minh-city", kind: "city", name: "Ho Chi Minh City", country_code: "VN" },
  { slug: "hanoi", kind: "city", name: "Hanoi", country_code: "VN" },
  { slug: "da-nang", kind: "city", name: "Da Nang", country_code: "VN" },
  { slug: "hai-phong", kind: "city", name: "Hai Phong", country_code: "VN" },
  { slug: "can-tho", kind: "city", name: "Can Tho", country_code: "VN" },
  { slug: "singapore-city", kind: "city", name: "Singapore", country_code: "SG" },
  { slug: "bangkok", kind: "city", name: "Bangkok", country_code: "TH" },
  { slug: "chiang-mai", kind: "city", name: "Chiang Mai", country_code: "TH" },
  { slug: "kuala-lumpur", kind: "city", name: "Kuala Lumpur", country_code: "MY" },
  { slug: "penang", kind: "city", name: "Penang", country_code: "MY" },
  { slug: "jakarta", kind: "city", name: "Jakarta", country_code: "ID" },
  { slug: "bali", kind: "city", name: "Bali", country_code: "ID" },
  { slug: "manila", kind: "city", name: "Manila", country_code: "PH" },
  { slug: "cebu", kind: "city", name: "Cebu", country_code: "PH" },
  { slug: "phnom-penh", kind: "city", name: "Phnom Penh", country_code: "KH" },
  { slug: "hong-kong-city", kind: "city", name: "Hong Kong", country_code: "HK" },
  { slug: "taipei", kind: "city", name: "Taipei", country_code: "TW" },
  { slug: "tokyo", kind: "city", name: "Tokyo", country_code: "JP" },
  { slug: "seoul", kind: "city", name: "Seoul", country_code: "KR" },
  { slug: "bengaluru", kind: "city", name: "Bengaluru", country_code: "IN" },
  { slug: "sydney", kind: "city", name: "Sydney", country_code: "AU" },
  { slug: "melbourne", kind: "city", name: "Melbourne", country_code: "AU" },
  { slug: "dubai", kind: "city", name: "Dubai", country_code: "AE" },
  { slug: "london", kind: "city", name: "London", country_code: "GB" },
];

export const COUNTRIES = PLACES.filter((p) => p.kind === "country");
export const CITIES = PLACES.filter((p) => p.kind === "city");

const BY_SLUG = new Map(PLACES.map((p) => [p.slug, p]));
const COUNTRY_BY_CODE = new Map(COUNTRIES.map((p) => [p.country_code, p]));

export const placeName = (slug: string) => BY_SLUG.get(slug)?.name ?? slug;
export const countryName = (code: string) => COUNTRY_BY_CODE.get(code)?.name ?? code;
export const cityCountry = (slug: string) => BY_SLUG.get(slug)?.country_code ?? null;
