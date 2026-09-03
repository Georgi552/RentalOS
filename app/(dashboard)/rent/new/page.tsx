import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { tenantName } from "@/lib/types";
import { createRentPayment } from "../actions";
import { RentForm, type LeaseChoice } from "../rent-form";

type LeaseOption = {
  id: string;
  monthly_rent: string;
  currency: string;
  property: { name: string } | null;
  tenant: { first_name: string; last_name: string } | null;
};

export default async function NewRentPage() {
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("leases")
    .select(
      "id, monthly_rent::text, currency, property:properties(name), tenant:tenants(first_name, last_name)",
    )
    .eq("organization_id", organizationId)
    .in("status", ["active", "draft"])
    .order("start_date", { ascending: false });

  if (error) throw new Error(`Could not load leases: ${error.message}`);

  const options = (data ?? []) as unknown as LeaseOption[];
  const leases: LeaseChoice[] = options.map((lease) => ({
    value: lease.id,
    label: `${lease.property?.name ?? "Непознат имот"} — ${
      lease.tenant ? tenantName(lease.tenant) : "Непознат наемател"
    }`,
    monthlyRent: lease.monthly_rent,
  }));

  return (
    <div>
      <Link href="/rent" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Наеми
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Запиши наем</h1>

      {leases.length === 0 ? (
        <div className="mt-6 max-w-lg rounded-lg border border-dashed border-neutral-300 px-6 py-8 text-center">
          <p className="text-sm text-neutral-500">
            Трябва да имаш договор, преди да запишеш наем.
          </p>
          <Link
            href="/leases/new"
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Добави договор
          </Link>
        </div>
      ) : (
        <RentForm
          action={createRentPayment}
          leases={leases}
          submitLabel="Създай запис"
          cancelHref="/rent"
        />
      )}
    </div>
  );
}
