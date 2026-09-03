"use client";

import { useActionState } from "react";
import { Field, FormError, SelectField, SubmitRow, TextAreaField } from "@/components/form";
import type { Lease } from "@/lib/types";
import type { LeaseFormState } from "./actions";

export function LeaseForm({
  action,
  lease,
  properties,
  tenants,
  submitLabel,
  cancelHref,
}: {
  action: (state: LeaseFormState, formData: FormData) => Promise<LeaseFormState>;
  lease?: Lease;
  properties: { value: string; label: string }[];
  tenants: { value: string; label: string }[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const value = (key: keyof Lease, fallback = "") =>
    state.values?.[key] ?? (lease?.[key] as string | number | null)?.toString() ?? fallback;

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      <SelectField
        label="Property"
        name="property_id"
        required
        defaultValue={value("property_id")}
        error={state.fieldErrors?.property_id}
        options={properties}
        placeholder="Choose a property"
      />
      <SelectField
        label="Tenant"
        name="tenant_id"
        required
        defaultValue={value("tenant_id")}
        error={state.fieldErrors?.tenant_id}
        options={tenants}
        placeholder="Choose a tenant"
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Start date"
          name="start_date"
          type="date"
          required
          defaultValue={value("start_date")}
          error={state.fieldErrors?.start_date}
        />
        <Field
          label="End date"
          name="end_date"
          type="date"
          defaultValue={value("end_date")}
          error={state.fieldErrors?.end_date}
          hint="Leave empty if open-ended"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Monthly rent"
          name="monthly_rent"
          required
          defaultValue={value("monthly_rent")}
          error={state.fieldErrors?.monthly_rent}
          hint="For example 650 or 650.50"
        />
        <SelectField
          label="Currency"
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

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Deposit"
          name="deposit"
          defaultValue={value("deposit")}
          error={state.fieldErrors?.deposit}
        />
        <Field
          label="Rent due day"
          name="rent_due_day"
          type="number"
          required
          min="1"
          max="28"
          defaultValue={value("rent_due_day", "1")}
          error={state.fieldErrors?.rent_due_day}
          hint="Day of the month, 1 to 28"
        />
      </div>

      <SelectField
        label="Status"
        name="status"
        required
        defaultValue={value("status", "active")}
        error={state.fieldErrors?.status}
        options={[
          { value: "active", label: "Active" },
          { value: "draft", label: "Draft" },
          { value: "ended", label: "Ended" },
        ]}
        hint="Only one lease per property can be active"
      />

      <TextAreaField label="Notes" name="notes" defaultValue={value("notes")} />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
