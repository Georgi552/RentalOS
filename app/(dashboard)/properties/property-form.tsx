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
        label="Name"
        name="name"
        required
        defaultValue={value("name")}
        error={state.fieldErrors?.name}
        hint="How you refer to it, for example: Apartment Sofia"
        maxLength={120}
      />
      <Field
        label="Address"
        name="address"
        required
        defaultValue={value("address")}
        error={state.fieldErrors?.address}
        maxLength={300}
      />

      <div className="grid grid-cols-2 gap-4">
        <Field label="City" name="city" defaultValue={value("city")} />
        <Field label="Postal code" name="postal_code" defaultValue={value("postal_code")} />
      </div>

      <Field
        label="Country"
        name="country"
        required
        defaultValue={value("country", "BG")}
        error={state.fieldErrors?.country}
        hint="2-letter code"
        maxLength={2}
      />

      <TextAreaField label="Notes" name="notes" defaultValue={value("notes")} />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
