-- RentalOS MVP schema.
--
-- Tenancy: a landlord belongs to an organization (context doc section 13).
-- Every business row carries organization_id and RLS checks membership via
-- public.is_org_member(). Child tables use a composite foreign key on
-- (id, organization_id) so a row can never be attached to another
-- organization's record, even with a hand-crafted insert.
--
-- Money: numeric only, never float (section 16).
-- Documents are separate from bills (section 22).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- organizations / members / profiles
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'BG',
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

-- security definer so RLS policies can call it without recursing into the
-- policies on organization_members itself.
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
  );
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- On signup: create the profile, a personal organization, and the membership.
-- Section 58 requires that every user belongs to an organization.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  display_name text;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''));

  insert into public.organizations (name)
  values (display_name)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- properties  (one row = one rental unit; no building/floor hierarchy)
-- ---------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  address text not null,
  city text,
  postal_code text,
  country text not null default 'BG',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_id_org_key unique (id, organization_id)
);

create index properties_organization_id_idx on public.properties (organization_id);

-- Normalized address, used for deterministic invoice -> property matching
-- (section 28, priority 2).
create index properties_address_match_idx
  on public.properties (organization_id, lower(regexp_replace(address, '\s+', ' ', 'g')));

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_id_org_key unique (id, organization_id)
);

create index tenants_organization_id_idx on public.tenants (organization_id);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- leases
-- ---------------------------------------------------------------------------

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null,
  tenant_id uuid not null,
  start_date date not null,
  end_date date,
  monthly_rent numeric(12, 2) not null check (monthly_rent >= 0),
  deposit numeric(12, 2) check (deposit >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN')),
  rent_due_day smallint not null default 1 check (rent_due_day between 1 and 28),
  status text not null default 'active' check (status in ('draft', 'active', 'ended')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leases_id_org_key unique (id, organization_id),
  constraint leases_id_org_currency_key unique (id, organization_id, currency),
  constraint leases_dates_ordered check (end_date is null or end_date >= start_date),
  constraint leases_property_fkey foreign key (property_id, organization_id)
    references public.properties (id, organization_id) on delete cascade,
  constraint leases_tenant_fkey foreign key (tenant_id, organization_id)
    references public.tenants (id, organization_id) on delete restrict
);

create index leases_organization_id_idx on public.leases (organization_id);
create index leases_property_id_idx on public.leases (property_id);
create index leases_tenant_id_idx on public.leases (tenant_id);

-- Section 19: one active lease per property at a time.
create unique index leases_one_active_per_property
  on public.leases (property_id) where status = 'active';

create trigger leases_set_updated_at
  before update on public.leases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rent_payments  (expected vs actually received, section 20)
-- ---------------------------------------------------------------------------

create table public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lease_id uuid not null,
  period_month date not null,
  expected_amount numeric(12, 2) not null check (expected_amount >= 0),
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN')),
  payment_date date,
  status text not null default 'pending'
    check (status in ('pending', 'partial', 'paid', 'overdue')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rent_payments_id_org_key unique (id, organization_id),
  constraint rent_payments_period_is_month check (date_trunc('month', period_month) = period_month),
  constraint rent_payments_lease_fkey foreign key (lease_id, organization_id)
    references public.leases (id, organization_id) on delete cascade,
  constraint rent_payments_lease_period_key unique (lease_id, period_month)
);

create index rent_payments_organization_id_idx on public.rent_payments (organization_id);
create index rent_payments_period_idx on public.rent_payments (organization_id, period_month);

create trigger rent_payments_set_updated_at
  before update on public.rent_payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- documents  (the original file; never the business entity, section 22)
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid,
  storage_path text not null unique,
  filename text not null,
  mime_type text,
  file_size bigint check (file_size >= 0),
  processing_status text not null default 'uploaded'
    check (processing_status in ('uploaded', 'processing', 'processed', 'failed', 'needs_review')),
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_id_org_key unique (id, organization_id),
  constraint documents_property_fkey foreign key (property_id, organization_id)
    references public.properties (id, organization_id) on delete set null
);

create index documents_organization_id_idx on public.documents (organization_id);
create index documents_processing_status_idx on public.documents (organization_id, processing_status);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bills  (normalized invoice, section 23)
--
-- property_id is nullable on purpose: an unmatched invoice exists as a bill
-- in needs_review before the landlord confirms the property (section 28).
-- ---------------------------------------------------------------------------

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid,
  document_id uuid,
  provider text,
  bill_type text not null
    check (bill_type in ('electricity', 'water', 'internet', 'building_fee', 'other')),
  invoice_number text,
  customer_number text,
  period_start date,
  period_end date,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN')),
  due_date date,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'confirmed', 'rejected')),
  tenant_chargeable boolean not null default true,
  extraction_confidence numeric(5, 4) check (extraction_confidence between 0 and 1),
  match_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bills_id_org_key unique (id, organization_id),
  constraint bills_id_org_currency_key unique (id, organization_id, currency),
  constraint bills_period_ordered check (period_end is null or period_start is null or period_end >= period_start),
  constraint bills_property_fkey foreign key (property_id, organization_id)
    references public.properties (id, organization_id) on delete cascade,
  constraint bills_document_fkey foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete set null,
  -- A confirmed bill must be assigned to a property (section 28).
  constraint bills_confirmed_needs_property
    check (status <> 'confirmed' or property_id is not null)
);

create index bills_organization_id_idx on public.bills (organization_id);
create index bills_property_id_idx on public.bills (property_id);
create index bills_status_idx on public.bills (organization_id, status);
-- Supports matching priority 1 and 3: customer_number against confirmed history.
create index bills_customer_number_idx
  on public.bills (organization_id, provider, customer_number)
  where customer_number is not null;

create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- expenses  (section 21)
-- ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null,
  document_id uuid,
  category text not null
    check (category in ('electricity', 'water', 'internet', 'building_fee', 'maintenance', 'repair', 'other')),
  description text,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN')),
  expense_date date not null,
  tenant_chargeable boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_id_org_key unique (id, organization_id),
  constraint expenses_id_org_currency_key unique (id, organization_id, currency),
  constraint expenses_property_fkey foreign key (property_id, organization_id)
    references public.properties (id, organization_id) on delete cascade,
  constraint expenses_document_fkey foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete set null
);

create index expenses_organization_id_idx on public.expenses (organization_id);
create index expenses_property_id_idx on public.expenses (property_id);
create index expenses_date_idx on public.expenses (organization_id, expense_date);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- meter_readings  (section 24; preserve useful invoice data, no IoT)
-- ---------------------------------------------------------------------------

create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null,
  bill_id uuid,
  meter_type text not null check (meter_type in ('electricity', 'water', 'gas', 'heating', 'other')),
  meter_identifier text,
  reading_date date not null,
  reading_value numeric(14, 3) not null check (reading_value >= 0),
  reading_type text not null check (reading_type in ('previous', 'current', 'manual')),
  created_at timestamptz not null default now(),
  constraint meter_readings_property_fkey foreign key (property_id, organization_id)
    references public.properties (id, organization_id) on delete cascade,
  constraint meter_readings_bill_fkey foreign key (bill_id, organization_id)
    references public.bills (id, organization_id) on delete set null
);

create index meter_readings_organization_id_idx on public.meter_readings (organization_id);
create index meter_readings_property_id_idx on public.meter_readings (property_id, reading_date);

-- ---------------------------------------------------------------------------
-- statements / statement_items  (sections 29, 30)
--
-- The statement stores no total. Totals are computed from items so a source
-- amount is never duplicated. Every item points at exactly one source row,
-- which is what makes "why does this tenant owe X?" answerable from the DB.
-- ---------------------------------------------------------------------------

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lease_id uuid not null,
  period_month date not null,
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN')),
  status text not null default 'draft' check (status in ('draft', 'issued')),
  issued_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint statements_id_org_key unique (id, organization_id),
  constraint statements_id_currency_key unique (id, currency),
  constraint statements_period_is_month check (date_trunc('month', period_month) = period_month),
  constraint statements_lease_period_key unique (lease_id, period_month),
  -- Also pins the statement currency to the lease currency.
  constraint statements_lease_fkey foreign key (lease_id, organization_id, currency)
    references public.leases (id, organization_id, currency) on delete cascade,
  constraint statements_issued_has_timestamp
    check (status <> 'issued' or issued_at is not null)
);

create index statements_organization_id_idx on public.statements (organization_id);
create index statements_period_idx on public.statements (organization_id, period_month);

create trigger statements_set_updated_at
  before update on public.statements
  for each row execute function public.set_updated_at();

create table public.statement_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  statement_id uuid not null,
  item_type text not null check (item_type in ('rent', 'bill', 'expense')),
  description text not null,
  amount numeric(12, 2) not null,
  currency text not null check (currency in ('EUR', 'BGN')),
  source_rent_payment_id uuid,
  source_bill_id uuid,
  source_expense_id uuid,
  created_at timestamptz not null default now(),

  -- Currency must match the parent statement.
  constraint statement_items_statement_fkey foreign key (statement_id, currency)
    references public.statements (id, currency) on delete cascade,

  constraint statement_items_rent_fkey foreign key (source_rent_payment_id, organization_id)
    references public.rent_payments (id, organization_id) on delete restrict,
  constraint statement_items_bill_fkey foreign key (source_bill_id, organization_id)
    references public.bills (id, organization_id) on delete restrict,
  constraint statement_items_expense_fkey foreign key (source_expense_id, organization_id)
    references public.expenses (id, organization_id) on delete restrict,

  -- Exactly one source, and it must match item_type.
  constraint statement_items_source_matches_type check (
    case item_type
      when 'rent' then source_rent_payment_id is not null and source_bill_id is null and source_expense_id is null
      when 'bill' then source_bill_id is not null and source_rent_payment_id is null and source_expense_id is null
      when 'expense' then source_expense_id is not null and source_rent_payment_id is null and source_bill_id is null
    end
  )
);

create index statement_items_statement_id_idx on public.statement_items (statement_id);
create index statement_items_organization_id_idx on public.statement_items (organization_id);

-- A source amount may be charged to a tenant only once.
create unique index statement_items_rent_once
  on public.statement_items (source_rent_payment_id) where source_rent_payment_id is not null;
create unique index statement_items_bill_once
  on public.statement_items (source_bill_id) where source_bill_id is not null;
create unique index statement_items_expense_once
  on public.statement_items (source_expense_id) where source_expense_id is not null;

-- security_invoker keeps RLS applied to the caller. Without it the view would
-- run as its owner and bypass organization isolation.
create view public.statement_totals with (security_invoker = true) as
  select
    s.id as statement_id,
    s.organization_id,
    s.lease_id,
    s.period_month,
    s.currency,
    s.status,
    coalesce(sum(si.amount), 0)::numeric(12, 2) as total_amount,
    count(si.id) as item_count
  from public.statements s
  left join public.statement_items si on si.statement_id = s.id
  group by s.id, s.organization_id, s.lease_id, s.period_month, s.currency, s.status;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.tenants enable row level security;
alter table public.leases enable row level security;
alter table public.rent_payments enable row level security;
alter table public.documents enable row level security;
alter table public.bills enable row level security;
alter table public.expenses enable row level security;
alter table public.meter_readings enable row level security;
alter table public.statements enable row level security;
alter table public.statement_items enable row level security;

-- organizations: rows are created by the signup trigger, so no insert policy.
create policy organizations_select_member on public.organizations
  for select to authenticated using (public.is_org_member(id));

create policy organizations_update_member on public.organizations
  for update to authenticated using (public.is_org_member(id)) with check (public.is_org_member(id));

-- organization_members: read-only from the client. Membership changes go
-- through the signup trigger or the service role, never the browser.
create policy organization_members_select_own on public.organization_members
  for select to authenticated using (user_id = auth.uid() or public.is_org_member(organization_id));

-- profiles: inserted by the signup trigger.
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy properties_select_member on public.properties
  for select to authenticated using (public.is_org_member(organization_id));

create policy properties_insert_member on public.properties
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy properties_update_member on public.properties
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy properties_delete_member on public.properties
  for delete to authenticated using (public.is_org_member(organization_id));

create policy tenants_select_member on public.tenants
  for select to authenticated using (public.is_org_member(organization_id));

create policy tenants_insert_member on public.tenants
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy tenants_update_member on public.tenants
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy tenants_delete_member on public.tenants
  for delete to authenticated using (public.is_org_member(organization_id));

create policy leases_select_member on public.leases
  for select to authenticated using (public.is_org_member(organization_id));

create policy leases_insert_member on public.leases
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy leases_update_member on public.leases
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy leases_delete_member on public.leases
  for delete to authenticated using (public.is_org_member(organization_id));

create policy rent_payments_select_member on public.rent_payments
  for select to authenticated using (public.is_org_member(organization_id));

create policy rent_payments_insert_member on public.rent_payments
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy rent_payments_update_member on public.rent_payments
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy rent_payments_delete_member on public.rent_payments
  for delete to authenticated using (public.is_org_member(organization_id));

create policy documents_select_member on public.documents
  for select to authenticated using (public.is_org_member(organization_id));

create policy documents_insert_member on public.documents
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy documents_update_member on public.documents
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy documents_delete_member on public.documents
  for delete to authenticated using (public.is_org_member(organization_id));

create policy bills_select_member on public.bills
  for select to authenticated using (public.is_org_member(organization_id));

create policy bills_insert_member on public.bills
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy bills_update_member on public.bills
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy bills_delete_member on public.bills
  for delete to authenticated using (public.is_org_member(organization_id));

create policy expenses_select_member on public.expenses
  for select to authenticated using (public.is_org_member(organization_id));

create policy expenses_insert_member on public.expenses
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy expenses_update_member on public.expenses
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy expenses_delete_member on public.expenses
  for delete to authenticated using (public.is_org_member(organization_id));

create policy meter_readings_select_member on public.meter_readings
  for select to authenticated using (public.is_org_member(organization_id));

create policy meter_readings_insert_member on public.meter_readings
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy meter_readings_update_member on public.meter_readings
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy meter_readings_delete_member on public.meter_readings
  for delete to authenticated using (public.is_org_member(organization_id));

create policy statements_select_member on public.statements
  for select to authenticated using (public.is_org_member(organization_id));

create policy statements_insert_member on public.statements
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy statements_update_member on public.statements
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy statements_delete_member on public.statements
  for delete to authenticated using (public.is_org_member(organization_id));

create policy statement_items_select_member on public.statement_items
  for select to authenticated using (public.is_org_member(organization_id));

create policy statement_items_insert_member on public.statement_items
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy statement_items_update_member on public.statement_items
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy statement_items_delete_member on public.statement_items
  for delete to authenticated using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Storage  (section 42: private bucket, never public)
--
-- Object paths must start with the organization id:
--   <organization_id>/<document_id>/<filename>
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy documents_storage_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

create policy documents_storage_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

create policy documents_storage_update_member on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

create policy documents_storage_delete_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );
