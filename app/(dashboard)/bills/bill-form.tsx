"use client";

import { useActionState, useState } from "react";
import { Field, FormError, SelectField, SubmitRow, TextAreaField } from "@/components/form";
import {
  BILL_TYPES,
  BILL_TYPE_LABELS,
  COLLECTION_LABELS,
  PAYER_LABELS,
  label,
} from "@/lib/labels";
import type { BillFormState } from "./actions";
import {
  chargeableFromTerm,
  paidByLandlordFromTerm,
  termKey,
  type TermLookup,
} from "./lease-terms-lookup";

export type BillDefaults = {
  property_id: string;
  document_id: string;
  provider: string;
  issue_date: string;
  bill_type: string;
  invoice_number: string;
  customer_number: string;
  period_start: string;
  period_end: string;
  amount: string;
  currency: string;
  due_date: string;
  status: string;
  tenant_chargeable: boolean;
  paid_by_landlord: boolean;
  notes: string;
};

export function BillForm({
  action,
  defaults,
  properties,
  documents,
  terms,
  submitLabel,
  cancelHref,
}: {
  action: (state: BillFormState, formData: FormData) => Promise<BillFormState>;
  defaults?: Partial<BillDefaults>;
  properties: { value: string; label: string }[];
  documents: { value: string; label: string }[];
  terms: TermLookup;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const value = (key: keyof BillDefaults, fallback = "") =>
    state.values?.[key] ?? (defaults?.[key] as string | undefined) ?? fallback;

  // Property and bill type are controlled because the lease term shown below
  // and the chargeable default both depend on them.
  const [propertyId, setPropertyId] = useState(value("property_id"));
  const [billType, setBillType] = useState(value("bill_type"));

  const term = propertyId && billType ? terms[termKey(propertyId, billType)] : undefined;

  // Whether the tenant is charged follows the lease terms, which is the whole
  // point of recording them, until the landlord overrides it for this bill.
  const [chargeOverride, setChargeOverride] = useState<boolean | null>(
    state.values
      ? state.values.tenant_chargeable === "on"
      : (defaults?.tenant_chargeable ?? null),
  );
  const [payOverride, setPayOverride] = useState<boolean | null>(
    state.values
      ? state.values.paid_by_landlord === "on"
      : (defaults?.paid_by_landlord ?? null),
  );

  const wePay = payOverride ?? paidByLandlordFromTerm(term);
  // A bill we do not pay is nothing to pass on, so the charge follows.
  const chargeable = wePay && (chargeOverride ?? chargeableFromTerm(term));

  return (
    <form action={formAction} className="mt-6 max-w-lg space-y-4">
      <FormError message={state.error} />

      <SelectField
        label="Имот"
        name="property_id"
        required
        value={propertyId}
        onChange={setPropertyId}
        error={state.fieldErrors?.property_id}
        options={properties}
        placeholder="Избери имот"
      />

      <SelectField
        label="Вид сметка"
        name="bill_type"
        required
        value={billType}
        onChange={setBillType}
        error={state.fieldErrors?.bill_type}
        options={BILL_TYPES.map((t) => ({ value: t, label: BILL_TYPE_LABELS[t] }))}
        placeholder="Избери вид"
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Дата на издаване"
          name="issue_date"
          type="date"
          required
          defaultValue={value("issue_date")}
          error={state.fieldErrors?.issue_date}
          hint="Решава в кой месец влиза сметката"
        />
        <Field label="Доставчик" name="provider" defaultValue={value("provider")} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Документ"
          name="document_id"
          defaultValue={value("document_id")}
          options={documents}
          placeholder="Без документ"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Номер на фактура"
          name="invoice_number"
          defaultValue={value("invoice_number")}
        />
        <Field
          label="Клиентски номер"
          name="customer_number"
          defaultValue={value("customer_number")}
          hint="Помага да разпознаем имота по-късно"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Период от"
          name="period_start"
          type="date"
          defaultValue={value("period_start")}
          error={state.fieldErrors?.period_start}
        />
        <Field
          label="Период до"
          name="period_end"
          type="date"
          defaultValue={value("period_end")}
          error={state.fieldErrors?.period_end}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Сума"
          name="amount"
          required
          defaultValue={value("amount")}
          error={state.fieldErrors?.amount}
          hint="Например 72.40"
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

      <Field
        label="Падеж"
        name="due_date"
        type="date"
        defaultValue={value("due_date")}
        error={state.fieldErrors?.due_date}
      />

      <div className="space-y-3 rounded-md border border-neutral-200 px-3 py-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="paid_by_landlord"
            checked={wePay}
            onChange={(event) => setPayOverride(event.currentTarget.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium">Ние плащаме тази сметка</span>
            <span className="block text-xs text-neutral-500">
              Махни отметката, ако наемателят плаща директно на дружеството. Тогава
              сметката се пази за история, но не влиза в разходите ни.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 border-t border-neutral-200 pt-3">
          <input
            type="checkbox"
            name="tenant_chargeable"
            checked={chargeable}
            disabled={!wePay}
            onChange={(event) => setChargeOverride(event.currentTarget.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium">
              Начислява се на наемателя
            </span>
            <span className="block text-xs text-neutral-500">
              {wePay
                ? "Само тези сметки влизат в месечната справка на наемателя."
                : "Не се начислява — наемателят я плаща сам."}
            </span>
            {state.fieldErrors?.tenant_chargeable && (
              <span className="mt-1 block text-xs text-red-600">
                {state.fieldErrors.tenant_chargeable}
              </span>
            )}
          </span>
        </label>

        {term ? (
          <p className="border-t border-neutral-200 pt-3 text-xs text-neutral-500">
            По активния договор: {label(PAYER_LABELS, term.payer)}
            {term.payer === "tenant" && ` — ${label(COLLECTION_LABELS, term.collection)}`}
          </p>
        ) : (
          propertyId &&
          billType && (
            <p className="border-t border-neutral-200 pt-3 text-xs text-neutral-500">
              Няма активен договор с условия за тази сметка.
            </p>
          )
        )}
      </div>

      <TextAreaField label="Бележки" name="notes" defaultValue={value("notes")} />

      <SubmitRow pending={pending} submitLabel={submitLabel} cancelHref={cancelHref} />
    </form>
  );
}
