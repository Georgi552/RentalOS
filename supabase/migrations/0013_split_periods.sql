-- A provider sometimes splits one billing cycle into two invoices. Both parts
-- belong to the same rent cycle, but the second is issued a month later and
-- would otherwise be charged a month later too.
--
-- Real case: rent due on the 1st.
--   part 1: issued 21.06, period 15.05 - 13.06 (30 days) -> July
--   part 2: issued 21.07, period 14.06 - 30.06 (17 days) -> August, wrongly
--
-- What marks part 2 is that it is SHORT and starts right after part 1 ends. A
-- normal monthly invoice is also contiguous with the one before it, so
-- contiguity alone would chain every invoice into the first one's month --
-- the period length is what separates a fragment from a full cycle.
--
-- Bills are grouped into runs: a bill continues the previous one when it
-- starts within 3 days of that period ending AND covers at most 20 days. Every
-- bill in a run is charged in the month of the run's first bill.
--
-- charge_month_override exists for anything this rule does not cover. Set by
-- hand, it always wins.

alter table public.bills add column charge_month_override date;

alter table public.bills add constraint bills_charge_month_override_is_month
  check (
    charge_month_override is null
    or date_trunc('month', charge_month_override) = charge_month_override
  );

comment on column public.bills.charge_month_override is
  'Forces the rent cycle this bill is charged in, overriding the issue-date rule.';

drop view if exists public.lease_monthly_ledger;

create view public.lease_monthly_ledger with (security_invoker = true) as
with active_leases as (
  select
    l.id as lease_id,
    l.organization_id,
    l.property_id,
    l.tenant_id,
    l.currency,
    l.monthly_rent,
    l.rent_due_day,
    date_trunc('month', l.start_date)::date as first_month,
    date_trunc('month', l.end_date)::date as end_month
  from public.leases l
  where l.status in ('active', 'ended')
),
-- Runs of contiguous short periods, per property and bill type.
-- Split in two steps: a window function cannot be nested inside another, so
-- the previous period end is read first and the run counted after.
chargeable_bills as (
  select
    b.id,
    b.organization_id,
    b.property_id,
    b.bill_type,
    b.currency,
    b.amount,
    b.charge_month_override,
    b.period_start,
    b.period_end,
    b.created_at,
    coalesce(b.issue_date, b.period_end, b.due_date, b.created_at::date) as dated,
    lag(b.period_end) over (
      partition by b.organization_id, b.property_id, b.bill_type
      order by b.period_start nulls last, b.created_at
    ) as previous_period_end
  from public.bills b
  where b.tenant_chargeable
    and b.status <> 'rejected'
    and b.property_id is not null
),
runs as (
  select
    cb.*,
    sum(
      case
        when cb.period_start is not null
         and cb.previous_period_end is not null
         and cb.period_start - cb.previous_period_end between 0 and 3
         and cb.period_end - cb.period_start <= 20
        then 0
        else 1
      end
    ) over (
      partition by cb.organization_id, cb.property_id, cb.bill_type
      order by cb.period_start nulls last, cb.created_at
    ) as run_id
  from chargeable_bills cb
),
bill_charges as (
  select
    al.lease_id,
    coalesce(
      r.charge_month_override,
      -- The whole run is charged where its first bill lands.
      first_value(public.charge_month(r.dated, al.rent_due_day)) over (
        partition by r.organization_id, r.property_id, r.bill_type, r.run_id, al.lease_id
        order by r.period_start nulls last
      )
    ) as month,
    r.amount,
    r.bill_type
  from runs r
  join active_leases al
    on  al.organization_id = r.organization_id
    and al.property_id     = r.property_id
    and al.currency        = r.currency
),
billed as (
  select
    lease_id,
    month,
    sum(amount) as bills_due,
    sum(case when bill_type = 'electricity'  then amount else 0 end) as bills_electricity,
    sum(case when bill_type = 'water'        then amount else 0 end) as bills_water,
    sum(case when bill_type = 'heating'      then amount else 0 end) as bills_heating,
    sum(case when bill_type = 'building_fee' then amount else 0 end) as bills_building_fee,
    sum(case when bill_type = 'internet'     then amount else 0 end) as bills_internet,
    sum(case when bill_type = 'other'        then amount else 0 end) as bills_other
  from bill_charges
  group by lease_id, month
),
spend as (
  select
    al.lease_id,
    public.charge_month(e.expense_date, al.rent_due_day) as month,
    sum(e.amount) as expenses_due
  from public.expenses e
  join active_leases al
    on  al.organization_id = e.organization_id
    and al.property_id     = e.property_id
    and al.currency        = e.currency
  where e.tenant_chargeable
  group by al.lease_id, public.charge_month(e.expense_date, al.rent_due_day)
),
paid as (
  select rp.lease_id, rp.period_month as month, rp.paid_amount as paid,
         rp.id as payment_id, rp.payment_date
  from public.rent_payments rp
),
bounds as (
  select
    al.*,
    greatest(
      case
        when al.end_month is null then date_trunc('month', current_date)::date
        else al.end_month
      end,
      coalesce((select max(month) from paid   p where p.lease_id = al.lease_id), al.first_month),
      coalesce((select max(month) from billed b where b.lease_id = al.lease_id), al.first_month),
      coalesce((select max(month) from spend  s where s.lease_id = al.lease_id), al.first_month)
    ) as last_month
  from active_leases al
),
months as (
  select b.*, gs::date as month
  from bounds b
  cross join generate_series(b.first_month, b.last_month, interval '1 month') as gs
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
  left join billed bi on bi.lease_id = m.lease_id and bi.month = m.month
  left join spend  sp on sp.lease_id = m.lease_id and sp.month = m.month
  left join paid   pa on pa.lease_id = m.lease_id and pa.month = m.month
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

insert into public.schema_migrations (version) values ('0013_split_periods')
on conflict (version) do nothing;
