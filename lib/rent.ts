// The rent for a period is due on the lease's rent_due_day within that month.
export function rentDueDate(periodMonth: string, rentDueDay: number) {
  const [year, month] = periodMonth.split("-");
  return `${year}-${month}-${String(rentDueDay).padStart(2, "0")}`;
}

export function isOverdue(
  balance: string,
  dueDate: string,
  today = new Date().toISOString().slice(0, 10),
) {
  return balance.startsWith("-") && dueDate < today;
}
