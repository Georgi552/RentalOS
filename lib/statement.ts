import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney } from "@/lib/money";

export type StatementLine = {
  label: string;
  detail: string | null;
  amount: string;
};

export type Statement = {
  leaseId: string;
  month: string;
  currency: string;
  propertyName: string;
  propertyAddress: string;
  tenantName: string;
  tenantEmail: string | null;
  organizationName: string;
  rentDue: string;
  billsDue: string;
  expensesDue: string;
  charges: string;
  balanceBefore: string;
  // What the tenant owes now: this month's charges plus anything carried over.
  totalDue: string;
  paid: string;
  dueDate: string;
  lines: StatementLine[];
};

function monthStart(month: string) {
  return `${month}-01`;
}

// Every line is a real row, so "why do I owe this?" is answerable from the
// statement itself (context doc section 29).
export async function buildStatement(
  supabase: SupabaseClient,
  organizationId: string,
  leaseId: string,
  month: string,
): Promise<Statement | null> {
  const period = monthStart(month);

  const { data: ledger, error: ledgerError } = await supabase
    .from("lease_monthly_ledger")
    .select(
      "lease_id, month, currency, rent_due::text, bills_due::text, expenses_due::text, charges::text, paid::text, balance::text",
    )
    .eq("organization_id", organizationId)
    .eq("lease_id", leaseId)
    .lte("month", period)
    .order("month", { ascending: false })
    .limit(2);

  if (ledgerError) throw new Error(ledgerError.message);

  const rows = (ledger ?? []) as unknown as {
    month: string;
    currency: string;
    rent_due: string;
    bills_due: string;
    expenses_due: string;
    charges: string;
    paid: string;
    balance: string;
  }[];

  const current = rows.find((row) => row.month.slice(0, 7) === month);
  if (!current) return null;

  const previous = rows.find((row) => row.month.slice(0, 7) !== month);
  const balanceBefore = previous?.balance ?? "0.00";

  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select(
      "rent_due_day, property_id, property:properties(name, address), tenant:tenants(first_name, last_name, email), organization:organizations(name)",
    )
    .eq("id", leaseId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (leaseError) throw new Error(leaseError.message);
  if (!lease) return null;

  const context = lease as unknown as {
    rent_due_day: number;
    property_id: string;
    property: { name: string; address: string } | null;
    tenant: { first_name: string; last_name: string; email: string | null } | null;
    organization: { name: string } | null;
  };

  const nextMonth = new Date(`${period}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEnd = new Date(nextMonth.getTime() - 86400000).toISOString().slice(0, 10);

  // Line items must add up to the ledger's bills_due, so they are filtered on
  // the same property, the same currency, and bucketed by the same expression
  // the ledger uses. PostgREST cannot filter on that expression, so the month
  // is applied here instead of in the query.
  const { data: allBills, error: billError } = await supabase
    .from("bills")
    .select("bill_type, provider, period_start, period_end, due_date, created_at, amount::text")
    .eq("organization_id", organizationId)
    .eq("property_id", context.property_id)
    .eq("currency", current.currency)
    .eq("tenant_chargeable", true)
    .neq("status", "rejected")
    .order("bill_type");

  if (billError) throw new Error(billError.message);

  const bills = ((allBills ?? []) as unknown as {
    bill_type: string;
    provider: string | null;
    period_start: string | null;
    period_end: string | null;
    due_date: string | null;
    created_at: string;
    amount: string;
  }[]).filter((bill) => billMonth(bill) === month);

  const { data: expenses, error: expenseError } = await supabase
    .from("expenses")
    .select("category, description, expense_date, amount::text")
    .eq("organization_id", organizationId)
    .eq("property_id", context.property_id)
    .eq("currency", current.currency)
    .eq("tenant_chargeable", true)
    .gte("expense_date", period)
    .lte("expense_date", monthEnd)
    .order("expense_date");

  if (expenseError) throw new Error(expenseError.message);

  return {
    leaseId,
    month,
    currency: current.currency,
    propertyName: context.property?.name ?? "",
    propertyAddress: context.property?.address ?? "",
    tenantName: context.tenant
      ? `${context.tenant.first_name} ${context.tenant.last_name}`
      : "",
    tenantEmail: context.tenant?.email ?? null,
    organizationName: context.organization?.name ?? "",
    rentDue: current.rent_due,
    billsDue: current.bills_due,
    expensesDue: current.expenses_due,
    charges: current.charges,
    balanceBefore,
    totalDue: addMoney(current.charges, negate(balanceBefore)),
    paid: current.paid,
    dueDate: `${month}-${String(context.rent_due_day).padStart(2, "0")}`,
    lines: [
      ...bills.map((bill) => ({
        label: bill.bill_type,
        detail: [bill.provider, bill.period_start && bill.period_end
          ? `${bill.period_start} – ${bill.period_end}`
          : null]
          .filter(Boolean)
          .join(" · ") || null,
        amount: bill.amount,
      })),
      ...((expenses ?? []) as unknown as {
        category: string;
        description: string | null;
        expense_date: string;
        amount: string;
      }[]).map((expense) => ({
        label: expense.category,
        detail: [expense.description, expense.expense_date].filter(Boolean).join(" · ") || null,
        amount: expense.amount,
      })),
    ],
  };
}

// A carried balance is negative when the tenant owes, so it is added to this
// month's charges rather than subtracted.
function negate(value: string) {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

// The month a bill belongs to, mirroring lease_monthly_ledger exactly:
// coalesce(period_start, due_date, created_at::date).
function billMonth(bill: {
  period_start: string | null;
  due_date: string | null;
  created_at: string;
}) {
  return (bill.period_start ?? bill.due_date ?? bill.created_at).slice(0, 7);
}
