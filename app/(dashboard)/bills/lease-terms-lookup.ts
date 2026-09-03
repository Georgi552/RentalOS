import type { SupabaseClient } from "@supabase/supabase-js";

export type TermLookup = Record<string, { payer: string; collection: string }>;

export function termKey(propertyId: string, billType: string) {
  return `${propertyId}:${billType}`;
}

// Bill terms belong to a lease, but a bill is filed against a property, so the
// lookup is keyed by the property's ACTIVE lease. Ended leases are ignored:
// last year's arrangement must not decide this month's bill.
export async function activeLeaseTerms(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<TermLookup> {
  const { data, error } = await supabase
    .from("lease_bill_terms")
    .select("bill_type, payer, collection, lease:leases!inner(property_id, status)")
    .eq("organization_id", organizationId)
    .eq("lease.status", "active");

  if (error) throw new Error(`Не мога да заредя условията: ${error.message}`);

  const lookup: TermLookup = {};

  for (const row of (data ?? []) as unknown as {
    bill_type: string;
    payer: string;
    collection: string;
    lease: { property_id: string } | null;
  }[]) {
    if (!row.lease) continue;
    lookup[termKey(row.lease.property_id, row.bill_type)] = {
      payer: row.payer,
      collection: row.collection,
    };
  }

  return lookup;
}

// Only a bill the tenant pays AND that we collect with the rent belongs on a
// tenant statement. A bill the tenant pays directly to the provider is tracked
// but never charged again.
export function chargeableFromTerm(term?: { payer: string; collection: string }) {
  return term?.payer === "tenant" && term.collection === "via_rent";
}
