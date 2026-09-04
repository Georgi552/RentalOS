-- Records which migrations have run, so `npm run db:pending` can tell what is
-- left instead of anyone guessing or probing for columns.
--
-- Every migration from here on ends by inserting its own version.

create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;

-- Nobody reads this from the browser. The service role bypasses RLS, which is
-- how the tooling gets at it; leaving no policy keeps it out of the client.
comment on table public.schema_migrations is
  'Applied migration versions. Written by migrations themselves, read by scripts/db-pending.mjs.';

-- Backfill everything up to and including this file. Safe to re-run.
insert into public.schema_migrations (version) values
  ('0001_init'),
  ('0002_financials'),
  ('0003_lease_bill_terms'),
  ('0004_document_limits'),
  ('0005_fix_set_null_fks'),
  ('0006_bills_in_financials'),
  ('0007_tenant_ledger'),
  ('0008_heating_and_breakdown'),
  ('0009_statement_sends'),
  ('0010_schema_migrations')
on conflict (version) do nothing;
