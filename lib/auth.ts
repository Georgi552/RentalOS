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
    // A tenant account has no organization by design (migration 0024), so
    // landing on a landlord page means the wrong door, not a broken account.
    //
    // The redirect is conditional on actually finding a tenants row. An account
    // that is neither - a tenant whose access was revoked, say - would
    // otherwise bounce between /dashboard and /portal until the browser gave
    // up, and the real problem would never be visible.
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (tenant) redirect("/portal");

    throw new Error(`User ${user.id} has no organization`);
  }

  return {
    supabase,
    user,
    organizationId: data.organization_id as string,
    role: data.role as "owner" | "member",
  };
}

// The tenant side of the same idea. The tenants row is found by user_id, which
// only the landlord can set, and the organization comes from that row rather
// than from anything the browser sent.
//
// Revoking access is a single write of user_id = null, so this returning
// nothing is the normal way a former tenant is turned away.
//
// Both tenant gates live here rather than in a layout: a layout cannot see the
// pathname, so a gate placed there would also guard the two pages it has to
// redirect to - /portal/password and /portal/no-access - and bounce for ever.
// Those two call requireUser() and nothing else.
export async function requireTenant() {
  const { supabase, user } = await requireUser();

  // Set by the landlord when the account is created, cleared by the tenant once
  // they choose their own password. app_metadata, not user_metadata: only the
  // service role can write it, so the tenant cannot clear it themselves.
  if (user.app_metadata?.must_change_password === true) {
    redirect("/portal/password");
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("id, organization_id, first_name, last_name")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load tenant: ${error.message}`);
  }
  if (!data) {
    // Mirror image of the check in requireOrganization, conditional for the
    // same reason.
    const { data: member } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (member) redirect("/dashboard");

    redirect("/portal/no-access");
  }

  return {
    supabase,
    user,
    tenantId: data.id as string,
    organizationId: data.organization_id as string,
    tenantName: `${data.first_name} ${data.last_name}`,
  };
}
