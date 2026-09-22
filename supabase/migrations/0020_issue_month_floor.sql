-- A bill cannot be charged in a month before the invoice existed.
--
-- The period end still decides the month (migration 0014). This adds a floor
-- under it: if the invoice was issued in a LATER calendar month than the one
-- the period end picked, the charge moves forward to the month of issue.
--
-- The invoice that forced this, from Електрохолд:
--
--   period 12.07 - 11.08,  issued 10.09,  rent due on the 15th
--
-- The period end put it in August, whose statement went out on 15.08 - three
-- weeks before the invoice existed. This account is read around the 11th and
-- invoiced around the 10th of the following month, so EVERY invoice on it lands
-- in a closed month. charge_month_override was meant for the odd late invoice,
-- not for one account every single month.
--
-- Why the floor is the calendar month of issue and not the rent cycle of the
-- issue date: Електрохолд issues around the 20th, which on the other lease is
-- exactly the rent due day. Keying off the cycle would put an invoice issued on
-- the 21st a month later than one issued on the 20th, so a single day of
-- provider slippage would move a whole month. Two real invoices, issued 21.07
-- and 20.08, would both have landed in August and left July with no electricity
-- at all. The calendar month turns over on the 1st, far from any due day, and
-- so only reacts when a provider is late by a full month.
--
-- Measured against every bill on the live database: of 17, this moves exactly
-- one - the invoice above, from August to September. The two invoices that
-- migration 0014 was built on stay where they are.

create or replace function public.bill_charge_month(
  dated date,
  issue_date date,
  rent_due_day integer
)
returns date
language sql
immutable
as $$
  -- greatest() ignores nulls in PostgreSQL, so a bill with no issue date keeps
  -- the period-end answer untouched.
  select greatest(
    public.charge_month(dated, rent_due_day),
    date_trunc('month', issue_date)::date
  )
$$;

comment on function public.bill_charge_month(date, date, integer) is
  'Charge month from the period end, never earlier than the month of issue.';

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
    l.split_rent_and_bills,
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
    -- a month may legitimately carry more than one period. An invoice issued
    -- in a later month than that cannot be charged before it existed.
    coalesce(
      b.charge_month_override,
      public.bill_charge_month(
        coalesce(b.period_end, b.issue_date, b.due_date, b.created_at::date),
        b.issue_date,
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
-- One row per kind per month, so a rent payment and a bills payment for the
-- same month are separate records that cannot overwrite one another.
paid as (
  select
    rp.lease_id,
    rp.period_month as month,
    sum(rp.paid_amount) as paid,
    sum(rp.paid_amount) filter (where rp.kind = 'rent') as paid_rent,
    sum(rp.paid_amount) filter (where rp.kind = 'bills') as paid_bills,
    min(rp.payment_date) as payment_date,
    (array_agg(rp.id order by rp.created_at))[1] as payment_id
  from public.rent_payments rp
  group by rp.lease_id, rp.period_month
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
    coalesce(pa.paid_rent, 0)::numeric(14, 2) as paid_rent,
    coalesce(pa.paid_bills, 0)::numeric(14, 2) as paid_bills,
    m.split_rent_and_bills,
    pa.payment_date,
    pa.payment_id,
    -- The month's rent and bills fall due on the lease's own due day.
    (m.month + (m.rent_due_day - 1))::date as due_date
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
  r.split_rent_and_bills,
  r.paid_rent,
  r.paid_bills,
  -- Everything the tenant owes this month that is not rent.
  (r.bills_due + r.expenses_due)::numeric(14, 2) as bills_and_expenses_due,
  r.due_date,
  -- Nothing is owed before the due day arrives. The row still shows what is
  -- coming; it just does not count as debt yet.
  (r.due_date <= current_date) as is_due,
  (r.rent_due + r.bills_due + r.expenses_due)::numeric(14, 2) as charges,
  r.paid,
  (case when r.due_date <= current_date
        then r.rent_due + r.bills_due + r.expenses_due
        else 0 end)::numeric(14, 2) as charges_due,
  (r.paid - (r.rent_due + r.bills_due + r.expenses_due))::numeric(14, 2) as month_delta,
  -- A payment counts the moment it is received, so a prepayment shows as
  -- credit straight away; charges count from their due date.
  (sum(
     r.paid - case when r.due_date <= current_date
                   then r.rent_due + r.bills_due + r.expenses_due
                   else 0 end
   ) over (partition by r.lease_id order by r.month
           rows between unbounded preceding and current row))::numeric(14, 2) as balance,

  -- Kept apart for a lease where rent is paid in advance and the bills are
  -- settled month by month: money put towards rent must not quietly cover a
  -- bill, nor the other way round. Their sum is always the combined balance.
  (sum(
     r.paid_rent - case when r.due_date <= current_date then r.rent_due else 0 end
   ) over (partition by r.lease_id order by r.month
           rows between unbounded preceding and current row))::numeric(14, 2) as rent_balance,
  (sum(
     r.paid_bills - case when r.due_date <= current_date
                         then r.bills_due + r.expenses_due
                         else 0 end
   ) over (partition by r.lease_id order by r.month
           rows between unbounded preceding and current row))::numeric(14, 2) as bills_balance
from ledger_rows r;

insert into public.schema_migrations (version) values ('0020_issue_month_floor')
on conflict (version) do nothing;
