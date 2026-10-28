// Settings read from the environment. The app still builds and serves public pages when Supabase isn't set yet.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://joinocelot.com").replace(/\/$/, "");
export const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
