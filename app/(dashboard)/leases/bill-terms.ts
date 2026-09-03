import { BILL_TYPES, type BillType, type Collection, type Payer } from "@/lib/labels";

export type BillTerm = {
  bill_type: BillType;
  payer: Payer;
  collection: Collection;
};

export type BillTermErrors = Partial<Record<BillType, string>>;

// Every bill type must be answered explicitly: the landlord has to state who
// pays it, and if the tenant pays, how it is collected. There is no default,
// because a wrong default silently becomes a wrong tenant statement later.
export function parseBillTerms(formData: FormData): {
  terms: BillTerm[];
  errors: BillTermErrors;
  values: Record<string, string>;
} {
  const terms: BillTerm[] = [];
  const errors: BillTermErrors = {};
  const values: Record<string, string> = {};

  for (const billType of BILL_TYPES) {
    const payer = String(formData.get(`payer_${billType}`) ?? "").trim();
    const collection = String(formData.get(`collection_${billType}`) ?? "").trim();

    values[`payer_${billType}`] = payer;
    values[`collection_${billType}`] = collection;

    if (payer !== "landlord" && payer !== "tenant") {
      errors[billType] = "Избери кой плаща тази сметка.";
      continue;
    }

    if (payer === "landlord") {
      terms.push({ bill_type: billType, payer, collection: "not_applicable" });
      continue;
    }

    if (collection !== "via_rent" && collection !== "direct") {
      errors[billType] = "Избери как се събира сметката от наемателя.";
      continue;
    }

    terms.push({ bill_type: billType, payer, collection });
  }

  return { terms, errors, values };
}

export function billTermValues(
  terms: { bill_type: string; payer: string; collection: string }[],
) {
  const values: Record<string, string> = {};
  for (const term of terms) {
    values[`payer_${term.bill_type}`] = term.payer;
    values[`collection_${term.bill_type}`] = term.collection;
  }
  return values;
}
