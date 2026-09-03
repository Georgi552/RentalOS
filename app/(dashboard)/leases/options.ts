import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantName } from "@/lib/types";

// The property and tenant choices offered by the lease form. Kept in one place
// so the create and edit pages cannot drift apart.
export async function leaseFormOptions(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const [{ data: properties, error: propertyError }, { data: tenants, error: tenantError }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("tenants")
        .select("id, first_name, last_name")
        .eq("organization_id", organizationId)
        .order("last_name")
        .order("first_name"),
    ]);

  if (propertyError) throw new Error(`Could not load properties: ${propertyError.message}`);
  if (tenantError) throw new Error(`Could not load tenants: ${tenantError.message}`);

  return {
    properties: (properties ?? []).map((p) => ({ value: p.id, label: p.name })),
    tenants: (tenants ?? []).map((t) => ({ value: t.id, label: tenantName(t) })),
  };
}
