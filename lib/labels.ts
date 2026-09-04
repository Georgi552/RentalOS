// Bulgarian labels for everything stored as an enum-like text value.
// Database values stay in English; only what the landlord reads is translated.

export const BILL_TYPES = [
  "electricity",
  "water",
  "heating",
  "building_fee",
  "internet",
  "other",
] as const;

export type BillType = (typeof BILL_TYPES)[number];

export const BILL_TYPE_LABELS: Record<BillType, string> = {
  electricity: "Ток",
  water: "Вода",
  heating: "Топлофикация",
  building_fee: "Входна такса",
  internet: "Интернет",
  other: "Друга сметка",
};

export type Payer = "landlord" | "tenant";

export const PAYER_LABELS: Record<Payer, string> = {
  landlord: "Ние (наемодател)",
  tenant: "Наемателят",
};

export type Collection = "via_rent" | "direct" | "not_applicable";

export const COLLECTION_LABELS: Record<Collection, string> = {
  via_rent: "Добавя се към наема и я събираме ние",
  direct: "Наемателят плаща директно на дружеството",
  not_applicable: "Не се събира от наемателя",
};

export const COLLECTION_SHORT: Record<Collection, string> = {
  via_rent: "към наема",
  direct: "директно към дружеството",
  not_applicable: "—",
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  electricity: "Ток",
  water: "Вода",
  heating: "Топлофикация",
  internet: "Интернет",
  building_fee: "Входна такса",
  maintenance: "Поддръжка",
  repair: "Ремонт",
  other: "Друго",
};

export const LEASE_STATUS_LABELS: Record<string, string> = {
  draft: "Чернова",
  active: "Активен",
  ended: "Приключен",
};

export function label(map: Record<string, string>, value: string) {
  return map[value] ?? value;
}

export const BILL_STATUS_LABELS: Record<string, string> = {
  needs_review: "За проверка",
  confirmed: "Потвърдена",
  rejected: "Отказана",
};
