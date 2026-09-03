import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { requireOrganization } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { tenantName, type Tenant } from "@/lib/types";
import { deleteTenant } from "../actions";

type LeaseRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: string;
  currency: string;
  status: string;
  property: { name: string } | null;
};

export default async function TenantPage({
  params,
  searchParams,
}: PageProps<"/tenants/[id]">) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load tenant: ${error.message}`);
  if (!data) notFound();

  const tenant = data as Tenant;

  const { data: leaseData, error: leaseError } = await supabase
    .from("leases")
    .select("id, start_date, end_date, monthly_rent::text, currency, status, property:properties(name)")
    .eq("tenant_id", id)
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });

  if (leaseError) throw new Error(`Could not load leases: ${leaseError.message}`);

  const leases = (leaseData ?? []) as unknown as LeaseRow[];

  return (
    <div>
      <Link href="/tenants" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Tenants
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{tenantName(tenant)}</h1>
        <div className="flex items-center gap-4">
          <Link
            href={`/tenants/${tenant.id}/edit`}
            className="text-sm font-medium text-neutral-900 hover:underline"
          >
            Edit
          </Link>
          <ConfirmDeleteButton
            action={deleteTenant.bind(null, tenant.id)}
            confirmMessage={`Delete ${tenantName(tenant)}? This cannot be undone.`}
          />
        </div>
      </div>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 px-4 py-2">
        {[
          ["Email", tenant.email],
          ["Phone", tenant.phone],
          ["Notes", tenant.notes],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-4 py-2">
            <dt className="w-32 shrink-0 text-sm text-neutral-500">{label}</dt>
            <dd className="text-sm">
              {value?.trim() ? value : <span className="text-neutral-400">&mdash;</span>}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Leases</h2>
      {leases.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">No leases for this tenant yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {leases.map((lease) => (
            <li key={lease.id}>
              <Link
                href={`/leases/${lease.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {lease.property?.name ?? "Unknown property"}
                  </span>
                  <span className="block text-sm text-neutral-500">
                    from {lease.start_date}
                    {lease.end_date ? ` to ${lease.end_date}` : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm">
                    {formatMoney(lease.monthly_rent, lease.currency)}
                  </span>
                  <span className="block text-xs text-neutral-500">{lease.status}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
