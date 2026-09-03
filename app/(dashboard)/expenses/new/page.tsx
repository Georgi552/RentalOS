import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { createExpense } from "../actions";
import { ExpenseForm } from "../expense-form";
import { propertyOptions } from "@/lib/property-options";

export default async function NewExpensePage() {
  const { supabase, organizationId } = await requireOrganization();
  const properties = await propertyOptions(supabase, organizationId);

  return (
    <div>
      <Link href="/expenses" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Разходи
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Добави разход</h1>

      {properties.length === 0 ? (
        <div className="mt-6 max-w-lg rounded-lg border border-dashed border-neutral-300 px-6 py-8 text-center">
          <p className="text-sm text-neutral-500">
            Трябва да имаш имот, преди да запишеш разход.
          </p>
          <Link
            href="/properties/new"
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Добави имот
          </Link>
        </div>
      ) : (
        <ExpenseForm
          action={createExpense}
          properties={properties}
          submitLabel="Създай разход"
          cancelHref="/expenses"
        />
      )}
    </div>
  );
}
