"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitRow, TextAreaField } from "@/components/form";
import type { Tenant } from "@/lib/types";
import type { TenantFormState } from "./actions";

export function TenantForm({
  action,
  tenant,
  submitLabel,
  cancelHref,
}: {
  action: (state: TenantFormState, formData: FormData) => Promise<TenantFormState>;
  tenant?: Tenant;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const value = (key: keyof Tenant) =>
    state.values?.[key] ?? (tenant?.[key] as string | null) ?? "";

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Име"
          name="first_name"
          required
          defaultValue={value("first_name")}
          error={state.fieldErrors?.first_name}
          maxLength={80}
        />
        <Field
          label="Фамилия"
          name="last_name"
          required
          defaultValue={value("last_name")}
          error={state.fieldErrors?.last_name}
          maxLength={80}
        />
      </div>

      <Field
        label="Имейл"
        name="email"
        type="email"
        defaultValue={value("email")}
        error={state.fieldErrors?.email}
      />
      <Field label="Телефон" name="phone" type="tel" defaultValue={value("phone")} />
      <TextAreaField label="Бележки" name="notes" defaultValue={value("notes")} />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
