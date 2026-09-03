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
      ? { what: "a property", href: "/properties/new", label: "Add a property" }
      : tenants.length === 0
        ? { what: "a tenant", href: "/tenants/new", label: "Add a tenant" }
        : null;

  return (
    <div>
      <Link href="/leases" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Leases
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add lease</h1>

      {missing ? (
        <div className="mt-6 max-w-lg rounded-lg border border-dashed border-neutral-300 px-6 py-8 text-center">
          <p className="text-sm text-neutral-500">
            You need {missing.what} before you can create a lease.
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
          submitLabel="Create lease"
          cancelHref="/leases"
        />
      )}
    </div>
  );
}
