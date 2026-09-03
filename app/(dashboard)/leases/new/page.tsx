import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { createLease } from "../actions";
import { LeaseForm } from "../lease-form";
import { leaseFormOptions } from "../options";

export default async function NewLeasePage() {
  const { supabase, organizationId } = await requireOrganization();
  const { properties, tenants } = await leaseFormOptions(supabase, organizationId);

  const missing =
    properties.length === 0
      ? { what: "имот", href: "/properties/new", label: "Добави имот" }
      : tenants.length === 0
        ? { what: "наемател", href: "/tenants/new", label: "Добави наемател" }
        : null;

  return (
    <div>
      <Link href="/leases" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Договори
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Добави договор</h1>

      {missing ? (
        <div className="mt-6 max-w-lg rounded-lg border border-dashed border-neutral-300 px-6 py-8 text-center">
          <p className="text-sm text-neutral-500">
            Трябва да имаш {missing.what}, преди да създадеш договор.
          </p>
          <Link
            href={missing.href}
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            {missing.label}
          </Link>
        </div>
      ) : (
        <LeaseForm
          action={createLease}
          properties={properties}
          tenants={tenants}
          submitLabel="Създай договор"
          cancelHref="/leases"
        />
      )}
    </div>
  );
}
