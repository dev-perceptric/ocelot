-- Ocelot opens up: every kind of job, from every country on its list. Job board sync stops keeping to marketing, sales
-- and customer success in the United States and Canada, and the cap on imported jobs goes to 100,000 (measured: at
-- 100,000 jobs on 1 CPU and 1 GB, the first page takes about 0.7 s and a keyword search about 1.2 s before the
-- 5-minute cache). The app's copies: CATEGORIES and CURRENCIES in src/lib/taxonomy.ts, PLACES in src/lib/places.ts
-- (tests/lists.test.ts).

-- ---------- Job areas ----------
alter table public.jobs drop constraint jobs_category_check;
alter table public.jobs add constraint jobs_category_check check (category in ('marketing', 'sales', 'customer_success', 'engineering', 'data', 'design', 'product', 'operations', 'finance', 'people', 'legal', 'healthcare', 'education', 'other'));
alter table public.roles drop constraint roles_category_check;
alter table public.roles add constraint roles_category_check check (category in ('marketing', 'sales', 'customer_success', 'engineering', 'data', 'design', 'product', 'operations', 'finance', 'people', 'legal', 'healthcare', 'education', 'other'));

-- ---------- Countries and cities ----------
insert into public.places (slug, kind, name, country_code, sort) values
  ('spain', 'country', 'Spain', 'ES', 200),
  ('portugal', 'country', 'Portugal', 'PT', 201),
  ('italy', 'country', 'Italy', 'IT', 202),
  ('belgium', 'country', 'Belgium', 'BE', 203),
  ('switzerland', 'country', 'Switzerland', 'CH', 204),
  ('austria', 'country', 'Austria', 'AT', 205),
  ('sweden', 'country', 'Sweden', 'SE', 206),
  ('norway', 'country', 'Norway', 'NO', 207),
  ('denmark', 'country', 'Denmark', 'DK', 208),
  ('finland', 'country', 'Finland', 'FI', 209),
  ('poland', 'country', 'Poland', 'PL', 210),
  ('czechia', 'country', 'Czechia', 'CZ', 211),
  ('romania', 'country', 'Romania', 'RO', 212),
  ('greece', 'country', 'Greece', 'GR', 213),
  ('hungary', 'country', 'Hungary', 'HU', 214),
  ('estonia', 'country', 'Estonia', 'EE', 215),
  ('lithuania', 'country', 'Lithuania', 'LT', 216),
  ('ukraine', 'country', 'Ukraine', 'UA', 217),
  ('israel', 'country', 'Israel', 'IL', 218),
  ('saudi-arabia', 'country', 'Saudi Arabia', 'SA', 219),
  ('qatar', 'country', 'Qatar', 'QA', 220),
  ('turkey', 'country', 'Turkey', 'TR', 221),
  ('egypt', 'country', 'Egypt', 'EG', 222),
  ('south-africa', 'country', 'South Africa', 'ZA', 223),
  ('nigeria', 'country', 'Nigeria', 'NG', 224),
  ('kenya', 'country', 'Kenya', 'KE', 225),
  ('morocco', 'country', 'Morocco', 'MA', 226),
  ('china', 'country', 'China', 'CN', 227),
  ('pakistan', 'country', 'Pakistan', 'PK', 228),
  ('bangladesh', 'country', 'Bangladesh', 'BD', 229),
  ('sri-lanka', 'country', 'Sri Lanka', 'LK', 230),
  ('mexico', 'country', 'Mexico', 'MX', 231),
  ('brazil', 'country', 'Brazil', 'BR', 232),
  ('argentina', 'country', 'Argentina', 'AR', 233),
  ('colombia', 'country', 'Colombia', 'CO', 234),
  ('chile', 'country', 'Chile', 'CL', 235),
  ('peru', 'country', 'Peru', 'PE', 236),
  ('costa-rica', 'country', 'Costa Rica', 'CR', 237),
  ('uruguay', 'country', 'Uruguay', 'UY', 238),
  ('berlin', 'city', 'Berlin', 'DE', 300),
  ('munich', 'city', 'Munich', 'DE', 301),
  ('paris', 'city', 'Paris', 'FR', 302),
  ('amsterdam', 'city', 'Amsterdam', 'NL', 303),
  ('dublin', 'city', 'Dublin', 'IE', 304),
  ('madrid', 'city', 'Madrid', 'ES', 305),
  ('barcelona', 'city', 'Barcelona', 'ES', 306),
  ('lisbon', 'city', 'Lisbon', 'PT', 307),
  ('stockholm', 'city', 'Stockholm', 'SE', 308),
  ('zurich', 'city', 'Zurich', 'CH', 309),
  ('warsaw', 'city', 'Warsaw', 'PL', 310),
  ('tel-aviv', 'city', 'Tel Aviv', 'IL', 311),
  ('mumbai', 'city', 'Mumbai', 'IN', 312),
  ('mexico-city', 'city', 'Mexico City', 'MX', 313),
  ('sao-paulo', 'city', 'São Paulo', 'BR', 314),
  ('buenos-aires', 'city', 'Buenos Aires', 'AR', 315),
  ('bogota', 'city', 'Bogotá', 'CO', 316),
  ('cape-town', 'city', 'Cape Town', 'ZA', 317),
  ('lagos', 'city', 'Lagos', 'NG', 318),
  ('nairobi', 'city', 'Nairobi', 'KE', 319)
on conflict (slug) do nothing;

-- ---------- Currencies jobs abroad pay in ----------
alter table public.jobs drop constraint jobs_currency_list;
alter table public.jobs add constraint jobs_currency_list
  check (salary_currency is null or salary_currency in ('USD', 'CAD', 'EUR', 'GBP', 'AUD', 'INR', 'VND', 'SGD', 'THB', 'MYR', 'IDR', 'PHP'));
alter table public.profiles drop constraint profiles_salary_hope_currency_check;
alter table public.profiles add constraint profiles_salary_hope_currency_check
  check (salary_hope_currency is null or salary_hope_currency in ('USD', 'CAD', 'EUR', 'GBP', 'AUD', 'INR', 'VND', 'SGD', 'THB', 'MYR', 'IDR', 'PHP'));

-- ---------- Job board sync ----------
-- Every board, and every board found from now on, takes all roles from every country on the list. A job somewhere
-- not on the list, or remote with no place at all, still stays out: Ocelot can't say where it can be done from.
alter table public.job_sources alter column niche_only set default false;
alter table public.job_sources alter column countries set default '{US,CA,VN,SG,TH,MY,ID,PH,KH,LA,MM,BN,HK,TW,JP,KR,IN,AU,NZ,AE,GB,IE,DE,NL,FR,ES,PT,IT,BE,CH,AT,SE,NO,DK,FI,PL,CZ,RO,GR,HU,EE,LT,UA,IL,SA,QA,TR,EG,ZA,NG,KE,MA,CN,PK,BD,LK,MX,BR,AR,CO,CL,PE,CR,UY}';
-- Every board syncs again soon (oldest first, a few hundred an hour) to pick up the jobs it used to leave out.
update public.job_sources set niche_only = false, last_synced_at = null,
  countries = (select array_agg(country_code order by sort) from public.places where kind = 'country');

update public.app_settings set max_imported_jobs = 100000 where max_imported_jobs < 100000;
