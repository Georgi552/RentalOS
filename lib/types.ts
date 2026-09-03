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
