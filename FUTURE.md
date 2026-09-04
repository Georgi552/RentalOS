# FUTURE

Ideas that came up during development but are out of scope for the current
milestone. Nothing here gets built until the MVP workflow works end to end.

## Deferred from the MVP schema

- `statements` / `statement_items` were dropped in migration 0009. They were
  designed before the ledger and never written to; `statement_sends` records
  what was actually mailed, and the amounts stay derived from their sources.
- `maintenance_requests` as its own entity. For now maintenance and repairs
  are expense categories (context doc section 21).
- Multi-user organizations. The schema supports members and roles, but there
  is no invite flow, and `organization_members` is read-only from the client.
- Currency conversion. `EUR` and `BGN` are both allowed, but a statement is
  pinned to one currency by foreign key. No FX rates.

## Known limitations to revisit

- The charge month comes from the period end, so an invoice that arrives very
  late can land in a month whose statement has already been sent.
  charge_month_override moves it.
- Bills of the same kind for one property may not have overlapping periods; a
  trigger refuses them. Adjacent periods are fine, and a month can carry more
  than one period.
- A bill is charged to the tenant automatically only when the lease records
  terms for that bill type. Leases created before migration 0003 have none, so
  their bills default to "not charged" until the terms are filled in.

- The ledger matches charges to the lease currency. A bill raised in another
  currency is left out rather than added to a different one. Fine while a lease
  is single-currency; needs FX rates if that changes.
- The balance carries forward per lease. A tenant with two leases has two
  separate balances, which is correct but means no single "what does this
  person owe me" figure yet.

- Deleting a user leaves an orphan `organizations` row (no members, so it is
  invisible to everyone). Needs a cleanup trigger before account deletion
  ships.

- Auto-send only runs on a deployment with a scheduler. Locally the cron
  route exists but nothing calls it; on Vercel `vercel.json` triggers it daily.
- A statement is always for the current month. Sending next month's rent early
  is not possible, because the ledger has no future months until something is
  charged in them.

## Post-MVP (context doc section 8)

- Email ingestion of invoices
- Utility provider integrations (Sofia Water, Electrohold, EVN, Energo-Pro)
- Payment matching against bank transactions
- Stripe subscriptions
- Multi-country support
- Advanced profitability analytics
- Snowflake / dbt analytics layer
