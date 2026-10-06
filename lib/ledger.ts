import { compareMoney } from "@/lib/types";

export type LedgerRow = {
  lease_id: string;
  property_id: string;
  tenant_id: string;
  currency: string;
  month: string;
  payment_id: string | null;
  payment_date: string | null;
  rent_due: string;
  bills_due: string;
  expenses_due: string;
  charges: string;
  // The part of charges that has fallen due. Zero before the due date.
  charges_due: string;
  due_date: string;
  is_due: boolean;
  paid: string;
  paid_rent: string;
  paid_bills: string;
  rent_balance: string;
  bills_balance: string;
  bills_and_expenses_due: string;
  split_rent_and_bills: boolean;
  month_delta: string;
  // Negative means the tenant still owes; positive is credit carried forward.
  balance: string;
};

export function isDebt(balance: string) {
  return compareMoney(balance.replace("-", ""), "0.00") !== 0 && balance.startsWith("-");
}

export function isCredit(balance: string) {
  return !balance.startsWith("-") && compareMoney(balance, "0.00") !== 0;
}

export function balanceTone(balance: string) {
  if (isDebt(balance)) return "text-red-600";
  if (isCredit(balance)) return "text-green-700";
  return "text-neutral-500";
}

export function balanceNote(balance: string) {
  if (isDebt(balance)) return "дължи";
  if (isCredit(balance)) return "надплатил";
  return "изчистен";
}

// A month whose due date has not arrived is not a debt; it is what is coming.
export function dueNote(row: { is_due: boolean; due_date: string }) {
  return row.is_due ? null : `предстои ${row.due_date}`;
}

export function monthLabel(month: string) {
  return month.slice(0, 7);
}

export const MONTHS_SHOWN = 6;

export function firstOfMonthsAgo(count: number = MONTHS_SHOWN) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + 1, 1));
  return start.toISOString().slice(0, 10);
}

// Every column the chart, the table and the balance block need, in one place.
// The landlord's dashboard and the tenant's portal read the same list on
// purpose: a column present on one side and missing on the other would show the
// two of them different numbers for the same month.
//
// Every amount is cast to text. Money never becomes a JavaScript number
// (lib/money.ts).
export const LEDGER_SELECT =
  "lease_id, property_id, month, currency, rent_due::text, bills_electricity::text, bills_water::text, bills_heating::text, bills_building_fee::text, bills_internet::text, bills_other::text, expenses_due::text, charges::text, charges_due::text, bills_and_expenses_due::text, due_date, is_due, paid::text, paid_rent::text, paid_bills::text, rent_balance::text, bills_balance::text, split_rent_and_bills, balance::text, property:properties(id, name), tenant:tenants(id, first_name, last_name)";
