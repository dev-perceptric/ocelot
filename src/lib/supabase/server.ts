import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseReady } from "@/lib/env";

// Acts as the signed-in person (or a visitor). Row level security decides what they see.
export async function createClient() {
  const store = await cookies();
  // Without settings (a fresh checkout), a stand-in address keeps pages working as a signed-out visitor.
  return createServerClient<Database>(SUPABASE_URL || "http://127.0.0.1:54321", SUPABASE_ANON_KEY || "not-set", {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server components can't set cookies; the proxy refreshes the session instead.
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {}
      },
    },
  });
}

// Skips row level security. Only for server work that has already checked who is asking:
// review, payments, signed résumé links, the admin area.
export function createAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createPlainClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function currentUser() {
  const supabase = await createClient();
  if (!supabaseReady) return { supabase, user: null };
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}
