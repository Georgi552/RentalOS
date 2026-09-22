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
  // Everything owed this month that is not rent, as the ledger sums it.
  billsAndExpensesDue: string;
  charges: string;
  balanceBefore: string;
  // What the tenant owes now: this month's charges plus anything carried over,
  // never below zero.
  totalDue: string;
  // What is left of a credit after this month took its share.
  creditRemaining: string;
  // A lease where rent and bills are settled separately gets two of everything,
  // because one total would let a rent credit hide an unpaid bill.
  split: boolean;
  rentBalanceBefore: string;
  billsBalanceBefore: string;
  rentTotalDue: string;
  billsTotalDue: string;
  rentCreditRemaining: string;
  billsCreditRemaining: string;
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
      "lease_id, month, currency, rent_due::text, bills_due::text, expenses_due::text, bills_and_expenses_due::text, charges::text, due_date, is_due, paid::text, balance::text, rent_balance::text, bills_balance::text, split_rent_and_bills",
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
    bills_and_expenses_due: string;
    charges: string;
    paid: string;
    balance: string;
    rent_balance: string;
    bills_balance: string;
    split_rent_and_bills: boolean;
  }[];

  const current = rows.find((row) => row.month.slice(0, 7) === month);
  if (!current) return null;

  const previous = rows.find((row) => row.month.slice(0, 7) !== month);
  const balanceBefore = previous?.balance ?? "0.00";
  const rentBalanceBefore = previous?.rent_balance ?? "0.00";
  const billsBalanceBefore = previous?.bills_balance ?? "0.00";

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

  // The lines come from the same views the ledger aggregates, so they add up to
  // bills_due and expenses_due by construction. Selecting them by any rule of
  // this file's own is what made the statement show an unaccountable total
  // (migration 0021).
  const { data: billRows, error: billError } = await supabase
    .from("lease_bill_charges")
    .select("bill_id, bill_type, provider, period_start, period_end, amount::text")
    .eq("organization_id", organizationId)
    .eq("lease_id", leaseId)
    .eq("month", period)
    .order("bill_type");

  if (billError) throw new Error(billError.message);

  const bills = (billRows ?? []) as unknown as {
    bill_id: string;
    bill_type: string;
    provider: string | null;
    period_start: string | null;
    period_end: string | null;
    amount: string;
  }[];

  const { data: expenses, error: expenseError } = await supabase
    .from("lease_expense_charges")
    .select("expense_id, category, description, expense_date, amount::text")
    .eq("organization_id", organizationId)
    .eq("lease_id", leaseId)
    .eq("month", period)
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
    billsAndExpensesDue: current.bills_and_expenses_due,
    charges: current.charges,
    balanceBefore,
    totalDue: amountToPay(current.charges, balanceBefore),
    creditRemaining: creditLeftOver(current.charges, balanceBefore),
    split: current.split_rent_and_bills,
    rentBalanceBefore,
    billsBalanceBefore,
    rentTotalDue: amountToPay(current.rent_due, rentBalanceBefore),
    billsTotalDue: amountToPay(current.bills_and_expenses_due, billsBalanceBefore),
    rentCreditRemaining: creditLeftOver(current.rent_due, rentBalanceBefore),
    billsCreditRemaining: creditLeftOver(current.bills_and_expenses_due, billsBalanceBefore),
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

// A credit larger than the month's charges leaves nothing to pay. Without the
// floor the tenant is asked for a negative amount, which reads as nonsense on
// an invoice and is the sort of thing that gets a landlord a phone call.
function amountToPay(charges: string, balanceBefore: string) {
  const total = addMoney(charges, negate(balanceBefore));
  return total.startsWith("-") ? "0.00" : total;
}

// The other side of that floor: what the tenant keeps for next month.
function creditLeftOver(charges: string, balanceBefore: string) {
  const total = addMoney(charges, negate(balanceBefore));
  return total.startsWith("-") ? total.slice(1) : "0.00";
}
