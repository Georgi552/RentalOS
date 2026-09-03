import Link from "next/link";
import { createTenant } from "../actions";
import { TenantForm } from "../tenant-form";

export default function NewTenantPage() {
  return (
    <div>
      <Link href="/tenants" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Tenants
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add tenant</h1>

      <TenantForm action={createTenant} submitLabel="Create tenant" cancelHref="/tenants" />
    </div>
  );
}
