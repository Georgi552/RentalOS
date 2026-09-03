"use client";

import { useActionState } from "react";
import { Field, FormError, SelectField, SubmitRow, TextAreaField } from "@/components/form";
import { EXPENSE_CATEGORY_LABELS, label as tr } from "@/lib/labels";
import { EXPENSE_CATEGORIES, type Expense } from "@/lib/types";
import type { ExpenseFormState } from "./actions";

export function ExpenseForm({
  action,
  expense,
  properties,
  submitLabel,
  cancelHref,
}: {
  action: (state: ExpenseFormState, formData: FormData) => Promise<ExpenseFormState>;
  expense?: Expense;
  properties: { value: string; label: string }[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const value = (key: keyof Expense, fallback = "") =>
    state.values?.[key] ?? (expense?.[key] as string | null) ?? fallback;

  const chargeable = state.values
    ? state.values.tenant_chargeable === "on"
    : (expense?.tenant_chargeable ?? false);

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      <SelectField
        label="Имот"
        name="property_id"
        required
        defaultValue={value("property_id")}
        error={state.fieldErrors?.property_id}
        options={properties}
        placeholder="Избери имот"
      />

      <SelectField
        label="Категория"
        name="category"
        required
        defaultValue={value("category")}
        error={state.fieldErrors?.category}
        options={EXPENSE_CATEGORIES.map((category) => ({
          value: category,
          label: tr(EXPENSE_CATEGORY_LABELS, category),
        }))}
        placeholder="Избери категория"
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Сума"
          name="amount"
          required
          defaultValue={value("amount")}
          error={state.fieldErrors?.amount}
          hint="Например 72.40"
        />
        <SelectField
          label="Валута"
          name="currency"
          required
          defaultValue={value("currency", "EUR")}
          error={state.fieldErrors?.currency}
          options={[
            { value: "EUR", label: "EUR" },
            { value: "BGN", label: "BGN" },
          ]}
        />
      </div>

      <Field
        label="Дата"
        name="expense_date"
        type="date"
        required
        defaultValue={value("expense_date")}
        error={state.fieldErrors?.expense_date}
      />

      <Field label="Описание" name="description" defaultValue={value("description")} />

      <label className="flex items-start gap-3 rounded-md border border-neutral-200 px-3 py-3">
        <input
          type="checkbox"
          name="tenant_chargeable"
          defaultChecked={chargeable}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium">Този разход се плаща от наемателя</span>
          <span className="block text-xs text-neutral-500">
            Само тези разходи влизат в месечната справка на наемателя.
          </span>
        </span>
      </label>

      <TextAreaField label="Бележки" name="notes" defaultValue={value("notes")} />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
