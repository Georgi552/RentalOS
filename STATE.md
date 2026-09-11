# Where the project stands

Written for whoever picks this up next. Facts as of the last commit; check
them rather than trusting them, since some will drift.

## What it is

RentalOS: rental administration for a private landlord with 1–20 properties.
The point is not another property-management system — it is removing the
monthly job of collecting utility invoices, working out what each tenant owes,
and sending them a statement.

The full product brief lives in `RentalOS_AI_Project_Context.md`, which is
**deliberately not in this repository**: it contains pricing and market
strategy and the repo is public. Ask the owner for it. `CLAUDE.md` imports it
when present.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind v4 ·
Supabase (PostgreSQL, Auth, Storage) · Vercel · Resend for email.

No AI at runtime. Invoices are read with `unpdf` and per-provider patterns.

Note: Next 16 renamed middleware to `proxy.ts`, and `cookies()` is async.

## Working on it

```bash
npm install
cp .env.example .env.local     # fill from the Supabase dashboard
npm run dev
npm test                       # schema and money rules, no network needed
npm run db:pending             # what the database still needs
npm run build                  # includes type checking
npm run lint
```

`npm test` applies every migration to an in-process PostgreSQL and asserts the
rules in `DECISIONS.md`. Run it before handing any migration over — a migration
that only works against the current live database fails here instead of in
production.

## Migrations

`supabase/migrations/`, applied by hand through the Supabase SQL editor.
`schema_migrations` records what has run.

```
npm run db:pending      # writes the outstanding ones to supabase/PENDING.sql
```

Open that file, copy it, paste into SQL Editor, Run, then run the command again
to confirm. Every migration from 0010 on records its own version.

## Built

Properties · tenants · leases with per-bill-type terms · rent payments ·
expenses · documents in private Storage · bills · PDF reading for Електрохолд,
Софийска вода and Топлофикация София · deterministic property matching ·
per-property dashboard · tenant statements by hand or on a schedule · CSV and
print export · password recovery · Bulgarian throughout.

`DECISIONS.md` explains the rules behind the numbers. `FUTURE.md` lists what
was deliberately left out.

## Set up and live

- **Supabase** project holds the schema and the landlord's real data
- **Vercel** serves it; `vercel.json` runs `/api/cron/statements` daily at 07:00 UTC
- **Resend** sends statements
- Auth emails still go through Supabase's built-in mailer, which is rate
  limited to a few per hour

## Not finished

**Statements cannot reach real tenants yet.** `STATEMENT_FROM_EMAIL` is
`onboarding@resend.dev`, which only delivers to the account owner. A domain
must be verified in Resend first. This is the single thing standing between the
app and being usable.

**Domain `tedataone.com` is bought but not connected.** Registered 11.09.2026
through eNom, DNS at JetHosting (`NS1/NS2.EU109.JETHOSTING.COM`). Nothing
points anywhere yet. Connecting it means: add it in Vercel, verify it in
Resend, then update `NEXT_PUBLIC_SITE_URL` and `STATEMENT_FROM_EMAIL` on Vercel
and the Site URL plus Redirect URLs in Supabase. Missing the last two breaks
sign-in.

**Automatic statement sending is untested end to end.** The cron route
authenticates and the schedule is configured, but no scheduled run has been
observed delivering mail.

**Email confirmation is switched off** in Supabase so signup is immediate. Turn
it on before real users.

**No automated tests above the database.** `npm test` covers the schema and the
money rules. Server actions, forms and the invoice parsers are verified by
running them against the real project during development, not in CI.

## Things that will bite

- **Money**: read `DECISIONS.md` first. Every rule there was a bug.
- **Sample invoices** live in `samples/`, gitignored — they carry real personal
  data. The parsers were built against them; without them the parser tests
  cannot run.
- **This repository is public.** No secrets are committed and `.env*` is
  ignored, but check before adding anything.
- **Node**: the owner's machine runs Node 23, which is not an LTS line and
  raises engine warnings. Vercel builds on 22.
