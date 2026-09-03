import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { requireOrganization } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { isOverdue, rentDueDate, rentLabel } from "@/lib/rent";
import { tenantName, type RentStatus } from "@/lib/types";
import { deleteRentPayment, updateRentPayment } from "../../actions";
import { RentForm } from "../../rent-form";

type RentDetail = {
  id: string;
  period_month: string;
  expected_amount: string;
  paid_amount: string;
  currency: string;
  status: RentStatus;
  payment_date: string | null;
  notes: string | null;
  lease: {
    rent_due_day: number;
    property: { name: string } | null;
    tenant: { first_name: string; last_name: string } | null;
  } | null;
};

export default async function EditRentPage({
  params,
  searchParams,
}: PageProps<"/rent/[id]/edit">) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("rent_payments")
    .select(
      "id, period_month, expected_amount::text, paid_amount::text, currency, status, payment_date, notes, lease:leases(rent_due_day, property:properties(name), tenant:tenants(first_name, last_name))",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load rent record: ${error.message}`);
  if (!data) notFound();

  const rent = data as unknown as RentDetail;
  const dueDate = rentDueDate(rent.period_month, rent.lease?.rent_due_day ?? 1);
  const overdue = isOverdue(rent.status, dueDate);

  const leaseLabel = `${rent.lease?.property?.name ?? "Unknown property"} — ${
    rent.lease?.tenant ? tenantName(rent.lease.tenant) : "Unknown tenant"
  }`;

  return (
    <div>
      <Link href="/rent" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Rent
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rent record</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {formatMoney(rent.paid_amount, rent.currency)} of{" "}
            {formatMoney(rent.expected_amount, rent.currency)}
            {" · "}
            <span className={overdue ? "text-red-600" : undefined}>
              {rentLabel(rent.status, overdue)}
            </span>
          </p>
        </div>
        <ConfirmDeleteButton
          action={deleteRentPayment.bind(null, rent.id)}
          confirmMessage="Delete this rent record? This cannot be undone."
        />
      </div>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <RentForm
        action={updateRentPayment.bind(null, rent.id)}
        existing={{
          leaseLabel,
          period_month: rent.period_month.slice(0, 7),
          expected_amount: rent.expected_amount,
          paid_amount: rent.paid_amount,
          payment_date: rent.payment_date,
          notes: rent.notes,
        }}
        submitLabel="Save changes"
        cancelHref="/rent"
      />
    </div>
  );
}
