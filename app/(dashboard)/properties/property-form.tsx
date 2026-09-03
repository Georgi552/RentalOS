"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitRow, TextAreaField } from "@/components/form";
import type { Property } from "@/lib/types";
import type { PropertyFormState } from "./actions";

export function PropertyForm({
  action,
  property,
  submitLabel,
  cancelHref,
}: {
  action: (state: PropertyFormState, formData: FormData) => Promise<PropertyFormState>;
  property?: Property;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  // After a failed submit, show what the user typed rather than the saved row.
  const value = (key: keyof Property, fallback = "") =>
    state.values?.[key] ?? (property?.[key] as string | null) ?? fallback;

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      <Field
        label="Име"
        name="name"
        required
        defaultValue={value("name")}
        error={state.fieldErrors?.name}
        hint="Как го наричаш, например: Апартамент Витоша"
        maxLength={120}
      />
      <Field
        label="Адрес"
        name="address"
        required
        defaultValue={value("address")}
        error={state.fieldErrors?.address}
        maxLength={300}
      />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Град" name="city" defaultValue={value("city")} />
        <Field label="Пощенски код" name="postal_code" defaultValue={value("postal_code")} />
      </div>

      <Field
        label="Държава"
        name="country"
        required
        defaultValue={value("country", "BG")}
        error={state.fieldErrors?.country}
        hint="Код от 2 букви, например BG"
        maxLength={2}
      />

      <TextAreaField label="Бележки" name="notes" defaultValue={value("notes")} />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
