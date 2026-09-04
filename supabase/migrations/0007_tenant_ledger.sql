-- The tenant ledger.
--
-- Before: rent had to be typed in per month, and a bill sat in "needs review"
-- until someone confirmed it. Now charges build themselves and the landlord
-- enters one number per month: how much the tenant actually paid.
--
--   charges = rent from the lease + chargeable bills + chargeable expenses
--   balance = balance carried forward + paid - charges
--
-- A negative balance means the tenant still owes; a positive one is credit
-- that reduces next month. Every figure is summed in PostgreSQL, never in
-- JavaScript (see lib/money.ts).

-- The existing summary reads expected_amount, so it has to go first.
drop view if exists public.property_monthly_financials;

-- 1. rent_payments now records only what was received. The amount due is
--    derived, so storing it again could only ever disagree.
alter table public.rent_payments drop column expected_amount;
alter table public.rent_payments drop column status;

comment on table public.rent_payments is
  'Money received from the tenant for one month. What is owed comes from lease_monthly_ledger.';

-- 2. A bill entered by hand counts immediately. needs_review stays in the
--    schema for invoices that arrive by extraction later.
alter table public.bills alter column status set default 'confirmed';

-- 3. Landlord profit and loss. Same rule as the ledger: everything except a
--    rejected bill counts, so the two never disagree.
create view public.property_monthly_financials with (security_invoker = true) as
with rent as (
  select l.organization_id, l.property_id, rp.period_month as month, rp.currency,
         sum(rp.paid_amount) as rent_paid
  from public.rent_payments rp
  join public.leases l on l.id = rp.lease_id
  group by l.organization_id, l.property_id, rp.period_month, rp.currency
),
spend as (
  select e.organization_id, e.property_id,
         date_trunc('month', e.expense_date)::date as month, e.currency,
         sum(e.amount) as expenses_total,
         sum(case when e.tenant_chargeable then e.amount else 0 end) as expenses_chargeable
  from public.expenses e
  group by e.organization_id, e.property_id, date_trunc('month', e.expense_date)::date, e.currency
),
billed as (
  select b.organization_id, b.property_id,
         date_trunc('month', coalesce(b.period_start, b.due_date, b.created_at::date))::date as month,
         b.currency,
         sum(b.amount) as bills_total,
         sum(case when b.tenant_chargeable then b.amount else 0 end) as bills_chargeable,
         sum(case when b.paid_by_landlord then b.amount else 0 end) as bills_we_pay
  from public.bills b
  where b.status <> 'rejected' and b.property_id is not null
  group by b.organization_id, b.property_id,
           date_trunc('month', coalesce(b.period_start, b.due_date, b.created_at::date))::date,
           b.currency
),
keys as (
  select organization_id, property_id, month, currency from rent
  union select organization_id, property_id, month, currency from spend
  union select organization_id, property_id, month, currency from billed
)
select
  k.organization_id, k.property_id, k.month, k.currency,
  coalesce(r.rent_paid, 0)::numeric(14, 2) as rent_paid,
  coalesce(s.expenses_total, 0)::numeric(14, 2) as expenses_total,
  coalesce(s.expenses_chargeable, 0)::numeric(14, 2) as expenses_chargeable,
  coalesce(b.bills_total, 0)::numeric(14, 2) as bills_total,
  coalesce(b.bills_chargeable, 0)::numeric(14, 2) as bills_chargeable,
  coalesce(b.bills_we_pay, 0)::numeric(14, 2) as bills_we_pay,
  (coalesce(r.rent_paid, 0)
    - coalesce(s.expenses_total, 0)
    - coalesce(b.bills_we_pay, 0))::numeric(14, 2) as net
from keys k
left join rent   r on r.organization_id = k.organization_id and r.property_id = k.property_id
                  and r.month = k.month and r.currency = k.currency
left join spend  s on s.organization_id = k.organization_id and s.property_id = k.property_id
                  and s.month = k.month and s.currency = k.currency
left join billed b on b.organization_id = k.organization_id and b.property_id = k.property_id
                  and b.month = k.month and b.currency = k.currency;

-- 4. The ledger itself.
--
-- Charges are matched to the lease currency. A bill raised in another currency
-- is deliberately left out rather than added to a different currency, which
-- would be worse than showing nothing.
create view public.lease_monthly_ledger with (security_invoker = true) as
with bounds as (
  select
    l.id as lease_id,
    l.organization_id,
    l.property_id,
    l.tenant_id,
    l.currency,
    l.monthly_rent,
    l.rent_due_day,
    date_trunc('month', l.start_date)::date as first_month,
    date_trunc('month', l.end_date)::date as end_month,
    greatest(
      case
        when l.end_date is null then date_trunc('month', current_date)::date
        else date_trunc('month', l.end_date)::date
      end,
      coalesce((
        select max(rp.period_month)
        from public.rent_payments rp
        where rp.lease_id = l.id
      ), date_trunc('month', l.start_date)::date),
      coalesce((
        select max(date_trunc('month', coalesce(b.period_start, b.due_date, b.created_at::date))::date)
        from public.bills b
        where b.organization_id = l.organization_id
          and b.property_id = l.property_id
          and b.tenant_chargeable
          and b.status <> 'rejected'
          and b.currency = l.currency
      ), date_trunc('month', l.start_date)::date),
      coalesce((
        select max(date_trunc('month', e.expense_date)::date)
        from public.expenses e
        where e.organization_id = l.organization_id
          and e.property_id = l.property_id
          and e.tenant_chargeable
          and e.currency = l.currency
      ), date_trunc('month', l.start_date)::date)
    ) as last_month
  from public.leases l
  where l.status in ('active', 'ended')
),
months as (
  select
    b.*,
    gs::date as month
  from bounds b
  cross join generate_series(b.first_month, b.last_month, interval '1 month') as gs
),
billed as (
  select
    b.organization_id,
    b.property_id,
    date_trunc('month', coalesce(b.period_start, b.due_date, b.created_at::date))::date as month,
    b.currency,
    sum(b.amount) as bills_due
  from public.bills b
  where b.tenant_chargeable
    and b.status <> 'rejected'
    and b.property_id is not null
  group by b.organization_id, b.property_id,
           date_trunc('month', coalesce(b.period_start, b.due_date, b.created_at::date))::date,
           b.currency
),
spend as (
  select
    e.organization_id,
    e.property_id,
    date_trunc('month', e.expense_date)::date as month,
    e.currency,
    sum(e.amount) as expenses_due
  from public.expenses e
  where e.tenant_chargeable
  group by e.organization_id, e.property_id, date_trunc('month', e.expense_date)::date, e.currency
),
rows as (
  select
    m.lease_id,
    m.organization_id,
    m.property_id,
    m.tenant_id,
    m.currency,
    m.rent_due_day,
    m.month,
    -- No rent for a month after the lease ended, even if a late payment or a
    -- straggling bill pulls that month into the series.
    case
      when m.end_month is not null and m.month > m.end_month then 0
      else m.monthly_rent
    end::numeric(14, 2) as rent_due,
    coalesce(bi.bills_due, 0)::numeric(14, 2) as bills_due,
    coalesce(sp.expenses_due, 0)::numeric(14, 2) as expenses_due,
    coalesce(pa.paid, 0)::numeric(14, 2) as paid,
    pa.payment_date,
    pa.payment_id
  from months m
  left join billed bi
    on bi.organization_id = m.organization_id and bi.property_id = m.property_id
   and bi.month = m.month and bi.currency = m.currency
  left join spend sp
    on sp.organization_id = m.organization_id and sp.property_id = m.property_id
   and sp.month = m.month and sp.currency = m.currency
  left join lateral (
    select rp.id as payment_id, rp.paid_amount as paid, rp.payment_date
    from public.rent_payments rp
    where rp.lease_id = m.lease_id and rp.period_month = m.month
    limit 1
  ) pa on true
)
select
  r.lease_id,
  r.organization_id,
  r.property_id,
  r.tenant_id,
  r.currency,
  r.month,
  r.payment_id,
  r.payment_date,
  r.rent_due,
  r.bills_due,
  r.expenses_due,
  (r.rent_due + r.bills_due + r.expenses_due)::numeric(14, 2) as charges,
  r.paid,
  (r.paid - (r.rent_due + r.bills_due + r.expenses_due))::numeric(14, 2) as month_delta,
  -- Carried forward: negative means the tenant still owes.
  (sum(r.paid - (r.rent_due + r.bills_due + r.expenses_due))
     over (partition by r.lease_id order by r.month
           rows between unbounded preceding and current row))::numeric(14, 2) as balance
from rows r;
