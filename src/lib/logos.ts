import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

// Company logos for tracked jobs: the Ocelot job's company, or a company on Ocelot with the same name.
// Runs as the candidate, so only companies with live jobs (and their saved jobs' companies) are seen.
export async function trackerLogos(supabase: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data: items } = await supabase.from("tracker_items").select("id, company, job:jobs(org:orgs(logo_url))").in("id", ids);
  const byName = new Map<string, string[]>();
  for (const i of items ?? []) {
    const logo = (i.job as unknown as { org: { logo_url: string | null } | null } | null)?.org?.logo_url;
    if (logo) out.set(i.id, logo);
    else if (i.company.trim()) byName.set(i.company.trim().toLowerCase(), [...(byName.get(i.company.trim().toLowerCase()) ?? []), i.id]);
  }
  const names = [...byName.keys()].slice(0, 200);
  if (names.length) {
    const { data: orgs } = await supabase.rpc("live_companies");
    const slugs = (orgs ?? []).filter((o) => byName.has(o.name.toLowerCase())).map((o) => o.slug);
    if (slugs.length) {
      const { data: found } = await supabase.from("orgs").select("name, logo_url").in("slug", slugs).not("logo_url", "is", null);
      for (const o of found ?? []) for (const id of byName.get(o.name.toLowerCase()) ?? []) out.set(id, o.logo_url!);
    }
  }
  return out;
}
