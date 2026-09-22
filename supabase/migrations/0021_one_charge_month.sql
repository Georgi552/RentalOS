-- One definition of which month a charge belongs to.
--
-- Bug this fixes: the tenant statement picked its line items with its own rule,
-- date_trunc('month', coalesce(period_start, due_date, created_at)), while the
-- ledger totalled them with public.charge_month() over the period END plus the
-- override. The comment in lib/statement.ts claimed the two matched. They never
-- did, and on real data they agreed for almost nothing:
--
--   September 2026, before this migration
--     ledger says   Бели брези  73.39   Драгалевци  48.05
--     statement listed NO bill lines at all for either
--
-- So the statement showed a total the tenant could not account for - the one
-- thing a statement exists to prevent (context doc section 29). Bills with no
-- period were worse: they fell back to created_at and landed in whatever month
-- the landlord happened to type them in.
--
-- The fix is structural, not a corrected copy of the expression. Two views now
-- own the month, the ledger aggregates them, and the statement reads the same
-- rows. A future change to the rule cannot make the two disagree again, because
-- there is no longer a second place to change.
--
-- The month depends on the lease's rent_due_day, so a charge on a property with
-- two leases is one row per lease, each with its own month.

create view public.lease_bill_charges with (security_invoker = true) as
select
  b.id as bill_id,
  l.id as lease_id,
  b.organization_id,
  b.property_id,
  b.currency,
  b.bill_type,
  b.provider,
  b.period_start,
  b.period_end,
  b.issue_date,
  b.amount,
  coalesce(
    b.charge_month_override,
    public.bill_charge_month(
      coalesce(b.period_end, b.issue_date, b.due_date, b.created_at::date),
      b.issue_date,
      l.rent_due_day
    )
  ) as month
from public.bills b
join public.leases l
  on  l.organization_id = b.organization_id
  and l.property_id     = b.property_id
  and l.currency        = b.currency
  and l.status in ('active', 'ended')
where b.tenant_chargeable
  and b.status <> 'rejected'
  and b.property_id is not null;

comment on view public.lease_bill_charges is
  'Tenant-chargeable bills with the month they are charged in. The only place that decides it.';

create view public.lease_expense_charges with (security_invoker = true) as
select
  e.id as expense_id,
  l.id as lease_id,
  e.organization_id,
  e.property_id,
  e.currency,
  e.category,
  e.description,
  e.expense_date,
  e.amount,
  public.charge_month(e.expense_date, l.rent_due_day) as month
from public.expenses e
join public.leases l
  on  l.organization_id = e.organization_id
  and l.property_id     = e.property_id
  and l.currency        = e.currency
  and l.status in ('active', 'ended')
where e.tenant_chargeable;

comment on view public.lease_expense_charges is
  'Tenant-chargeable expenses with the month they are charged in.';

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
-- Both of these now only add up what the views already placed in a month.
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
  from public.lease_bill_charges
  group by lease_id, month
),
spend as (
  select lease_id, month, sum(amount) as expenses_due
  from public.lease_expense_charges
  group by lease_id, month
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

insert into public.schema_migrations (version) values ('0021_one_charge_month')
on conflict (version) do nothing;
