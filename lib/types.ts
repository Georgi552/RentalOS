export type Property = {
  id: string;
  organization_id: string;
  name: string;
  address: string;
  city: string | null;
  postal_code: string | null;
  country: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Tenant = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LeaseStatus = "draft" | "active" | "ended";

export type Lease = {
  id: string;
  organization_id: string;
  property_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string | null;
  // Read with a ::text cast. See lib/money.ts.
  monthly_rent: string;
  deposit: string | null;
  currency: string;
  rent_due_day: number;
  status: LeaseStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function tenantName(tenant: { first_name: string; last_name: string }) {
  return `${tenant.first_name} ${tenant.last_name}`.trim();
}

// What was received for one month. What is owed comes from lease_monthly_ledger.
export type RentPayment = {
  id: string;
  organization_id: string;
  lease_id: string;
  period_month: string;
  // Read with a ::text cast. See lib/money.ts.
  paid_amount: string;
  currency: string;
  payment_date: string | null;
  notes: string | null;
};

export const EXPENSE_CATEGORIES = [
  "electricity",
  "water",
  "internet",
  "building_fee",
  "maintenance",
  "repair",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type Expense = {
  id: string;
  organization_id: string;
  property_id: string;
  category: ExpenseCategory;
  description: string | null;
  // Read with a ::text cast. See lib/money.ts.
  amount: string;
  currency: string;
  expense_date: string;
  tenant_chargeable: boolean;
  notes: string | null;
};


// Compares two exact decimal strings without converting to a JS number.
export function compareMoney(a: string, b: string) {
  const pad = (value: string) => {
    const [whole, frac = ""] = value.split(".");
    return [whole.padStart(14, "0"), frac.padEnd(2, "0").slice(0, 2)].join("");
  };
  const left = pad(a);
  const right = pad(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export type LeaseBillTerm = {
  id: string;
  organization_id: string;
  lease_id: string;
  bill_type: string;
  payer: "landlord" | "tenant";
  collection: "via_rent" | "direct" | "not_applicable";
  notes: string | null;
};
