-- Per-property monthly money, summed in PostgreSQL.
--
-- Sums live here rather than in TypeScript because numeric arrives in
-- JavaScript as a float (see lib/money.ts). Grouping includes currency: a
-- property billed in two currencies gets one row per currency, because adding
-- EUR to BGN would be wrong.
--
-- security_invoker keeps RLS applied to the caller. Without it the view would
-- run as its owner and leak across organizations.

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
)
select
  coalesce(r.organization_id, s.organization_id) as organization_id,
  coalesce(r.property_id, s.property_id) as property_id,
  coalesce(r.month, s.month) as month,
  coalesce(r.currency, s.currency) as currency,
  coalesce(r.rent_expected, 0)::numeric(14, 2) as rent_expected,
  coalesce(r.rent_paid, 0)::numeric(14, 2) as rent_paid,
  coalesce(s.expenses_total, 0)::numeric(14, 2) as expenses_total,
  coalesce(s.expenses_chargeable, 0)::numeric(14, 2) as expenses_chargeable,
  (coalesce(r.rent_paid, 0) - coalesce(s.expenses_total, 0))::numeric(14, 2) as net
from rent r
full join spend s
  on  s.organization_id = r.organization_id
  and s.property_id     = r.property_id
  and s.month           = r.month
  and s.currency        = r.currency;
