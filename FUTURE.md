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

- Password recovery emails go through Supabase's built-in mail service, which
  is rate limited to a handful per hour and sends from a Supabase address.
  Statements already use Resend; pointing Supabase's SMTP at it too would make
  recovery reliable and put both under one sender domain.

- A provider-side credit is recorded per bill, not tracked as a running
  balance at the provider. If a credit spans several months, each invoice has
  to be read and decided on its own.

- The charge month comes from the period end with the month of issue as a floor,
  so an invoice late by less than a full month can still land in a month whose
  statement has already been sent. charge_month_override moves it.

- An invoice sent as a link rather than an attachment is not ingested. The
  inbound journal records it as "Без фактура" and the landlord uploads it by
  hand. Fetching a URL out of an unverified email is deliberately not done.
- The inbound address is per organization and readable rather than secret, so a
  stranger who guesses it can fill the review queue. Bounded by 50 mails per
  24 hours and by the address being changeable, not prevented.
- The Cloudflare Worker is not covered by `npm test`, `npm run lint` or
  `npm run build`. It has its own `typecheck` script and nothing beyond that.
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

- Utility provider integrations (Sofia Water, Electrohold, EVN, Energo-Pro)
- Payment matching against bank transactions
- Stripe subscriptions
- Multi-country support
- Advanced profitability analytics
- Snowflake / dbt analytics layer

Email ingestion of invoices is built; see STATE.md for what is left to switch it
on.
