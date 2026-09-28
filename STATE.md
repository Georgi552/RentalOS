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
- **Resend** sends statements from `noreply@tedataone.com`; the domain is
  verified. See below.
- Auth emails still go through Supabase's built-in mailer, which is rate
  limited to a few per hour

**Domain `tedataone.com` serves the app.** Registered 11.09.2026 through eNom.
DNS is **at Cloudflare** since 28.09.2026. It was at eNom's own nameservers
(`dns1`-`dns5.name-services.com`) until then, and never at JetHosting - an
earlier version of this file said JetHosting and was wrong. The registrar is
still eNom, reached through a Bulgarian reseller panel whose DNS editor is now
disabled because the zone is elsewhere. The apex A record and the `www` CNAME
point at Vercel, both with Cloudflare proxying **off**.

**Statements reach real tenants.** Verified on 24.09: `tedataone.com` is verified
in Resend and a manual statement to `gm55@abv.bg` came back `sent` with a
provider message id. That address is the one that had failed before, so it is the
same test, not a weaker one.

Three records were added to get there, and nothing else changed. They were
entered at eNom first and moved with the zone to Cloudflare:

| Type | Name | Value |
|---|---|---|
| TXT | `resend._domainkey` | the DKIM public key |
| CNAME | `rsend` | `rsend-euw1.forge.rmta.net` |
| CNAME | `send` | `send.forge.rmta.net` |

Email Routing later added apex `MX` records pointing at `route1/2/3.mx.cloudflare.net`
and an apex SPF `TXT` of `v=spf1 include:_spf.mx.cloudflare.net ~all`.

`STATEMENT_FROM_EMAIL` is `noreply@tedataone.com`. No mailbox exists behind it
and none is needed; the app only sends. Replies are handled by `reply_to`
(`lib/email.ts:48`).

Two earlier claims in this file were wrong and are corrected here. Resend
sending needs **no apex MX and no apex SPF TXT** - it uses CNAMEs on the `rsend`
and `send` subdomains - so the SPF conflict this file warned about does not
exist. And `STATEMENT_FROM_EMAIL` was never blank on Vercel: the variables are
marked Sensitive, so Vercel shows an empty field when you reopen them for
editing. The 12.09 scheduled send proves they were set, because the cron
delivered through Resend.

What the earlier failure actually was: `STATEMENT_FROM_EMAIL` held
`onboarding@resend.dev`, Resend's sandbox sender, which permits only the account
owner's own address as recipient.

`sent` in `statement_sends` only means Resend accepted the message. For this one
the mailbox was checked by hand and the statement had arrived, so the path is
confirmed end to end, including that abv.bg did not treat it as spam.

**Receiving invoices by email works.** Switched on 28.09.2026 through Cloudflare
Email Routing. DNS now lives at Cloudflare (`henrik` and `kelly.ns.cloudflare.com`)
with proxying off on every record, because an orange cloud on the apex breaks
Vercel's certificate.

The path: mail to `<inbox_address>@tedataone.com` hits Cloudflare's MX, a
**catch-all** rule hands it to the `rentalos-inbound-email` Worker, the Worker
parses the MIME and uploads each PDF straight to Supabase Storage with a signed
URL the app issues, then calls `/api/inbound/analyze`. Catch-all rather than a
rule per address, because the local part identifies the organization and the app
answers 404 for one it does not know, which the Worker turns into a bounce.

The Worker holds `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `INBOUND_SECRET` as
wrangler secrets, not in `wrangler.toml`, because this repository is public. It
sets `workers_dev = false`: there is no `fetch` handler, so publishing an HTTP
endpoint would expose something that answers nothing. `APP_URL` is the **www**
host - the apex answers 308, and following a redirect on a POST that carries an
Authorization header is a risk not worth taking.

Verified against production, not by reading the dashboard:

- no header and a wrong secret both give 401; the right secret gives 404 with
  `reject: true` for an inbox that does not exist
- a mail with no attachment was journalled `ignored`, `sender_known: true`
- a forwarded Electrohold invoice uploaded a 257 KB PDF and was recognised as
  already entered, so the bill count stayed at 21

Only `smetki_naemi` is in use. Adding an organization generates an address from
`public.default_inbox_address`, and the owner can rename it in Settings.

Email Routing added apex MX and SPF records. They do not disturb Resend, which
uses only the `rsend` and `send` subdomains - the conflict an earlier version of
this file predicted does not exist.

## Not finished

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
