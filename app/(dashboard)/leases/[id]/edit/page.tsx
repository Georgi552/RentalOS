import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import type { Lease } from "@/lib/types";
import { updateLease } from "../../actions";
import { billTermValues } from "../../bill-terms";
import { LeaseForm } from "../../lease-form";
import { leaseFormOptions } from "../../options";

export default async function EditLeasePage({ params }: PageProps<"/leases/[id]/edit">) {
  const { id } = await params;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("leases")
    .select(
      "id, organization_id, property_id, tenant_id, start_date, end_date, monthly_rent::text, deposit::text, currency, rent_due_day, status, split_rent_and_bills, notes, created_at, updated_at",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load lease: ${error.message}`);
  if (!data) notFound();

  const lease = data as unknown as Lease;
  const { properties, tenants } = await leaseFormOptions(supabase, organizationId);

  const { data: termData, error: termError } = await supabase
    .from("lease_bill_terms")
    .select("bill_type, payer, collection")
    .eq("lease_id", id)
    .eq("organization_id", organizationId);

  if (termError) throw new Error(`Не мога да заредя условията: ${termError.message}`);

  return (
    <div>
      <Link href={`/leases/${lease.id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Договор
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Редакция на договор</h1>

      <LeaseForm
        action={updateLease.bind(null, lease.id)}
        lease={lease}
        billTermValues={billTermValues(termData ?? [])}
        properties={properties}
        tenants={tenants}
        submitLabel="Запази промените"
        cancelHref={`/leases/${lease.id}`}
      />
    </div>
  );
}
