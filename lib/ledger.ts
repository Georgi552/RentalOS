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
  paid: string;
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

export function monthLabel(month: string) {
  return month.slice(0, 7);
}
