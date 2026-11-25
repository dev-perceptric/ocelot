// Photos for the top of role and place pages (HeroBand). Each file is in public/heroes, cropped to 16:9 at 960 by 540
// and compressed to WebP. Only free licenses that allow commercial use: CC0, public domain or CC BY (which needs the
// credit shown under the photo). source is the photo's page on Openverse, which names the original site.
// tests/heroes.test.ts checks every file exists, stays small and has alt text.

import type { Filters } from "./search.ts";

export type Hero = { file: string; alt: string; credit: string; license: string; source: string; focus?: string };

const ov = (id: string) => `https://openverse.org/image/${id}`;

// Keyed like the counts table: "c:engineering" for a job area, "r:frontend" for a role, "city:toronto" for a city.
export const HEROES: Record<string, Hero> = {
  "c:engineering": { file: "engineering.webp", alt: "A developer writing code on a laptop", credit: "Christina Morillo", license: "CC0", source: ov("63c6c78d-f6bc-4352-ae27-38f0d66dd797") },
  "c:design": { file: "design.webp", alt: "Designers going over wireframes on a whiteboard", credit: "Christina Morillo", license: "CC0", source: ov("b1257a82-2c1e-4d79-8021-5ee1d0769044") },
  "r:product_design": { file: "product-design.webp", alt: "App wireframes sketched in a notebook", credit: "Jeffrey Betts", license: "CC0", source: ov("e0497a33-3d53-45de-b9eb-c30678a55bbb") },
  "city:toronto": { file: "toronto.webp", alt: "The Toronto sign at Nathan Phillips Square at night", credit: "Hamza Ullah", license: "CC0", source: ov("c71e4263-d416-4734-8f96-1b261e3c2b88") },
};

// The photo for a search: its role's, else its job area's, else its city's. Roles with no photo of their own use their
// area's, so every marketing role shows the marketing photo.
export function heroFor(f: Filters): Hero | null {
  return (f.role && HEROES[`r:${f.role}`]) || (f.category && HEROES[`c:${f.category}`]) || (f.city && HEROES[`city:${f.city}`]) || null;
}
