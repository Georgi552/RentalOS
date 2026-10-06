"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import {
  createTenantAccount,
  resetTenantPassword,
  revokeTenantAccount,
  type AccountState,
} from "./account";

// The landlord's view of a tenant's access. Three states and nothing in
// between: no email to create an account with, no account yet, or an account
// that exists.
export function TenantAccess({
  tenantId,
  tenantName,
  email,
  hasAccount,
}: {
  tenantId: string;
  tenantName: string;
  email: string | null;
  hasAccount: boolean;
}) {
  // One piece of state for both actions, because both answer the same way - a
  // password to pass on, or an error - and only one of them is reachable at a
  // time. Which one is live follows hasAccount.
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    hasAccount ? resetTenantPassword : createTenantAccount,
    {},
  );

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">Достъп на наемателя</h2>

      {/* The password is checked before hasAccount, not after. Creating the
          account revalidates this page, so by the time the result is rendered
          hasAccount is already true - and a "has an account" branch taken first
          would swallow the one thing the landlord has to read. */}
      {state.password ? (
        <div className="mt-3 rounded-lg border border-neutral-200 px-4 py-3">
          <p className="text-sm">Дай на наемателя тези две неща:</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-neutral-500">Имейл</dt>
              <dd className="font-medium">{email}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-neutral-500">Парола</dt>
              <dd className="font-mono text-base font-medium">{state.password}</dd>
            </div>
          </dl>
          {/* Nothing stores it, so there is no second chance to read it. */}
          <p className="mt-3 text-xs text-neutral-500">
            Паролата се показва само сега и никъде не се пази. При първото влизане
            наемателят я сменя сам. Ако се загуби, поискай нова оттук.
          </p>
        </div>
      ) : hasAccount ? (
        <div className="mt-3 rounded-lg border border-neutral-200 px-4 py-3">
          <FormError message={state.error} />

          <p className="text-sm">
            Има акаунт с <span className="font-medium">{email}</span> и вижда своята
            справка и фактурите за имота си.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <form action={formAction}>
              <input type="hidden" name="tenant_id" value={tenantId} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
              >
                {pending ? "Сменям…" : "Нова временна парола"}
              </button>
            </form>
            <ConfirmDeleteButton
              action={revokeTenantAccount.bind(null, tenantId)}
              confirmMessage={`Да спра ли достъпа на ${tenantName}? Акаунтът се изтрива и повече няма да може да влезе.`}
              label="Спри достъпа"
            />
          </div>
        </div>
      ) : !email?.trim() ? (
        <p className="mt-2 text-sm text-neutral-500">
          За да създадеш акаунт, наемателят трябва да има имейл. Добави го през
          „Редактирай“.
        </p>
      ) : (
        <div className="mt-3 rounded-lg border border-neutral-200 px-4 py-3">
          <FormError message={state.error} />

          <form action={formAction}>
            <input type="hidden" name="tenant_id" value={tenantId} />
            <p className="text-sm text-neutral-500">
              Ще създам акаунт за <span className="font-medium">{email}</span> и ще
              покажа временна парола, която наемателят сменя при първото влизане.
            </p>
            <button
              type="submit"
              disabled={pending}
              className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Създавам…" : "Създай акаунт"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
