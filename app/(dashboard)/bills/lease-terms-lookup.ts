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
// but never charged again, and one the lease does not charge at all never
// reaches here.
export function chargeableFromTerm(term?: { payer: string; collection: string }) {
  return term?.payer === "tenant" && term.collection === "via_rent";
}

// Money actually leaves our pocket unless the tenant pays the provider direct.
// Without this the monthly net counts bills we never paid.
//
// not_charged answers true on purpose. The lease says such a bill should not
// exist, but if one is filed by hand anyway then somebody paid it, and that is
// us until told otherwise. The automatic path never relies on this - it sends
// the invoice for review instead (see notChargedFromTerm).
export function paidByLandlordFromTerm(term?: { payer: string; collection: string }) {
  if (!term) return true;
  return !(term.payer === "tenant" && term.collection === "direct");
}

// The lease states this bill type does not apply to the property at all.
// Distinct from an absent term, which only means no active lease says anything
// (migration 0023).
export function notChargedFromTerm(term?: { payer: string; collection: string }) {
  return term?.payer === "not_charged";
}
