import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { tenantName, type Tenant } from "@/lib/types";
import { updateTenant } from "../../actions";
import { TenantForm } from "../../tenant-form";

export default async function EditTenantPage({ params }: PageProps<"/tenants/[id]/edit">) {
  const { id } = await params;
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

  return (
    <div>
      <Link
        href={`/tenants/${tenant.id}`}
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        &larr; {tenantName(tenant)}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Редакция на наемател</h1>

      <TenantForm
        action={updateTenant.bind(null, tenant.id)}
        tenant={tenant}
        submitLabel="Запази промените"
        cancelHref={`/tenants/${tenant.id}`}
      />
    </div>
  );
}
