import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

// Bypasses RLS. Only use where a request has already been authorised.
export function createAdminClient() {
  const { url } = supabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
