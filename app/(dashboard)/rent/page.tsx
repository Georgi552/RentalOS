import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { isOverdue, rentDueDate, rentLabel } from "@/lib/rent";
import type { RentStatus } from "@/lib/types";

type RentRow = {
  id: string;
  period_month: string;
  expected_amount: string;
  paid_amount: string;
  currency: string;
  status: RentStatus;
  lease: {
    rent_due_day: number;
    property: { name: string } | null;
    tenant: { first_name: string; last_name: string } | null;
  } | null;
};

export default async function RentPage() {
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("rent_payments")
    .select(
      "id, period_month, expected_amount::text, paid_amount::text, currency, status, lease:leases(rent_due_day, property:properties(name), tenant:tenants(first_name, last_name))",
    )
    .eq("organization_id", organizationId)
    .order("period_month", { ascending: false });

  if (error) throw new Error(`Could not load rent: ${error.message}`);

  const rows = (data ?? []) as unknown as RentRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Rent</h1>
        <Link
          href="/rent/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Record rent
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">
            No rent recorded yet. Add a month for one of your leases.
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {rows.map((row) => {
            const dueDate = rentDueDate(row.period_month, row.lease?.rent_due_day ?? 1);
            const overdue = isOverdue(row.status, dueDate);

            return (
              <li key={row.id}>
                <Link
                  href={`/rent/${row.id}/edit`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {row.lease?.property?.name ?? "Unknown property"}
                      <span className="text-neutral-400"> · </span>
                      {row.period_month.slice(0, 7)}
                    </span>
                    <span className="block text-sm text-neutral-500">
                      {row.lease?.tenant
                        ? `${row.lease.tenant.first_name} ${row.lease.tenant.last_name}`
                        : "Unknown tenant"}
                      {" · due "}
                      {dueDate}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm">
                      {formatMoney(row.paid_amount, row.currency)}
                      <span className="text-neutral-400">
                        {" / "}
                        {formatMoney(row.expected_amount, row.currency)}
                      </span>
                    </span>
                    <span
                      className={`block text-xs ${overdue ? "text-red-600" : "text-neutral-500"}`}
                    >
                      {rentLabel(row.status, overdue)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
