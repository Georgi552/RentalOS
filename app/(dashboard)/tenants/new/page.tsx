import Link from "next/link";
import { createTenant } from "../actions";
import { TenantForm } from "../tenant-form";

export default function NewTenantPage() {
  return (
    <div>
      <Link href="/tenants" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Наематели
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Добави наемател</h1>

      <TenantForm action={createTenant} submitLabel="Създай наемател" cancelHref="/tenants" />
    </div>
  );
}
