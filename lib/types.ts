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
