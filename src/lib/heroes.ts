// Photos for the top of role and place pages (HeroBand). Each file is in public/heroes, cropped to 16:9 at 960 by 540
// and compressed to WebP. Only free licenses that allow commercial use: CC0, public domain, CC BY or CC BY-SA (both
// need the credit and license shown under the photo, which links to the source). source is the photo's page on
// Openverse or Wikimedia Commons.
// tests/heroes.test.ts checks every file exists, stays small and has alt text.

import type { Filters } from "./search.ts";

export type Hero = { file: string; alt: string; credit: string; license: string; source: string; focus?: string };

const ov = (id: string) => `https://openverse.org/image/${id}`;

// Keyed like the counts table: "c:engineering" for a job area, "r:frontend" for a role, "city:toronto" for a city, plus
// "remote" for remote searches and "default" for everything else (states, countries, levels).
export const HEROES: Record<string, Hero> = {
  "c:engineering": { file: "engineering.webp", alt: "A developer writing code on a laptop", credit: "Christina Morillo", license: "CC0", source: ov("63c6c78d-f6bc-4352-ae27-38f0d66dd797") },
  "c:design": { file: "design.webp", alt: "Designers going over wireframes on a whiteboard", credit: "Christina Morillo", license: "CC0", source: ov("b1257a82-2c1e-4d79-8021-5ee1d0769044") },
  "r:product_design": { file: "product-design.webp", alt: "App wireframes sketched in a notebook", credit: "Jeffrey Betts", license: "CC0", source: ov("e0497a33-3d53-45de-b9eb-c30678a55bbb") },
  "city:toronto": { file: "toronto.webp", alt: "The Toronto sign at Nathan Phillips Square at night", credit: "Hamza Ullah", license: "CC0", source: ov("c71e4263-d416-4734-8f96-1b261e3c2b88") },
  "city:calgary": { file: "calgary.webp", alt: "The Calgary skyline reflected in the Bow River", credit: "Tamsintj", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Calgary_Skyline_from_Prince%27s_Island_Park.jpg" },
  "city:minneapolis": { file: "minneapolis.webp", alt: "Downtown Minneapolis and the Third Avenue Bridge over the Mississippi", credit: "Guywelch2000", license: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:Downtown_Minneapolis_skyline_across_the_Mississippi_River.jpg" },
  "city:ottawa": { file: "ottawa.webp", alt: "Parliament Hill above the Ottawa River", credit: "Dennis G. Jarvis", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:Ottawa_skyline_2018.jpg" },
  "city:portland": { file: "portland.webp", alt: "Downtown Portland with Mount Hood behind it", credit: "Spicypepper999", license: "CC0", source: "https://commons.wikimedia.org/wiki/File:Portland_Oregon_Aerial,_June_2024.jpg" },
  "city:salt-lake-city": { file: "salt-lake-city.webp", alt: "Salt Lake City below the Wasatch Mountains", credit: "Garrett", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Salt_Lake_City_skyline,_August_2011.jpg" },
  "city:philadelphia": { file: "philadelphia.webp", alt: "The Philadelphia skyline over the Schuylkill River", credit: "King of Hearts", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Philadelphia_from_South_Street_Bridge_July_2016_panorama_2.jpg" },
  "city:san-jose": { file: "san-jose.webp", alt: "Downtown San Jose below the hills", credit: "Cpudude91 at English Wikipedia", license: "Public domain", source: "https://commons.wikimedia.org/wiki/File:San_Jose,_California,_USA.jpg" },
  "c:customer_success": { file: "customer_success.webp", alt: "A customer success manager on a phone call", credit: "Burst", license: "CC0", source: "https://openverse.org/image/8029105c-37f3-4e0d-9cd3-2dcb993c1243" },
  "c:marketing": { file: "marketing.webp", alt: "Scrolling a social media feed on a phone", credit: "Erik Lucatero", license: "CC0", source: "https://openverse.org/image/7c3cc776-6c2d-4ac2-a550-c56614312a13" },
  "c:operations": { file: "operations.webp", alt: "Packing a shipping box at a work table", credit: "Bench Accounting", license: "CC0", source: "https://openverse.org/image/6d8c6f90-6e4b-4998-a456-79afaba3e4ef" },
  "city:chicago": { file: "chicago.webp", alt: "The Chicago skyline at night across Lake Michigan", credit: "NorbertNagel", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Chicago_Skyline_Sunrise_March_15_2026_-_02.jpg" },
  "city:denver": { file: "denver.webp", alt: "Downtown Denver towers above a city park", credit: "David Herrera", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Mount_Evans_and_Denver_skyline_from_City_Park_Golf_Course.jpg" },
  "city:los-angeles": { file: "los-angeles.webp", alt: "Downtown Los Angeles at night above the freeway", credit: "Ron Reiring", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:Los_Angeles_and_skyline_at_night,_California,_U.S.jpg" },
  "r:backend": { file: "backend.webp", alt: "Lines of code on a screen, close up", credit: "Markus Spiske", license: "CC0", source: "https://openverse.org/image/2d70471f-67e8-4d54-8890-868f4b8aad16" },
  "remote": { file: "remote.webp", alt: "A bright home office desk by a window", credit: "Kristin Hardwick", license: "CC0", source: "https://openverse.org/image/56af3e05-2c26-4319-b198-1e83fcbc2007" },
  "c:data": { file: "data.webp", alt: "Someone reviewing analytics charts on a laptop", credit: "Negative Space", license: "CC0", source: "https://openverse.org/image/2d3fb7e3-3321-4d08-86b3-d172ab987733" },
  "c:education": { file: "education.webp", alt: "An apple on a stack of books", credit: "Michal Jarmoluk", license: "CC0", source: "https://openverse.org/image/507aeb37-53d8-4858-97d7-18f884d8549e" },
  "c:finance": { file: "finance.webp", alt: "Working through numbers with a calculator and a spreadsheet", credit: "Wilfred Iven", license: "CC0", source: "https://openverse.org/image/9b7ef946-1e8c-4654-bd90-ee183d6056a3" },
  "c:healthcare": { file: "healthcare.webp", alt: "Medical staff reviewing an X-ray together", credit: "EVG Photos", license: "CC0", source: "https://openverse.org/image/d7a2c748-9f1f-4f87-abe1-bcd9fe996df1" },
  "c:legal": { file: "legal.webp", alt: "Stone columns of a courthouse", credit: "The Building Envelope", license: "CC0", source: "https://openverse.org/image/80efe252-059c-4ab7-baa9-1c16cd098233" },
  "c:people": { file: "people.webp", alt: "A job interview in a bright office with a yellow chair", credit: "LinkedIn Sales Navigator", license: "CC0", source: "https://openverse.org/image/ff96a108-bb95-4e42-8783-3aac8bdc75cd" },
  "c:product": { file: "product.webp", alt: "A product manager sketching on a whiteboard wall", credit: "Startup Stock Photos", license: "CC0", source: "https://openverse.org/image/4a23ec82-e0f9-4f68-883b-275a37bc70f4" },
  "c:sales": { file: "sales.webp", alt: "Two colleagues talking at a table by a window", credit: "Christina Morillo", license: "CC0", source: "https://openverse.org/image/cdab127b-2f35-4ecf-a0ee-243caeedb51d" },
  "city:austin": { file: "austin.webp", alt: "The Austin skyline at sunset", credit: "Steve", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:Austin_Texas_skyline,_December_2023_-_Evening.jpg" },
  "city:boston": { file: "boston.webp", alt: "Boston's Financial District from the harbor", credit: "Nkon21", license: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:Skyline_of_Downtown_Boston_20240702.jpg" },
  "city:dallas": { file: "dallas.webp", alt: "Downtown Dallas towers at sunset", credit: "Matthew T Rader", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Fountain_Place_Tower_in_Dallas_Texas_with_A_Dramatic_Sunset.jpg" },
  "city:detroit": { file: "detroit.webp", alt: "The Detroit skyline across the river", credit: "Michael Tighe", license: "CC0", source: "https://commons.wikimedia.org/wiki/File:Detroit_Skyline_(123143197).jpeg" },
  "city:edmonton": { file: "edmonton.webp", alt: "Downtown Edmonton and the Walterdale Bridge at night", credit: "Chris Woodrich", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Walterdale_Bridge_into_downtown_Edmonton,_Alberta,_2026-09-26.jpg" },
  "city:houston": { file: "houston.webp", alt: "The Houston skyline above the trees", credit: "David Daniel Turner", license: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:Downtown_Houston,_TX_Skyline_-_2018.jpg" },
  "city:miami": { file: "miami.webp", alt: "Miami's Brickell skyline across Biscayne Bay", credit: "Wilfredor", license: "CC0", source: "https://commons.wikimedia.org/wiki/File:Miami,_Florida_skyline.jpg" },
  "city:montreal": { file: "montreal.webp", alt: "Downtown Montreal seen from Mount Royal", credit: "Taxiarchos228", license: "CC BY 3.0", source: "https://commons.wikimedia.org/wiki/File:Montreal_-_QC_-_Skyline.jpg" },
  "city:nashville": { file: "nashville.webp", alt: "The Nashville skyline at night over the Cumberland River", credit: "Kaldari", license: "Public domain", source: "https://commons.wikimedia.org/wiki/File:Nashville_skyline_2009.jpg" },
  "city:new-york": { file: "new-york.webp", alt: "Midtown Manhattan and the Empire State Building at dusk", credit: "Dllu", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu.jpg" },
  "city:phoenix": { file: "phoenix.webp", alt: "Office towers in downtown Phoenix", credit: "Wikimedia Commons", license: "Public domain", source: "https://commons.wikimedia.org/wiki/File:Phoenix_skyline_Arizona_USA.jpg" },
  "city:pittsburgh": { file: "pittsburgh.webp", alt: "Pittsburgh's rivers and downtown from Mount Washington", credit: "Dllu", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Downtown_Pittsburgh_from_Duquesne_Incline_in_the_morning.jpg" },
  "city:raleigh": { file: "raleigh.webp", alt: "The Raleigh skyline on a summer day", credit: "Abhiram Juvvadi", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Raleigh_Skyline.jpg" },
  "city:san-diego": { file: "san-diego.webp", alt: "The San Diego skyline over the bay at dusk", credit: "Nserrano", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:San_Diego_Skyline_at_Dawn.jpg" },
  "city:san-francisco": { file: "san-francisco.webp", alt: "The San Francisco skyline at night across the bay", credit: "Dllu", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:San_Francisco_skyline_of_April_2017_seen_from_Treasure_Island.jpg" },
  "city:seattle": { file: "seattle.webp", alt: "Downtown Seattle at dusk with traffic trails", credit: "Dllu", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Seattle_I-5_skyline_dllu.jpg" },
  "city:vancouver": { file: "vancouver.webp", alt: "Downtown Vancouver and Canada Place from the water", credit: "Spyder212", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Canada_Place_with_Downtown_Vancouver,_British_Columbia,_Canada_Masson.jpg" },
  "city:waterloo": { file: "waterloo.webp", alt: "Buildings in Waterloo, Ontario", credit: "Andre Recnik", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:This_is_Waterloo_-_-7_(6991823151).jpg" },
  "default": { file: "default.webp", alt: "A team working together at a shared table", credit: "Startup Stock Photos", license: "CC0", source: "https://openverse.org/image/60d07cfc-45e4-4416-9737-4a446f33bec0" },
};

// The photo for a search: its role's, else its job area's, else its city's, else the remote photo for remote searches,
// else the default. Roles with no photo of their own use their area's, so every marketing role shows the marketing
// photo, and every page has one.
export function heroFor(f: Filters): Hero {
  return (f.role && HEROES[`r:${f.role}`]) || (f.category && HEROES[`c:${f.category}`]) || (f.city && HEROES[`city:${f.city}`])
    || (f.where.includes("remote") && HEROES.remote) || HEROES.default;
}
