import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { requireOrganization } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import type { Property } from "@/lib/types";
import { deleteProperty } from "../actions";

type LeaseRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: string;
  currency: string;
  status: string;
  tenant: { id: string; first_name: string; last_name: string } | null;
};

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-4 py-2">
      <dt className="w-32 shrink-0 text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm">
        {value?.trim() ? value : <span className="text-neutral-400">&mdash;</span>}
      </dd>
    </div>
  );
}

export default async function PropertyPage({
  params,
  searchParams,
}: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load property: ${error.message}`);
  if (!data) notFound();

  const property = data as Property;

  const { data: leaseData, error: leaseError } = await supabase
    .from("leases")
    .select(
      "id, start_date, end_date, monthly_rent::text, currency, status, tenant:tenants(id, first_name, last_name)",
    )
    .eq("property_id", id)
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });

  if (leaseError) throw new Error(`Could not load leases: ${leaseError.message}`);

  const leases = (leaseData ?? []) as unknown as LeaseRow[];
  const current = leases.find((lease) => lease.status === "active");

  return (
    <div>
      <Link href="/properties" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Properties
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{property.name}</h1>
        <div className="flex items-center gap-4">
          <Link
            href={`/properties/${property.id}/edit`}
            className="text-sm font-medium text-neutral-900 hover:underline"
          >
            Edit
          </Link>
          <ConfirmDeleteButton
            action={deleteProperty.bind(null, property.id)}
            confirmMessage={`Delete "${property.name}"? This cannot be undone.`}
          />
        </div>
      </div>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <div className="mt-6 rounded-lg border border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-medium">Current tenant</h2>
        {current ? (
          <p className="mt-1 text-sm text-neutral-600">
            {current.tenant ? (
              <Link href={`/tenants/${current.tenant.id}`} className="underline">
                {current.tenant.first_name} {current.tenant.last_name}
              </Link>
            ) : (
              "Unknown tenant"
            )}
            {" · "}
            {formatMoney(current.monthly_rent, current.currency)} / month
            {" · "}
            <Link href={`/leases/${current.id}`} className="underline">
              view lease
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">
            No active lease.{" "}
            <Link href="/leases/new" className="underline">
              Add one
            </Link>
            .
          </p>
        )}
      </div>

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 px-4 py-2">
        <Row label="Address" value={property.address} />
        <Row label="City" value={property.city} />
        <Row label="Postal code" value={property.postal_code} />
        <Row label="Country" value={property.country} />
        <Row label="Notes" value={property.notes} />
      </dl>

      {leases.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold tracking-tight">Lease history</h2>
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {leases.map((lease) => (
              <li key={lease.id}>
                <Link
                  href={`/leases/${lease.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {lease.tenant
                        ? `${lease.tenant.first_name} ${lease.tenant.last_name}`
                        : "Unknown tenant"}
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
        </>
      )}
    </div>
  );
}
