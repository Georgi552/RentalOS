-- 1. District heating is a normal utility here, so it becomes a bill type of
--    its own rather than hiding inside "other".
alter table public.bills drop constraint bills_bill_type_check;
alter table public.bills add constraint bills_bill_type_check
  check (bill_type in ('electricity', 'water', 'heating', 'internet', 'building_fee', 'other'));

alter table public.lease_bill_terms drop constraint lease_bill_terms_bill_type_check;
alter table public.lease_bill_terms add constraint lease_bill_terms_bill_type_check
  check (bill_type in ('electricity', 'water', 'heating', 'internet', 'building_fee', 'other'));

alter table public.expenses drop constraint expenses_category_check;
alter table public.expenses add constraint expenses_category_check
  check (category in ('electricity', 'water', 'heating', 'internet', 'building_fee',
                      'maintenance', 'repair', 'other'));

-- 2. The ledger keeps its totals but now also splits the charged bills by
--    type, so a chart can show them side by side without a second query.
drop view if exists public.lease_monthly_ledger;

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
  select b.*, gs::date as month
  from bounds b
  cross join generate_series(b.first_month, b.last_month, interval '1 month') as gs
),
billed as (
  select
    b.organization_id,
    b.property_id,
    date_trunc('month', coalesce(b.period_start, b.due_date, b.created_at::date))::date as month,
    b.currency,
    sum(b.amount) as bills_due,
    sum(case when b.bill_type = 'electricity'  then b.amount else 0 end) as bills_electricity,
    sum(case when b.bill_type = 'water'        then b.amount else 0 end) as bills_water,
    sum(case when b.bill_type = 'heating'      then b.amount else 0 end) as bills_heating,
    sum(case when b.bill_type = 'building_fee' then b.amount else 0 end) as bills_building_fee,
    sum(case when b.bill_type = 'internet'     then b.amount else 0 end) as bills_internet,
    sum(case when b.bill_type = 'other'        then b.amount else 0 end) as bills_other
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
ledger_rows as (
  select
    m.lease_id,
    m.organization_id,
    m.property_id,
    m.tenant_id,
    m.currency,
    m.rent_due_day,
    m.month,
    case
      when m.end_month is not null and m.month > m.end_month then 0
      else m.monthly_rent
    end::numeric(14, 2) as rent_due,
    coalesce(bi.bills_due, 0)::numeric(14, 2) as bills_due,
    coalesce(bi.bills_electricity, 0)::numeric(14, 2) as bills_electricity,
    coalesce(bi.bills_water, 0)::numeric(14, 2) as bills_water,
    coalesce(bi.bills_heating, 0)::numeric(14, 2) as bills_heating,
    coalesce(bi.bills_building_fee, 0)::numeric(14, 2) as bills_building_fee,
    coalesce(bi.bills_internet, 0)::numeric(14, 2) as bills_internet,
    coalesce(bi.bills_other, 0)::numeric(14, 2) as bills_other,
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
  r.bills_electricity,
  r.bills_water,
  r.bills_heating,
  r.bills_building_fee,
  r.bills_internet,
  r.bills_other,
  r.expenses_due,
  (r.rent_due + r.bills_due + r.expenses_due)::numeric(14, 2) as charges,
  r.paid,
  (r.paid - (r.rent_due + r.bills_due + r.expenses_due))::numeric(14, 2) as month_delta,
  (sum(r.paid - (r.rent_due + r.bills_due + r.expenses_due))
     over (partition by r.lease_id order by r.month
           rows between unbounded preceding and current row))::numeric(14, 2) as balance
from ledger_rows r;
