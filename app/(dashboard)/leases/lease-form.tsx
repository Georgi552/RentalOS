"use client";

import { useActionState } from "react";
import { Field, FormError, SelectField, SubmitRow, TextAreaField } from "@/components/form";
import type { Lease } from "@/lib/types";
import type { LeaseFormState } from "./actions";
import { BillTermsFields } from "./bill-terms-fields";

export function LeaseForm({
  action,
  lease,
  billTermValues,
  properties,
  tenants,
  submitLabel,
  cancelHref,
}: {
  action: (state: LeaseFormState, formData: FormData) => Promise<LeaseFormState>;
  lease?: Lease;
  billTermValues?: Record<string, string>;
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
        label="Имот"
        name="property_id"
        required
        defaultValue={value("property_id")}
        error={state.fieldErrors?.property_id}
        options={properties}
        placeholder="Избери имот"
      />
      <SelectField
        label="Наемател"
        name="tenant_id"
        required
        defaultValue={value("tenant_id")}
        error={state.fieldErrors?.tenant_id}
        options={tenants}
        placeholder="Избери наемател"
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Начална дата"
          name="start_date"
          type="date"
          required
          defaultValue={value("start_date")}
          error={state.fieldErrors?.start_date}
        />
        <Field
          label="Крайна дата"
          name="end_date"
          type="date"
          defaultValue={value("end_date")}
          error={state.fieldErrors?.end_date}
          hint="Остави празно за безсрочен договор"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Месечен наем"
          name="monthly_rent"
          required
          defaultValue={value("monthly_rent")}
          error={state.fieldErrors?.monthly_rent}
          hint="Например 650 или 650.50"
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

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Депозит"
          name="deposit"
          defaultValue={value("deposit")}
          error={state.fieldErrors?.deposit}
        />
        <Field
          label="Ден за плащане"
          name="rent_due_day"
          type="number"
          required
          min="1"
          max="28"
          defaultValue={value("rent_due_day", "1")}
          error={state.fieldErrors?.rent_due_day}
          hint="Ден от месеца, 1 до 28"
        />
      </div>

      <SelectField
        label="Статус"
        name="status"
        required
        defaultValue={value("status", "active")}
        error={state.fieldErrors?.status}
        options={[
          { value: "active", label: "Активен" },
          { value: "draft", label: "Чернова" },
          { value: "ended", label: "Приключен" },
        ]}
        hint="Само един договор за имот може да е активен"
      />

      <BillTermsFields
        values={state.values ?? billTermValues ?? {}}
        errors={state.billTermErrors ?? {}}
      />

      <TextAreaField label="Бележки" name="notes" defaultValue={value("notes")} />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
