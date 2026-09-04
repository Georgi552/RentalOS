-- Tenant statements.
--
-- The statement itself is derived from lease_monthly_ledger, so there is
-- nothing to assemble by hand. What has to be stored is the fact that one was
-- SENT, together with the figures the tenant was actually told: a bill edited
-- next week must not silently rewrite what was already in someone's inbox.
--
-- statements / statement_items are dropped. They were designed before the
-- ledger and were never written to; keeping two competing models would only
-- leave the next person guessing which one is authoritative.

-- The view reads the tables, so it goes first.
drop view if exists public.statement_totals;
drop table if exists public.statement_items;
drop table if exists public.statements;

alter table public.organizations
  add column statement_auto_send boolean not null default false,
  add column statement_lead_days smallint not null default 3
    check (statement_lead_days between 0 and 20),
  add column statement_from_name text,
  add column statement_reply_to text;

comment on column public.organizations.statement_lead_days is
  'Days before the lease rent_due_day that the statement goes out.';

create table public.statement_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lease_id uuid not null,
  period_month date not null,
  sent_to text not null,
  sent_at timestamptz not null default now(),
  trigger text not null check (trigger in ('manual', 'scheduled')),
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  error text,

  -- Snapshot of what the tenant was told.
  currency text not null check (currency in ('EUR', 'BGN')),
  rent_due numeric(12, 2) not null,
  bills_due numeric(12, 2) not null,
  expenses_due numeric(12, 2) not null,
  charges numeric(12, 2) not null,
  balance_before numeric(12, 2) not null,
  total_due numeric(12, 2) not null,

  created_at timestamptz not null default now(),

  constraint statement_sends_period_is_month
    check (date_trunc('month', period_month) = period_month),
  constraint statement_sends_lease_fkey foreign key (lease_id, organization_id)
    references public.leases (id, organization_id) on delete cascade
);

create index statement_sends_organization_id_idx on public.statement_sends (organization_id);
create index statement_sends_lease_period_idx on public.statement_sends (lease_id, period_month);

-- One successful send per lease per month. A resend has to be deliberate:
-- the app deletes the previous success first, so a cron cannot mail a tenant
-- twice by accident.
create unique index statement_sends_one_success_per_month
  on public.statement_sends (lease_id, period_month)
  where status = 'sent';

alter table public.statement_sends enable row level security;

create policy statement_sends_select_member on public.statement_sends
  for select to authenticated using (public.is_org_member(organization_id));

create policy statement_sends_insert_member on public.statement_sends
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy statement_sends_delete_member on public.statement_sends
  for delete to authenticated using (public.is_org_member(organization_id));
