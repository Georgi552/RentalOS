-- A bill that repeats every month without anyone typing it in.
--
-- The building fee on Бели брези is 24.00 every month and has no invoice to
-- read. It was entered by hand for June to September and then forgotten for
-- October, so the October statement went out without it. Nothing was wrong
-- with the arithmetic; the row simply did not exist.
--
-- A recurring bill is a template, and on the 1st of every month a real bill is
-- written from it. Real rows rather than a view that invents charges, because
-- every number in the app is already built on bills - the ledger, the property
-- financials, the statement lines, the tenant portal - and a second source of
-- charges would be a second place deciding what a tenant owes, which
-- DECISIONS.md has already paid for once. A generated bill is an ordinary bill:
-- the landlord can correct its amount or delete it, and its month comes from
-- public.bill_charge_month like any other.
--
-- last_month is the last month a bill was written for, not a start date. A
-- generated bill that the landlord deletes therefore stays deleted: the
-- template has moved past that month and will not write it again.

create table public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null,
  bill_type text not null
    check (bill_type in ('electricity', 'water', 'heating', 'internet', 'building_fee', 'other')),
  provider text,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN')),
  tenant_chargeable boolean not null,
  paid_by_landlord boolean not null,
  notes text,
  last_month date not null check (last_month = date_trunc('month', last_month)::date),
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_bills_id_org_key unique (id, organization_id),
  constraint recurring_bills_property_fkey foreign key (property_id, organization_id)
    references public.properties (id, organization_id) on delete cascade,
  -- The same rule the bill form enforces: a bill we do not pay is nothing to
  -- pass on.
  constraint recurring_bills_chargeable_needs_payer
    check (not tenant_chargeable or paid_by_landlord)
);

comment on table public.recurring_bills is
  'A bill written automatically on the 1st of every month until stopped.';
comment on column public.recurring_bills.last_month is
  'The last month a bill has been written for. The next one is the month after.';

create index recurring_bills_organization_id_idx on public.recurring_bills (organization_id);

create trigger recurring_bills_set_updated_at
  before update on public.recurring_bills
  for each row execute function public.set_updated_at();

alter table public.bills
  add column recurring_bill_id uuid,
  add constraint bills_recurring_bill_fkey foreign key (recurring_bill_id, organization_id)
    references public.recurring_bills (id, organization_id)
    on delete set null (recurring_bill_id);

comment on column public.bills.recurring_bill_id is
  'The template this bill was written from, if it repeats monthly.';

-- One bill per template per month, whatever runs twice.
create unique index bills_one_per_recurring_month
  on public.bills (recurring_bill_id, issue_date)
  where recurring_bill_id is not null;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

-- Landlord only. A tenant sees the bills this writes, through the policy on
-- bills, and has no reason to see the template.
alter table public.recurring_bills enable row level security;

create policy recurring_bills_select_member on public.recurring_bills
  for select to authenticated using (public.is_org_member(organization_id));

create policy recurring_bills_insert_member on public.recurring_bills
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy recurring_bills_update_member on public.recurring_bills
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy recurring_bills_delete_member on public.recurring_bills
  for delete to authenticated using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Writing the bills
-- ---------------------------------------------------------------------------

-- Writes every month that is due up to and including the month of `today`,
-- so a cron that missed days catches up instead of skipping a month.
--
-- Security invoker: run by the daily cron as the service role it sees every
-- organization; run by a landlord it sees only their own, through RLS.
--
-- The bill is dated the 1st and has no period, so it is charged exactly as a
-- hand-entered one with that issue date would be. No charge_month_override:
-- that field means "a person moved this", and nobody did.
create or replace function public.generate_recurring_bills(today date default current_date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target date := date_trunc('month', today)::date;
  template public.recurring_bills%rowtype;
  due_month date;
  written integer := 0;
  inserted integer;
begin
  for template in
    select * from public.recurring_bills
    where stopped_at is null
      and last_month < target
    -- Two runs at once must not both write the same month.
    for update skip locked
  loop
    due_month := (template.last_month + interval '1 month')::date;
    while due_month <= target loop
      insert into public.bills (
        organization_id, property_id, recurring_bill_id, bill_type, provider,
        issue_date, amount, currency, status, tenant_chargeable,
        paid_by_landlord, notes
      ) values (
        template.organization_id, template.property_id, template.id,
        template.bill_type, template.provider, due_month, template.amount,
        template.currency, 'confirmed', template.tenant_chargeable,
        template.paid_by_landlord, template.notes
      )
      on conflict (recurring_bill_id, issue_date) where recurring_bill_id is not null
      do nothing;

      get diagnostics inserted = row_count;
      written := written + inserted;
      due_month := (due_month + interval '1 month')::date;
    end loop;

    update public.recurring_bills
    set last_month = target
    where id = template.id;
  end loop;

  return written;
end;
$$;

comment on function public.generate_recurring_bills(date) is
  'Writes the monthly bills that recurring templates owe, up to the month of the given day.';

insert into public.schema_migrations (version) values ('0028_recurring_bills')
on conflict (version) do nothing;
