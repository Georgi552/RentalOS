import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import type { LedgerRow } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { tenantName } from "@/lib/types";
import { recordPayment } from "../actions";
import { PaymentForm } from "../payment-form";

type LeaseOption = {
  id: string;
  split_rent_and_bills: boolean;
  property: { name: string } | null;
  tenant: { first_name: string; last_name: string } | null;
};

export default async function RecordPaymentPage({ searchParams }: PageProps<"/rent/new">) {
  const { lease, month, kind } = await searchParams;
  const leaseId = typeof lease === "string" ? lease : "";
  const periodMonth = typeof month === "string" ? month : "";

  const { supabase, organizationId } = await requireOrganization();

  const { data: leaseData, error: leaseError } = await supabase
    .from("leases")
    .select("id, split_rent_and_bills, property:properties(name), tenant:tenants(first_name, last_name)")
    .eq("organization_id", organizationId)
    .in("status", ["active", "ended"])
    .order("start_date", { ascending: false });

  if (leaseError) throw new Error(`Не мога да заредя договорите: ${leaseError.message}`);

  const leases = ((leaseData ?? []) as unknown as LeaseOption[]).map((row) => ({
    value: row.id,
    label: `${row.property?.name ?? "Непознат имот"} — ${
      row.tenant ? tenantName(row.tenant) : "Непознат наемател"
    }`,
  }));

  // When a month is known, show what the ledger says is owed before it is paid.
  let due: {
    charges: string;
    rent: string;
    bills: string;
    expenses: string;
    balanceBefore: string;
    currency: string;
  } | undefined;
  let existingPaid = "";
  let split: { rentBalance: string; billsBalance: string; kind: string } | undefined;

  if (leaseId && /^\d{4}-\d{2}$/.test(periodMonth)) {
    const { data: ledger } = await supabase
      .from("lease_monthly_ledger")
      .select(
        "month, currency, rent_due::text, bills_due::text, expenses_due::text, charges::text, charges_due::text, due_date, is_due, paid::text, paid_rent::text, paid_bills::text, rent_balance::text, bills_balance::text, split_rent_and_bills, balance::text",
      )
      .eq("organization_id", organizationId)
      .eq("lease_id", leaseId)
      .lte("month", `${periodMonth}-01`)
      .order("month", { ascending: false })
      .limit(2);

    const rows = (ledger ?? []) as unknown as LedgerRow[];
    const current = rows.find((row) => row.month.slice(0, 7) === periodMonth);
    const previous = rows.find((row) => row.month.slice(0, 7) !== periodMonth);

    if (current) {
      existingPaid = current.paid;

      if (current.split_rent_and_bills) {
        const chosen = kind === "bills" ? "bills" : kind === "rent" ? "rent" : "";
        // Editing an existing payment of that kind starts from its amount.
        existingPaid = chosen === "bills" ? current.paid_bills : chosen === "rent" ? current.paid_rent : "";
        // Balances carried in from the month before, so the landlord can see
        // what each stream stands at while allocating.
        split = {
          rentBalance: formatMoney(
            (previous?.rent_balance ?? "0.00").replace("-", ""),
            current.currency,
          ) + (previous?.rent_balance?.startsWith("-") ? " дълг" : " кредит"),
          billsBalance: formatMoney(
            (previous?.bills_balance ?? "0.00").replace("-", ""),
            current.currency,
          ) + (previous?.bills_balance?.startsWith("-") ? " дълг" : " кредит"),
          kind: chosen,
        };
      } else {
        existingPaid = current.paid;
      }
      due = {
        charges: current.charges,
        rent: current.rent_due,
        bills: current.bills_due,
        expenses: current.expenses_due,
        balanceBefore: previous?.balance ?? "0.00",
        currency: current.currency,
      };
    }
  }

  return (
    <div>
      <Link href="/rent" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Плащания
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Отбележи плащане</h1>

      {leases.length === 0 ? (
        <div className="mt-6 max-w-lg rounded-lg border border-dashed border-neutral-300 px-6 py-8 text-center">
          <p className="text-sm text-neutral-500">Трябва да имаш договор, преди да отбележиш плащане.</p>
          <Link
            href="/leases/new"
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Добави договор
          </Link>
        </div>
      ) : (
        <PaymentForm
          action={recordPayment}
          leases={leases}
          defaults={{
            lease_id: leaseId,
            period_month: periodMonth,
            paid_amount: existingPaid || undefined,
            kind: typeof kind === "string" ? kind : undefined,
          }}
          due={due}
          split={split}
          submitLabel="Запази плащането"
          cancelHref="/rent"
        />
      )}
    </div>
  );
}
