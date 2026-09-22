"use client";

import { useActionState, useState } from "react";
import { Field, FormError, SelectField, SubmitRow, TextAreaField } from "@/components/form";
import { formatMoney } from "@/lib/money";
import type { PaymentFormState } from "./actions";

export type LeaseChoice = {
  value: string;
  label: string;
  // Whether this lease settles rent and bills separately. Carried per lease
  // because the form only learns which one is meant once it is picked.
  split: boolean;
};

type Due = NonNullable<Parameters<typeof PaymentForm>[0]["due"]>;

function Line({
  label,
  amount,
  currency,
  strong,
}: {
  label: string;
  amount: string;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? "flex justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900"
          : "flex justify-between"
      }
    >
      <dt>{label}</dt>
      <dd>{formatMoney(amount, currency)}</dd>
    </div>
  );
}

function carried(balance: string) {
  return balance.startsWith("-") ? "Пренесен дълг" : "Пренесен кредит";
}

function CombinedDue({ due }: { due: Due }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 text-sm">
      <p className="font-medium">Дължимо за месеца</p>
      <dl className="mt-2 space-y-1 text-neutral-600">
        <Line label="Наем" amount={due.rent} currency={due.currency} />
        <Line label="Сметки" amount={due.bills} currency={due.currency} />
        <Line label="Разходи към наемателя" amount={due.expenses} currency={due.currency} />
        {due.balanceBefore !== "0.00" && (
          <Line
            label={carried(due.balanceBefore)}
            amount={due.balanceBefore.replace("-", "")}
            currency={due.currency}
          />
        )}
        <Line label="Общо" amount={due.charges} currency={due.currency} strong />
      </dl>
    </div>
  );
}

// Two panels, no combined total. A single "Общо" across both streams is exactly
// the number the split exists to stop the landlord from reaching for: money put
// towards rent must not appear to have settled a bill.
function SplitDue({ due }: { due: Due }) {
  const rentBalance = due.rentBalanceBefore ?? "0.00";
  const billsBalance = due.billsBalanceBefore ?? "0.00";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-neutral-200 px-4 py-3 text-sm">
        <p className="font-medium">Наем за месеца</p>
        <dl className="mt-2 space-y-1 text-neutral-600">
          <Line label="Начислено" amount={due.rent} currency={due.currency} />
          {rentBalance !== "0.00" && (
            <Line
              label={carried(rentBalance)}
              amount={rentBalance.replace("-", "")}
              currency={due.currency}
            />
          )}
        </dl>
      </div>

      <div className="rounded-lg border border-neutral-200 px-4 py-3 text-sm">
        <p className="font-medium">Сметки за месеца</p>
        <dl className="mt-2 space-y-1 text-neutral-600">
          <Line label="Сметки" amount={due.bills} currency={due.currency} />
          <Line label="Разходи към наемателя" amount={due.expenses} currency={due.currency} />
          {/* Before the carried balance, not after: the total is what this month
              charged, and a reader takes the last strong line as the sum of
              everything above it. */}
          <Line
            label="Начислено"
            amount={due.billsAndExpenses ?? due.bills}
            currency={due.currency}
            strong
          />
          {billsBalance !== "0.00" && (
            <Line
              label={carried(billsBalance)}
              amount={billsBalance.replace("-", "")}
              currency={due.currency}
            />
          )}
        </dl>
      </div>
    </div>
  );
}

export function PaymentForm({
  action,
  leases,
  defaults,
  due,
  split,
  submitLabel,
  cancelHref,
}: {
  action: (state: PaymentFormState, formData: FormData) => Promise<PaymentFormState>;
  leases: LeaseChoice[];
  defaults?: {
    lease_id?: string;
    period_month?: string;
    paid_amount?: string;
    kind?: string;
    payment_date?: string;
    notes?: string;
  };
  // What the ledger says is owed for the chosen month, when it is known.
  due?: {
    charges: string;
    rent: string;
    bills: string;
    expenses: string;
    balanceBefore: string;
    currency: string;
    // A split lease carries the two streams apart, so the panel can show each
    // with its own carried balance instead of one total covering both.
    split?: boolean;
    billsAndExpenses?: string;
    rentBalanceBefore?: string;
    billsBalanceBefore?: string;
  };
  // Balances for the lease arrived at through a link, shown beside the choice.
  split?: { rentBalance: string; billsBalance: string; kind: string };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const value = (key: string, fallback = "") =>
    state.values?.[key] ?? (defaults as Record<string, string> | undefined)?.[key] ?? fallback;

  // The lease drives whether a kind is needed, and it can be chosen here, so
  // the answer cannot be settled on the server before the form is drawn.
  const [leaseId, setLeaseId] = useState(value("lease_id"));
  const needsKind = leases
    ? (leases.find((option) => option.value === leaseId)?.split ?? false)
    : Boolean(split);

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      {due && (due.split ? <SplitDue due={due} /> : <CombinedDue due={due} />)}

      <SelectField
        label="Договор"
        name="lease_id"
        required
        value={leaseId}
        onChange={setLeaseId}
        error={state.fieldErrors?.lease_id}
        options={leases}
        placeholder="Избери договор"
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Месец"
          name="period_month"
          required
          defaultValue={value("period_month")}
          error={state.fieldErrors?.period_month}
          hint="Формат: 2026-08"
          maxLength={7}
        />
        <Field
          label="Платена сума"
          name="paid_amount"
          required
          defaultValue={value("paid_amount", "0")}
          error={state.fieldErrors?.paid_amount}
          hint="Колко е платил наемателят"
        />
      </div>

      {needsKind && (
        <SelectField
          label="За какво е плащането"
          name="kind"
          required
          defaultValue={value("kind", split?.kind ?? "")}
          error={state.fieldErrors?.kind}
          options={[
            { value: "rent", label: split ? `Наем — баланс ${split.rentBalance}` : "Наем" },
            { value: "bills", label: split ? `Сметки — баланс ${split.billsBalance}` : "Сметки" },
          ]}
          placeholder="Избери"
          hint="По този договор наемът и сметките имат отделни баланси"
        />
      )}

      <Field
        label="Дата на плащане"
        name="payment_date"
        type="date"
        defaultValue={value("payment_date")}
        error={state.fieldErrors?.payment_date}
      />

      <TextAreaField label="Бележки" name="notes" defaultValue={value("notes")} />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
