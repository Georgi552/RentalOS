"use client";

import { useActionState } from "react";
import { Field, FormError, SelectField, SubmitRow, TextAreaField } from "@/components/form";
import { formatMoney } from "@/lib/money";
import type { PaymentFormState } from "./actions";

export function PaymentForm({
  action,
  leases,
  defaults,
  due,
  submitLabel,
  cancelHref,
}: {
  action: (state: PaymentFormState, formData: FormData) => Promise<PaymentFormState>;
  leases: { value: string; label: string }[];
  defaults?: { lease_id?: string; period_month?: string; paid_amount?: string; payment_date?: string; notes?: string };
  // What the ledger says is owed for the chosen month, when it is known.
  due?: { charges: string; rent: string; bills: string; expenses: string; balanceBefore: string; currency: string };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const value = (key: string, fallback = "") =>
    state.values?.[key] ?? (defaults as Record<string, string> | undefined)?.[key] ?? fallback;

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      {due && (
        <div className="rounded-lg border border-neutral-200 px-4 py-3 text-sm">
          <p className="font-medium">Дължимо за месеца</p>
          <dl className="mt-2 space-y-1 text-neutral-600">
            <div className="flex justify-between">
              <dt>Наем</dt>
              <dd>{formatMoney(due.rent, due.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Сметки</dt>
              <dd>{formatMoney(due.bills, due.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Разходи към наемателя</dt>
              <dd>{formatMoney(due.expenses, due.currency)}</dd>
            </div>
            {due.balanceBefore !== "0.00" && (
              <div className="flex justify-between">
                <dt>{due.balanceBefore.startsWith("-") ? "Пренесен дълг" : "Пренесен кредит"}</dt>
                <dd>{formatMoney(due.balanceBefore.replace("-", ""), due.currency)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900">
              <dt>Общо</dt>
              <dd>{formatMoney(due.charges, due.currency)}</dd>
            </div>
          </dl>
        </div>
      )}

      <SelectField
        label="Договор"
        name="lease_id"
        required
        defaultValue={value("lease_id")}
        error={state.fieldErrors?.lease_id}
        options={leases}
        placeholder="Избери договор"
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Месец"
          name="period_month"
          required
          defaultValue={value("period_month")}
          error={state.fieldErrors?.period_month}
          hint="Формат: 2026-08"
          maxLength={7}
        />
        <Field
          label="Платена сума"
          name="paid_amount"
          required
          defaultValue={value("paid_amount", "0")}
          error={state.fieldErrors?.paid_amount}
          hint="Колко е платил наемателят"
        />
      </div>

      <Field
        label="Дата на плащане"
        name="payment_date"
        type="date"
        defaultValue={value("payment_date")}
        error={state.fieldErrors?.payment_date}
      />

      <TextAreaField label="Бележки" name="notes" defaultValue={value("notes")} />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
