import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { requireOrganization } from "@/lib/auth";
import type { Expense } from "@/lib/types";
import { deleteExpense, updateExpense } from "../../actions";
import { ExpenseForm } from "../../expense-form";
import { propertyOptions } from "../../property-options";

export default async function EditExpensePage({
  params,
  searchParams,
}: PageProps<"/expenses/[id]/edit">) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, organization_id, property_id, category, description, amount::text, currency, expense_date, tenant_chargeable, notes",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load expense: ${error.message}`);
  if (!data) notFound();

  const expense = data as unknown as Expense;
  const properties = await propertyOptions(supabase, organizationId);

  return (
    <div>
      <Link href="/expenses" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Разходи
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Редакция на разход</h1>
        <ConfirmDeleteButton
          action={deleteExpense.bind(null, expense.id)}
          confirmMessage="Да изтрия ли този разход? Действието е необратимо."
        />
      </div>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <ExpenseForm
        action={updateExpense.bind(null, expense.id)}
        expense={expense}
        properties={properties}
        submitLabel="Запази промените"
        cancelHref="/expenses"
      />
    </div>
  );
}
