-- When does a bill land on the tenant's statement?
--
-- Not by its consumption period. A landlord charges whatever invoice was
-- already in hand by the time the rent falls due:
--
--   invoice issued 20 Aug, rent due on the 20th -> September statement
--   invoice issued 20 Aug, rent due on the 10th -> September statement
--   invoice issued 20 Sep, rent due on the 10th -> October statement
--
-- So the charge month is the first rent cycle whose due date falls after the
-- invoice was issued. That depends on the lease's rent_due_day, which is why
-- the bucketing lives here rather than on the bill itself.

-- The issue date was never stored; the parsers read it and the rule needs it.
alter table public.bills add column issue_date date;

comment on column public.bills.issue_date is
  'Date printed on the invoice. Decides which rent cycle the bill is charged in.';

create or replace function public.charge_month(document_date date, rent_due_day integer)
returns date
language sql
immutable
as $$
  select case
    when document_date is null then null
    when extract(day from document_date) < rent_due_day
      then date_trunc('month', document_date)::date
    else (date_trunc('month', document_date) + interval '1 month')::date
  end
$$;

comment on function public.charge_month(date, integer) is
  'First rent cycle whose due day falls after the given date.';

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
-- Bills are attached to a property; a lease claims the ones whose charge month
-- falls inside its own span, so consecutive tenancies never share a bill.
bill_charges as (
  select
    al.lease_id,
    public.charge_month(
      coalesce(b.issue_date, b.period_end, b.due_date, b.created_at::date),
      al.rent_due_day
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
-- An expense follows the same rule: one incurred after the due date cannot be
-- charged on that statement.
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
-- rent_payments is unique on (lease_id, period_month), so there is nothing
-- to aggregate here.
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

insert into public.schema_migrations (version) values ('0011_charge_month')
on conflict (version) do nothing;
