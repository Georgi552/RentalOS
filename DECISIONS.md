# Decisions

Rules that were arrived at the hard way. Each one is here because the obvious
version of it charged somebody the wrong amount, and each was corrected by the
landlord looking at real invoices and saying "that is not how it works".

Read this before touching anything that produces a number. The reasoning
matters more than the rule: a future change that contradicts one of these is
probably reintroducing a bug that has already been paid for once.

`git log` carries the same reasoning per change, in more detail.

---

## Money never touches a JavaScript number

Amounts are PostgreSQL `numeric` and **must** be read with a `::text` cast:

```ts
.select("monthly_rent::text")
```

Without the cast PostgREST returns a JSON number and supabase-js parses it into
a double, where `0.07 * 3 === 0.21000000000000002`. Amounts therefore travel
through the app as exact decimal strings.

- Addition goes through `addMoney()` in `lib/money.ts`, which works in integer
  cents via BigInt.
- Comparison goes through `compareMoney()`.
- Sums are computed in PostgreSQL, in the views, never in TypeScript.
- The only permitted `Number()` on an amount is pixel geometry in a chart.

## A bill is charged by the END of its billing period

Not by its issue date, and not by the period's start or midpoint.

The charge month is the first rent cycle whose due day falls after the period
ended — `public.charge_month(date, rent_due_day)`.

Measured against real invoices on a lease with rent due on the 20th:

| Period | Charged |
|---|---|
| 14.06 – 30.06 | July |
| 15.07 – 13.08 | August |

Those invoices were issued on 21.07 and 20.08. Charging by issue date put both
a month late. A provider that invoices late must not shift the tenant's month.

Consequence: an invoice that arrives very late can land in a month whose
statement has already been sent. `bills.charge_month_override` moves it by hand.

## Periods may not overlap, but a month may hold several

A provider sometimes splits one cycle into two invoices, and sometimes issues a
5–15 day fragment. Each is charged in its own nearest cycle, so a month can
legitimately carry 35 days of consumption.

What must never happen is two bills covering the same days, which would bill
the consumption twice. A trigger
(`public.bills_reject_overlapping_period`) refuses partial overlap, an
identical period, one contained in another, and one spanning another. Adjacent
periods pass.

An earlier version grouped contiguous short periods into the first one's month.
That was dropped: it decided for the landlord, and the period-end rule already
puts fragments where they belong.

## A month is not a debt before its due day

The ledger shows an upcoming month — seeing what is coming is useful — but its
charges only enter the balance once `due_date <= current_date`.

A payment counts the moment it lands, so a prepayment shows as credit
immediately. Columns: `due_date`, `is_due`, `charges_due`.

Without this, on the 4th of a month with rent due on the 20th, the tenant
appeared to owe rent nobody had asked them for yet.

## The invoice total and the amount payable are different numbers

Every provider prints both, each in its own way:

| Provider | Charge for the period | Payable now |
|---|---|---|
| Топлофикация | `ВСИЧКО по фактура` | `Оставаща сума за плащане` |
| Софийска вода | `Сума по фактура` | `ОБЩА ДЪЛЖИМА СУМА` (adds `Старо салдо`) |
| Електрохолд | `Обща стойност на сделката` | no combined total printed |

A real invoice charged 41.34 for the month while nothing was payable, because a
75.84 equalisation credit covered it.

Which figure belongs on a tenant's statement is **not** a parsing question: a
credit from an equalisation account belongs to whoever paid the instalments
that produced it. So when the two differ, the bill is never written
automatically. The reading goes to the form with both numbers shown and the
landlord decides. `bills.invoice_total` keeps the other figure visible.

## A tenant is never asked for a negative amount

When a carried credit exceeds the month's charges, the amount to pay is floored
at zero and the leftover credit is shown on its own line.

## Who pays a bill, and whether it is passed on, are two questions

`lease_bill_terms` records both per bill type, because three cases exist:

| Case | We pay | Charged to tenant |
|---|---|---|
| The bill is ours | yes | no |
| Tenant pays through the rent | yes | yes |
| Tenant pays the provider directly | **no** | no |

`tenant_chargeable` alone cannot tell the first from the third, and the monthly
net was wrong for every direct-paid bill until `paid_by_landlord` was added.

Every bill type must be answered explicitly when a lease is created. There is
no default, because a wrong default silently becomes a wrong tenant statement.

## A payment records what it was for

On a lease that settles rent and bills separately, a payment is one row
carrying its `kind` (`rent` / `bills`), unique per `(lease_id, period_month,
kind)`.

The previous shape — one row per month with a `paid_rent` and a `paid_bills`
column, written by an upsert — meant recording a bills payment submitted the
rent field as 0 and wiped the rent already there. The two overwrote each other
until both were zero. A trigger now requires the kind on a split lease and
forbids it elsewhere, so the two balances can never stop summing to the
combined one.

## Property matching suggests, and only sometimes decides

In the order of the product brief:

1. A customer number already confirmed for that provider — **certain**
2. An identical normalised address — **certain**
3. Every word of a property's address present in the invoice's, including a
   block or apartment number — **suggests only**

Two properties sharing an address, or a match on the neighbourhood alone,
produce nothing rather than a guess. The three providers write the same address
three different ways, so the address is never enough on its own:

```
ток:  СОФИЯ, ж.к. БЕЛИТЕ БРЕЗИ, бл. 5, ап. 1
вода: 1680,КРАСНО СЕЛО,СОФИЯ,ж.к. Белите брези Бл:005 Ет:1 Ап:1
топло: София БЕЛИ БРЕЗИ 1680, бл.5 вх.1 ап.Апартамент 1
```

The first invoice from a provider is assigned by hand. That confirmation is
what teaches the customer number, and every later one is automatic.

## A bill is written without asking only when nothing is in doubt

Uploading a PDF creates the bill by itself only when the invoice was read
cleanly, the property match is `certain`, and the invoice total equals the
payable amount. Anything less goes to the form with the reason shown.

Extraction is untrusted input. It is validated before reaching the database and
a person still confirms it.

## Tenancy is enforced twice

Every table carries `organization_id` and RLS filters on it through
`public.is_org_member()`. Child tables additionally use a **composite foreign
key on `(id, organization_id)`**, so a landlord cannot attach a lease, bill or
document to another organization's record even with a hand-crafted insert.

Two things that bite:

- `ON DELETE SET NULL` on a composite key nulls *every* column in it, including
  the NOT NULL `organization_id`, which makes the delete fail instead of
  clearing the reference. Use `ON DELETE SET NULL (column)`.
- Views must be declared `WITH (security_invoker = true)` or they run as their
  owner and bypass RLS entirely.

## Only PostgreSQL adds money up

`lease_monthly_ledger` and `property_monthly_financials` do the arithmetic.
Both are grouped by currency, so EUR is never added to BGN, and a bill raised
in a currency the lease does not use is left out rather than converted.
