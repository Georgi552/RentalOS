import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { categoryLabel } from "@/lib/types";

type ExpenseRow = {
  id: string;
  category: string;
  description: string | null;
  amount: string;
  currency: string;
  expense_date: string;
  tenant_chargeable: boolean;
  property: { name: string } | null;
};

export default async function ExpensesPage() {
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, category, description, amount::text, currency, expense_date, tenant_chargeable, property:properties(name)",
    )
    .eq("organization_id", organizationId)
    .order("expense_date", { ascending: false });

  if (error) throw new Error(`Could not load expenses: ${error.message}`);

  const expenses = (data ?? []) as unknown as ExpenseRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <Link
          href="/expenses/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Add expense
        </Link>
      </div>

      {expenses.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">No expenses yet.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {expenses.map((expense) => (
            <li key={expense.id}>
              <Link
                href={`/expenses/${expense.id}/edit`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {categoryLabel(expense.category)}
                    <span className="text-neutral-400"> · </span>
                    {expense.property?.name ?? "Unknown property"}
                  </span>
                  <span className="block text-sm text-neutral-500">
                    {expense.expense_date}
                    {expense.description ? ` · ${expense.description}` : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm">
                    {formatMoney(expense.amount, expense.currency)}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {expense.tenant_chargeable ? "tenant" : "landlord"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
