import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { tenantName, type Tenant } from "@/lib/types";

export default async function TenantsPage() {
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("organization_id", organizationId)
    .order("last_name")
    .order("first_name");

  if (error) throw new Error(`Could not load tenants: ${error.message}`);

  const tenants = (data ?? []) as Tenant[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Наематели</h1>
        <Link
          href="/tenants/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Добави наемател
        </Link>
      </div>

      {tenants.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">Още няма наематели.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {tenants.map((tenant) => (
            <li key={tenant.id}>
              <Link
                href={`/tenants/${tenant.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
              >
                <span className="text-sm font-medium">{tenantName(tenant)}</span>
                <span className="text-sm text-neutral-500">
                  {tenant.email ?? tenant.phone ?? ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
