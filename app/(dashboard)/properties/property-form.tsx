"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { PropertyFormState } from "./actions";
import type { Property } from "@/lib/types";

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

function Field({
  label,
  name,
  defaultValue,
  error,
  required,
  hint,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        className={inputClass}
        aria-invalid={error ? true : undefined}
      />
      {hint && !error && (
        <span className="mt-1 block text-xs text-neutral-500">{hint}</span>
      )}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function PropertyForm({
  action,
  property,
  submitLabel,
  cancelHref,
}: {
  action: (
    state: PropertyFormState,
    formData: FormData,
  ) => Promise<PropertyFormState>;
  property?: Property;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  // After a failed submit, show what the user typed rather than the saved row.
  const value = (key: keyof Property) =>
    state.values?.[key] ?? (property?.[key] as string | null) ?? "";

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

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
        <Field
          label="Postal code"
          name="postal_code"
          defaultValue={value("postal_code")}
        />
      </div>

      <Field
        label="Country"
        name="country"
        required
        defaultValue={value("country") || "BG"}
        error={state.fieldErrors?.country}
        hint="2-letter code"
        maxLength={2}
      />

      <label className="block">
        <span className="text-sm font-medium">Notes</span>
        <textarea name="notes" rows={3} defaultValue={value("notes")} className={inputClass} />
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
        <Link href={cancelHref} className="text-sm text-neutral-500 hover:text-neutral-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}
