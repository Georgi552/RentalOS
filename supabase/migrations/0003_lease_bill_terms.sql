-- Who pays which utility bill under a lease, and how it is collected.
--
-- This lives on the lease rather than the tenant: the same tenant can hold
-- different leases on different properties with different arrangements, and
-- the arrangement is agreed when the lease is signed.
--
-- Three real-world cases per bill type:
--   payer = landlord, collection = not_applicable  -> we pay it, tenant never sees it
--   payer = tenant,   collection = via_rent        -> we pay the provider and
--                                                     add it to the tenant's statement
--   payer = tenant,   collection = direct          -> the tenant pays the provider
--                                                     directly; we only track it

create table public.lease_bill_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lease_id uuid not null,
  bill_type text not null
    check (bill_type in ('electricity', 'water', 'internet', 'building_fee', 'other')),
  payer text not null check (payer in ('landlord', 'tenant')),
  collection text not null check (collection in ('via_rent', 'direct', 'not_applicable')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lease_bill_terms_lease_type_key unique (lease_id, bill_type),
  constraint lease_bill_terms_lease_fkey foreign key (lease_id, organization_id)
    references public.leases (id, organization_id) on delete cascade,

  -- A bill the landlord pays is never collected from the tenant, and a bill
  -- the tenant pays must say how.
  constraint lease_bill_terms_collection_matches_payer check (
    (payer = 'landlord' and collection = 'not_applicable')
    or (payer = 'tenant' and collection in ('via_rent', 'direct'))
  )
);

create index lease_bill_terms_lease_id_idx on public.lease_bill_terms (lease_id);
create index lease_bill_terms_organization_id_idx on public.lease_bill_terms (organization_id);

create trigger lease_bill_terms_set_updated_at
  before update on public.lease_bill_terms
  for each row execute function public.set_updated_at();

alter table public.lease_bill_terms enable row level security;

create policy lease_bill_terms_select_member on public.lease_bill_terms
  for select to authenticated using (public.is_org_member(organization_id));

create policy lease_bill_terms_insert_member on public.lease_bill_terms
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy lease_bill_terms_update_member on public.lease_bill_terms
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy lease_bill_terms_delete_member on public.lease_bill_terms
  for delete to authenticated using (public.is_org_member(organization_id));
