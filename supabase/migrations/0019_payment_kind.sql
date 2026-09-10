-- A payment records what it was for.
--
-- Bug this fixes: rent_payments held one row per lease per month with two
-- columns, paid_rent and paid_bills, written by an upsert. Recording a bills
-- payment submitted the rent field as 0 and wiped the rent that was already
-- there; recording the rent afterwards wiped the bills. On a real lease both
-- ended at zero and the landlord could not get either to stick.
--
-- The shape was wrong, not the write. A payment is one amount that was for
-- one thing, so it is now one row carrying its kind. Two payments in the same
-- month are two rows and cannot touch each other.

alter table public.rent_payments
  add column kind text not null default 'combined'
  check (kind in ('rent', 'bills', 'combined'));

comment on column public.rent_payments.kind is
  'What the payment was for. Split leases use rent/bills; the rest use combined.';

-- Existing rows: a split lease had its money in paid_rent, everything else was
-- one undivided payment.
update public.rent_payments rp
set kind = case when l.split_rent_and_bills then 'rent' else 'combined' end
from public.leases l
where l.id = rp.lease_id;

-- Both views read the old columns.
drop view if exists public.lease_monthly_ledger;
drop view if exists public.property_monthly_financials;

-- One amount per row now that the kind says where it belongs.
alter table public.rent_payments drop column paid_amount;
alter table public.rent_payments
  add column paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0);
update public.rent_payments set paid_amount = paid_rent + paid_bills;
alter table public.rent_payments drop column paid_rent;
alter table public.rent_payments drop column paid_bills;

-- A month may hold one payment of each kind, and re-entering one corrects it.
alter table public.rent_payments drop constraint rent_payments_lease_period_key;
alter table public.rent_payments
  add constraint rent_payments_lease_period_kind_key unique (lease_id, period_month, kind);

-- A split lease's payments must say which stream they belong to. Otherwise the
-- two balances would not add up to the combined one and nobody would notice.
create or replace function public.rent_payments_kind_matches_lease()
returns trigger
language plpgsql
as $$
declare
  is_split boolean;
begin
  select l.split_rent_and_bills into is_split
  from public.leases l where l.id = new.lease_id;

  if is_split and new.kind = 'combined' then
    raise exception
      'rent_payments_kind_required: this lease settles rent and bills separately, so a payment must be marked as one or the other';
  end if;

  if not is_split and new.kind <> 'combined' then
    raise exception
      'rent_payments_kind_unexpected: this lease has a single balance, so a payment is not split';
  end if;

  return new;
end;
$$;

create trigger rent_payments_kind_check
  before insert or update of kind, lease_id on public.rent_payments
  for each row execute function public.rent_payments_kind_matches_lease();

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

insert into public.schema_migrations (version) values ('0019_payment_kind')
on conflict (version) do nothing;
