import { RENT_STATUS_LABELS, label } from "@/lib/labels";
import { compareMoney } from "@/lib/types";
import type { RentStatus } from "@/lib/types";

// Status is derived from the amounts alone, so it can never go stale.
// "Overdue" is deliberately NOT stored: a stored overdue flag would be wrong
// the day after it was written. It is computed for display by isOverdue().
export function rentStatus(expected: string, paid: string): RentStatus {
  if (compareMoney(paid, "0.00") === 0) return "pending";
  if (compareMoney(paid, expected) >= 0) return "paid";
  return "partial";
}

// The rent for a period is due on the lease's rent_due_day within that month.
export function rentDueDate(periodMonth: string, rentDueDay: number) {
  const [year, month] = periodMonth.split("-");
  return `${year}-${month}-${String(rentDueDay).padStart(2, "0")}`;
}

export function isOverdue(
  status: RentStatus,
  dueDate: string,
  today = new Date().toISOString().slice(0, 10),
) {
  return status !== "paid" && dueDate < today;
}

export function rentLabel(status: RentStatus, overdue: boolean) {
  const text = label(RENT_STATUS_LABELS, status);
  return overdue ? `${text} · просрочен` : text;
}
