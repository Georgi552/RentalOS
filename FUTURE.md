# FUTURE

Ideas that came up during development but are out of scope for the current
milestone. Nothing here gets built until the MVP workflow works end to end.

## Deferred from the MVP schema

- `maintenance_requests` as its own entity. For now maintenance and repairs
  are expense categories (context doc section 21).
- Multi-user organizations. The schema supports members and roles, but there
  is no invite flow, and `organization_members` is read-only from the client.
- Currency conversion. `EUR` and `BGN` are both allowed, but a statement is
  pinned to one currency by foreign key. No FX rates.

## Known limitations to revisit

- Rent rows are created by hand, one month at a time. Generating the next
  month's rent for every active lease is an obvious later job.
- `rent_payments.status` stores only pending / partial / paid, derived from the
  amounts. "Overdue" is computed at read time from the due date rather than
  stored, because a stored flag is wrong the day after it is written. If
  overdue ever needs to be queryable, add a generated column or a view.
- Deleting a user leaves an orphan `organizations` row (no members, so it is
  invisible to everyone). Needs a cleanup trigger before account deletion
  ships.

## Post-MVP (context doc section 8)

- Email ingestion of invoices
- Utility provider integrations (Sofia Water, Electrohold, EVN, Energo-Pro)
- Payment matching against bank transactions
- Stripe subscriptions
- Multi-country support
- Advanced profitability analytics
- Snowflake / dbt analytics layer
