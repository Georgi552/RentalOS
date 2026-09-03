import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import type { Lease } from "@/lib/types";
import { updateLease } from "../../actions";
import { LeaseForm } from "../../lease-form";
import { leaseFormOptions } from "../../options";

export default async function EditLeasePage({ params }: PageProps<"/leases/[id]/edit">) {
  const { id } = await params;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("leases")
    .select(
      "id, organization_id, property_id, tenant_id, start_date, end_date, monthly_rent::text, deposit::text, currency, rent_due_day, status, notes, created_at, updated_at",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load lease: ${error.message}`);
  if (!data) notFound();

  const lease = data as unknown as Lease;
  const { properties, tenants } = await leaseFormOptions(supabase, organizationId);

  return (
    <div>
      <Link href={`/leases/${lease.id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Lease
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit lease</h1>

      <LeaseForm
        action={updateLease.bind(null, lease.id)}
        lease={lease}
        properties={properties}
        tenants={tenants}
        submitLabel="Save changes"
        cancelHref={`/leases/${lease.id}`}
      />
    </div>
  );
}
