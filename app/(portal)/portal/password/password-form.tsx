"use client";

import { useActionState } from "react";
import { Field, FormError } from "@/components/form";
import { setOwnPassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(
    setOwnPassword,
    {},
  );

  return (
    <form action={formAction} className="mt-6 max-w-sm space-y-4">
      <FormError message={state.error} />

      <Field
        label="Нова парола"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        hint="Поне 8 символа."
      />
      <Field
        label="Потвърди паролата"
        name="confirm"
        type="password"
        required
        autoComplete="new-password"
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Запазвам…" : "Запази паролата"}
      </button>
    </form>
  );
}
