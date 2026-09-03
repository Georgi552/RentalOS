"use client";

import { useState } from "react";
import {
  BILL_TYPES,
  BILL_TYPE_LABELS,
  COLLECTION_LABELS,
  PAYER_LABELS,
  type BillType,
} from "@/lib/labels";

function Radio({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span className="text-sm">{children}</span>
    </label>
  );
}

export function BillTermsFields({
  values,
  errors,
}: {
  values: Record<string, string>;
  errors: Partial<Record<BillType, string>>;
}) {
  const [payers, setPayers] = useState<Record<string, string>>(() =>
    Object.fromEntries(BILL_TYPES.map((t) => [t, values[`payer_${t}`] ?? ""])),
  );
  const [collections, setCollections] = useState<Record<string, string>>(() =>
    Object.fromEntries(BILL_TYPES.map((t) => [t, values[`collection_${t}`] ?? ""])),
  );

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">
        Сметки <span className="text-red-600">*</span>
      </legend>
      <p className="text-xs text-neutral-500">
        За всяка сметка отбележи кой я плаща. Ако я плаща наемателят, избери и как
        се събира.
      </p>

      {BILL_TYPES.map((billType) => {
        const payer = payers[billType];
        const error = errors[billType];

        return (
          <div
            key={billType}
            className={`rounded-md border px-3 py-3 ${
              error ? "border-red-300 bg-red-50" : "border-neutral-200"
            }`}
          >
            <p className="text-sm font-medium">{BILL_TYPE_LABELS[billType]}</p>

            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
              <Radio
                name={`payer_${billType}`}
                value="landlord"
                checked={payer === "landlord"}
                onChange={(v) => setPayers({ ...payers, [billType]: v })}
              >
                {PAYER_LABELS.landlord}
              </Radio>
              <Radio
                name={`payer_${billType}`}
                value="tenant"
                checked={payer === "tenant"}
                onChange={(v) => setPayers({ ...payers, [billType]: v })}
              >
                {PAYER_LABELS.tenant}
              </Radio>
            </div>

            {payer === "tenant" && (
              <div className="mt-3 space-y-1 border-t border-neutral-200 pt-3 pl-1">
                <Radio
                  name={`collection_${billType}`}
                  value="via_rent"
                  checked={collections[billType] === "via_rent"}
                  onChange={(v) => setCollections({ ...collections, [billType]: v })}
                >
                  {COLLECTION_LABELS.via_rent}
                </Radio>
                <Radio
                  name={`collection_${billType}`}
                  value="direct"
                  checked={collections[billType] === "direct"}
                  onChange={(v) => setCollections({ ...collections, [billType]: v })}
                >
                  {COLLECTION_LABELS.direct}
                </Radio>
              </div>
            )}

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        );
      })}
    </fieldset>
  );
}
