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
print export · password recovery · invoices by forwarded email · Bulgarian
throughout.

`DECISIONS.md` explains the rules behind the numbers. `FUTURE.md` lists what
was deliberately left out.

## A second deployment target

`workers/inbound-email/` is a Cloudflare Email Worker, not part of the Next.js
app. It receives mail, keeps the PDFs and hands them to `/api/inbound/email` and
`/api/inbound/analyze`. It has its own `package.json` and `tsconfig.json`, and is
excluded from the root `tsconfig` and from eslint, so `npm run build` does NOT
check it. Check it separately:

```bash
cd workers/inbound-email && npm install && npm run typecheck
npx wrangler deploy
npx wrangler secret put INBOUND_SECRET    # same value as the app's
```

Why a Worker rather than a route: receiving mail needs MX records, which Vercel
does not do, and Vercel caps a request body below the 10 MB a document may be.
`DECISIONS.md` has the reasoning.

## Set up and live

- **Supabase** project holds the schema and the landlord's real data
- **Vercel** serves it on `tedataone.com`; `vercel.json` runs
  `/api/cron/statements` daily at 07:00 UTC
- **Resend** sends statements from the verified domain
- Auth emails still go through Supabase's built-in mailer, which is rate
  limited to a few per hour

**Domain `tedataone.com` is connected and working.** Registered 11.09.2026
through eNom, DNS at JetHosting (`NS1/NS2.EU109.JETHOSTING.COM`). It is added in
Vercel, verified in Resend, and `NEXT_PUBLIC_SITE_URL`, `STATEMENT_FROM_EMAIL`
and Supabase's Site URL plus Redirect URLs all point at it.

**Scheduled sending delivers.** The daily cron has been observed mailing real
statements. Every one currently arrives in the owner's own inbox, because no
tenant email addresses have been entered yet — that is missing data, not a
delivery restriction.

## Not finished

**Receiving invoices by email is built but not switched on.** The schema, the
settings screen, both routes and the Worker are in place and tested, but no mail
can arrive until the domain's DNS moves to Cloudflare. Cloudflare Email Service
requires the zone to be on Cloudflare, and onboarding adds MX, SPF and DKIM
records to the root domain.

The order matters and one conflict is waiting:

1. Write down every record currently at JetHosting (A, CNAME, MX, TXT).
2. Add the zone in Cloudflare and recreate all of them **before** changing
   nameservers.
3. Change the nameservers at eNom.
4. Check the site loads and a statement still sends.
5. Only then onboard the domain in Email Routing and point a rule at the Worker.

**The conflict:** Resend already has an SPF record on `tedataone.com` and Email
Routing adds its own. Two SPF records on one name are invalid and break both, so
they have to be merged into a single TXT record, or Resend's sending moved to a
subdomain.

Until then `INBOUND_EMAIL_DOMAIN` and `INBOUND_SECRET` are unset and the settings
screen says so plainly.

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
