"use client";

import { useActionState } from "react";
import { Field, FormError, SelectField, SubmitRow, TextAreaField } from "@/components/form";
import type { RentFormState } from "./actions";

export type LeaseChoice = {
  value: string;
  label: string;
  monthlyRent: string;
};

export function RentForm({
  action,
  leases,
  existing,
  submitLabel,
  cancelHref,
}: {
  action: (state: RentFormState, formData: FormData) => Promise<RentFormState>;
  leases?: LeaseChoice[];
  existing?: {
    leaseLabel: string;
    period_month: string;
    expected_amount: string;
    paid_amount: string;
    payment_date: string | null;
    notes: string | null;
  };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const value = (key: string, fallback = "") => state.values?.[key] ?? fallback;

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      {leases ? (
        <SelectField
          label="Договор"
          name="lease_id"
          required
          defaultValue={value("lease_id")}
          error={state.fieldErrors?.lease_id}
          options={leases}
          placeholder="Избери договор"
          hint="Очакваният наем идва от договора; можеш да го промениш"
        />
      ) : (
        <div>
          <span className="text-sm font-medium">Договор</span>
          <p className="mt-1 text-sm text-neutral-600">{existing?.leaseLabel}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Месец"
          name="period_month"
          type="text"
          required
          defaultValue={value("period_month", existing?.period_month ?? "")}
          error={state.fieldErrors?.period_month}
          hint="Формат: 2026-08"
          maxLength={7}
        />
        <Field
          label="Очакван наем"
          name="expected_amount"
          required
          defaultValue={value("expected_amount", existing?.expected_amount ?? "")}
          error={state.fieldErrors?.expected_amount}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Платена сума"
          name="paid_amount"
          defaultValue={value("paid_amount", existing?.paid_amount ?? "0.00")}
          error={state.fieldErrors?.paid_amount}
          hint="Остави 0, докато наемателят не плати"
        />
        <Field
          label="Дата на плащане"
          name="payment_date"
          type="date"
          defaultValue={value("payment_date", existing?.payment_date ?? "")}
          error={state.fieldErrors?.payment_date}
        />
      </div>

      <TextAreaField
        label="Бележки"
        name="notes"
        defaultValue={value("notes", existing?.notes ?? "")}
      />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
