-- Two changes.
--
-- 1. A fragment is charged in ITS OWN nearest rent cycle, not in the month of
--    whatever came before it.
--
--    A 5-15 day invoice whose period has ended before the lease's due day is
--    charged this month, even when that means the month carries 30 + 5 days of
--    consumption. Migration 0013 grouped contiguous fragments into the first
--    one's month; that is now dropped, and the period-end rule from 0014
--    decides each bill on its own.
--
-- 2. "As long as they do not overlap" is enforced by the database.
--
--    Overlapping periods would bill the same consumption twice. A trigger
--    rather than an exclusion constraint, because it can name the bill that
--    conflicts, and because btree_gist is not available everywhere the schema
--    is tested.

create or replace function public.bills_reject_overlapping_period()
returns trigger
language plpgsql
as $$
declare
  conflicting record;
begin
  if new.property_id is null
     or new.period_start is null
     or new.period_end is null
     or new.status = 'rejected' then
    return new;
  end if;

  select b.id, b.period_start, b.period_end
    into conflicting
  from public.bills b
  where b.organization_id = new.organization_id
    and b.property_id     = new.property_id
    and b.bill_type       = new.bill_type
    and b.status <> 'rejected'
    and b.id <> new.id
    and b.period_start is not null
    and b.period_end is not null
    and daterange(b.period_start, b.period_end, '[]')
        && daterange(new.period_start, new.period_end, '[]')
  limit 1;

  if conflicting.id is not null then
    raise exception
      'bills_overlapping_period: % .. % overlaps existing bill % (% .. %)',
      new.period_start, new.period_end,
      conflicting.id, conflicting.period_start, conflicting.period_end
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create trigger bills_no_overlapping_period
  before insert or update of period_start, period_end, property_id, bill_type, status
  on public.bills
  for each row execute function public.bills_reject_overlapping_period();

-- Each bill now stands on its own, so the run grouping goes.
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
bill_charges as (
  select
    al.lease_id,
    -- A period that has ended before the due day is charged this month; one
    -- that ends on or after it waits for the next. Overlap is impossible, so
    -- a month may legitimately carry more than one period.
    coalesce(
      b.charge_month_override,
      public.charge_month(
        coalesce(b.period_end, b.issue_date, b.due_date, b.created_at::date),
        al.rent_due_day
      )
    ) as month,
    b.amount,
    b.bill_type
  from public.bills b
  join active_leases al
    on  al.organization_id = b.organization_id
    and al.property_id     = b.property_id
    and al.currency        = b.currency
  where b.tenant_chargeable
    and b.status <> 'rejected'
    and b.property_id is not null
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

insert into public.schema_migrations (version) values ('0015_fragments_own_month')
on conflict (version) do nothing;
