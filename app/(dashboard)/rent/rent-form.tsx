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
          label="Lease"
          name="lease_id"
          required
          defaultValue={value("lease_id")}
          error={state.fieldErrors?.lease_id}
          options={leases}
          placeholder="Choose a lease"
          hint="Expected rent defaults to the lease rent; you can override it"
        />
      ) : (
        <div>
          <span className="text-sm font-medium">Lease</span>
          <p className="mt-1 text-sm text-neutral-600">{existing?.leaseLabel}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Month"
          name="period_month"
          type="text"
          required
          defaultValue={value("period_month", existing?.period_month ?? "")}
          error={state.fieldErrors?.period_month}
          hint="Format: 2026-08"
          maxLength={7}
        />
        <Field
          label="Expected rent"
          name="expected_amount"
          required
          defaultValue={value("expected_amount", existing?.expected_amount ?? "")}
          error={state.fieldErrors?.expected_amount}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Paid amount"
          name="paid_amount"
          defaultValue={value("paid_amount", existing?.paid_amount ?? "0.00")}
          error={state.fieldErrors?.paid_amount}
          hint="Leave 0 until the tenant pays"
        />
        <Field
          label="Payment date"
          name="payment_date"
          type="date"
          defaultValue={value("payment_date", existing?.payment_date ?? "")}
          error={state.fieldErrors?.payment_date}
        />
      </div>

      <TextAreaField
        label="Notes"
        name="notes"
        defaultValue={value("notes", existing?.notes ?? "")}
      />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
