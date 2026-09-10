"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitRow } from "@/components/form";
import type { PasswordFormState, SettingsFormState } from "./actions";
import { changePassword, updateStatementSettings } from "./actions";

export function StatementSettingsForm({
  name,
  autoSend,
  leadDays,
  fromName,
  replyTo,
}: {
  name: string;
  autoSend: boolean;
  leadDays: number;
  fromName: string;
  replyTo: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    updateStatementSettings,
    {},
  );

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      <Field
        label="Име на наемодателя"
        name="name"
        required
        defaultValue={name}
        error={state.fieldErrors?.name}
        hint="Показва се най-отгоре в справката, която получава наемателят."
        maxLength={120}
      />

      <label className="flex items-start gap-3 rounded-md border border-neutral-200 px-3 py-3">
        <input
          type="checkbox"
          name="statement_auto_send"
          defaultChecked={autoSend}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium">
            Изпращай справките автоматично
          </span>
          <span className="block text-xs text-neutral-500">
            Всеки договор си има ден за плащане. Справката тръгва толкова дни
            преди него, колкото е зададено отдолу.
          </span>
        </span>
      </label>

      <Field
        label="Дни преди падежа"
        name="statement_lead_days"
        type="number"
        min="0"
        max="20"
        defaultValue={String(leadDays)}
        error={state.fieldErrors?.statement_lead_days}
        hint="Например 3: при падеж 5-то число справката тръгва на 2-ро."
      />

      <Field
        label="Име на подателя"
        name="statement_from_name"
        defaultValue={fromName}
        hint="Появява се като име в пощата на наемателя."
      />

      <Field
        label="Имейл за отговор"
        name="statement_reply_to"
        type="email"
        defaultValue={replyTo}
        error={state.fieldErrors?.statement_reply_to}
        hint="Където да пише наемателят, ако отговори."
      />

      <SubmitRow pending={pending} submitLabel="Запази настройките" cancelHref="/dashboard" />
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordFormState, FormData>(
    changePassword,
    {},
  );

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      <Field
        label="Сегашна парола"
        name="current_password"
        type="password"
        required
        autoComplete="current-password"
      />
      <Field
        label="Нова парола"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        hint="Поне 8 символа"
      />
      <Field
        label="Повтори новата парола"
        name="confirmation"
        type="password"
        required
        autoComplete="new-password"
      />

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "Записване..." : "Смени паролата"}
        </button>
      </div>
    </form>
  );
}
