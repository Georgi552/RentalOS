-- Bills were recorded but never reached the money. Two changes.
--
-- 1. bills.paid_by_landlord
--    tenant_chargeable alone cannot describe reality. A bill the tenant pays
--    directly to the provider and a bill we pay and absorb are both
--    "not charged to the tenant", but only one costs us money. Without this
--    column the monthly net is wrong for every direct-paid bill.
--
-- 2. property_monthly_financials now includes bills, so an invoice shows up
--    in the property summary instead of sitting in a list on its own.

alter table public.bills
  add column paid_by_landlord boolean not null default true;

comment on column public.bills.paid_by_landlord is
  'False when the tenant pays the provider directly, so the bill is tracked but is not our cost.';

-- Only confirmed bills touch the money. A bill still in needs_review, or
-- rejected, must not move the numbers.
drop view if exists public.property_monthly_financials;

create view public.property_monthly_financials with (security_invoker = true) as
with rent as (
  select
    l.organization_id,
    l.property_id,
    rp.period_month as month,
    rp.currency,
    sum(rp.expected_amount) as rent_expected,
    sum(rp.paid_amount) as rent_paid
  from public.rent_payments rp
  join public.leases l on l.id = rp.lease_id
  group by l.organization_id, l.property_id, rp.period_month, rp.currency
),
spend as (
  select
    e.organization_id,
    e.property_id,
    date_trunc('month', e.expense_date)::date as month,
    e.currency,
    sum(e.amount) as expenses_total,
    sum(case when e.tenant_chargeable then e.amount else 0 end) as expenses_chargeable
  from public.expenses e
  group by e.organization_id, e.property_id, date_trunc('month', e.expense_date)::date, e.currency
),
billed as (
  select
    b.organization_id,
    b.property_id,
    -- A bill belongs to the period it covers, falling back to its due date
    -- and finally to when it was entered.
    date_trunc('month', coalesce(b.period_start, b.due_date, b.created_at::date))::date as month,
    b.currency,
    sum(b.amount) as bills_total,
    sum(case when b.tenant_chargeable then b.amount else 0 end) as bills_chargeable,
    sum(case when b.paid_by_landlord then b.amount else 0 end) as bills_we_pay
  from public.bills b
  where b.status = 'confirmed'
    and b.property_id is not null
  group by
    b.organization_id,
    b.property_id,
    date_trunc('month', coalesce(b.period_start, b.due_date, b.created_at::date))::date,
    b.currency
),
keys as (
  select organization_id, property_id, month, currency from rent
  union
  select organization_id, property_id, month, currency from spend
  union
  select organization_id, property_id, month, currency from billed
)
select
  k.organization_id,
  k.property_id,
  k.month,
  k.currency,
  coalesce(r.rent_expected, 0)::numeric(14, 2) as rent_expected,
  coalesce(r.rent_paid, 0)::numeric(14, 2) as rent_paid,
  coalesce(s.expenses_total, 0)::numeric(14, 2) as expenses_total,
  coalesce(s.expenses_chargeable, 0)::numeric(14, 2) as expenses_chargeable,
  coalesce(b.bills_total, 0)::numeric(14, 2) as bills_total,
  coalesce(b.bills_chargeable, 0)::numeric(14, 2) as bills_chargeable,
  coalesce(b.bills_we_pay, 0)::numeric(14, 2) as bills_we_pay,
  -- What the tenant owes on top of rent this month.
  (coalesce(s.expenses_chargeable, 0) + coalesce(b.bills_chargeable, 0))::numeric(14, 2)
    as tenant_charges,
  -- Money in, minus money we actually paid out.
  (coalesce(r.rent_paid, 0)
    - coalesce(s.expenses_total, 0)
    - coalesce(b.bills_we_pay, 0))::numeric(14, 2) as net
from keys k
left join rent  r on r.organization_id = k.organization_id and r.property_id = k.property_id
                 and r.month = k.month and r.currency = k.currency
left join spend s on s.organization_id = k.organization_id and s.property_id = k.property_id
                 and s.month = k.month and s.currency = k.currency
left join billed b on b.organization_id = k.organization_id and b.property_id = k.property_id
                  and b.month = k.month and b.currency = k.currency;
