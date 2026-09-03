import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// proxy.ts is an optimistic gate only. Every page and action that touches
// landlord data calls this to get a verified user.
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return { supabase, user };
}

// The organization is resolved server-side from the session, never taken from
// the browser (context doc section 13).
export async function requireOrganization() {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load organization: ${error.message}`);
  }
  if (!data) {
    throw new Error(`User ${user.id} has no organization`);
  }

  return {
    supabase,
    user,
    organizationId: data.organization_id as string,
    role: data.role as "owner" | "member",
  };
}
