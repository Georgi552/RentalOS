import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { formatMoney } from "@/lib/money";

type LeaseRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: string;
  currency: string;
  status: string;
  property: { name: string } | null;
  tenant: { first_name: string; last_name: string } | null;
};

export default async function LeasesPage() {
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("leases")
    .select(
      "id, start_date, end_date, monthly_rent::text, currency, status, property:properties(name), tenant:tenants(first_name, last_name)",
    )
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });

  if (error) throw new Error(`Could not load leases: ${error.message}`);

  const leases = (data ?? []) as unknown as LeaseRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Leases</h1>
        <Link
          href="/leases/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Add lease
        </Link>
      </div>

      {leases.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">
            No leases yet. A lease connects a tenant to a property for a period.
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
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
                    {lease.tenant
                      ? `${lease.tenant.first_name} ${lease.tenant.last_name}`
                      : "Unknown tenant"}
                    {" · from "}
                    {lease.start_date}
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
