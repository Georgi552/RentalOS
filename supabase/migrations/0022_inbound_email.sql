-- An invoice can arrive by email.
--
-- The landlord forwards the provider's email to an address of their own and the
-- PDF goes down exactly the path an uploaded one does: documents -> extraction
-- -> property matching -> bill, or the review queue when anything is in doubt
-- (context doc section 35).
--
-- Two decisions by the landlord shape this schema:
--
-- 1. The address is readable and editable, not a secret token. Anyone who
--    guesses it can therefore put a document into the account, so the daily cap
--    below is what stops the review queue and Storage from being flooded.
--
-- 2. A sender the landlord has not registered may still send, but such an
--    invoice may never become a bill on its own. That rule is enforced here
--    rather than in the application, because the application is where the
--    previous duplicated rule went wrong (migration 0021).
--
-- SPF and DKIM are deliberately NOT used to decide whether a sender is known:
-- forwarding through Gmail breaks SPF, so the headers would reject exactly the
-- mail this feature exists to accept. The address plus the sender list is the
-- check.

-- ---------------------------------------------------------------------------
-- The organization's inbox address
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column inbox_address text
  -- Lower case, starts with a letter or digit, and only characters that survive
  -- an email local part. A name that could not be routed is not worth storing.
  check (inbox_address ~ '^[a-z0-9][a-z0-9._-]{2,63}$');

-- One organization per address, and the address is what identifies the
-- organization when mail arrives, so this index is load-bearing rather than
-- tidiness.
create unique index organizations_inbox_address_key
  on public.organizations (inbox_address)
  where inbox_address is not null;

comment on column public.organizations.inbox_address is
  'Local part of the address invoices may be forwarded to. Editable by the landlord.';

-- ---------------------------------------------------------------------------
-- Senders whose mail may produce a bill without a person
-- ---------------------------------------------------------------------------

create table public.organization_inbound_senders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Stored lower case: mail addresses are compared case-insensitively in the
  -- domain, and in practice nobody means two different senders by Ivan@ and
  -- ivan@.
  email text not null check (email = lower(email) and email like '%_@_%'),
  note text,
  created_at timestamptz not null default now(),
  constraint organization_inbound_senders_unique unique (organization_id, email),
  constraint organization_inbound_senders_id_org_key unique (id, organization_id)
);

create index organization_inbound_senders_organization_id_idx
  on public.organization_inbound_senders (organization_id);

comment on table public.organization_inbound_senders is
  'Addresses trusted to send invoices. Mail from anyone else is accepted but only for review.';

-- ---------------------------------------------------------------------------
-- What arrived, and what was done with it
-- ---------------------------------------------------------------------------

create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- The provider's Message-ID. Forwarding the same invoice twice must not
  -- produce two documents, and this is the only identifier a mail carries that
  -- is stable across a resend.
  message_id text not null,
  from_address text not null,
  to_address text not null,
  subject text,
  attachment_count integer not null default 0 check (attachment_count >= 0),
  -- Whether the sender was on the list AT THE TIME the mail arrived. Kept as a
  -- fact about the email rather than looked up later: removing a sender from
  -- the list must not retroactively invalidate a bill already written.
  sender_known boolean not null,
  status text not null
    check (status in ('accepted', 'rejected', 'ignored')),
  reason text,
  created_at timestamptz not null default now(),
  constraint inbound_emails_id_org_key unique (id, organization_id),
  constraint inbound_emails_message_unique unique (organization_id, message_id)
);

create index inbound_emails_organization_id_idx
  on public.inbound_emails (organization_id, created_at desc);

comment on table public.inbound_emails is
  'Journal of mail that reached an organization inbox, including what was refused and why.';

-- A document now records the email it came from, when it came from one.
alter table public.documents
  add column inbound_email_id uuid,
  add constraint documents_inbound_email_fkey
    foreign key (inbound_email_id, organization_id)
    references public.inbound_emails (id, organization_id)
    on delete set null (inbound_email_id);

create index documents_inbound_email_id_idx
  on public.documents (inbound_email_id)
  where inbound_email_id is not null;

-- ---------------------------------------------------------------------------
-- The rule: an unknown sender cannot produce a bill on its own
-- ---------------------------------------------------------------------------

-- Refusing status = 'confirmed' outright would not work. The review form writes
-- confirmed bills too (app/(dashboard)/bills/actions.ts), so a blanket refusal
-- would block the landlord from ever confirming a document that arrived from an
-- unknown sender - which is the whole point of sending it to review.
--
-- So the database has to know HOW a bill was written, not only what state it is
-- in. Nothing recorded that before: autoCreateBillFromDocument and the form
-- produced identical rows.
alter table public.bills
  add column written_automatically boolean not null default false;

comment on column public.bills.written_automatically is
  'True when the bill was written by extraction without a person confirming it.';

create or replace function public.bills_auto_needs_known_sender()
returns trigger
language plpgsql
as $$
declare
  from_unknown_sender boolean;
begin
  if not new.written_automatically or new.document_id is null then
    return new;
  end if;

  select ie.sender_known = false
  into from_unknown_sender
  from public.documents d
  join public.inbound_emails ie
    on  ie.id              = d.inbound_email_id
    and ie.organization_id = d.organization_id
  where d.id              = new.document_id
    and d.organization_id = new.organization_id;

  if coalesce(from_unknown_sender, false) then
    raise exception
      'bills_auto_needs_known_sender: this invoice arrived from a sender that is not on the list, so it has to be confirmed by hand';
  end if;

  return new;
end;
$$;

create trigger bills_auto_needs_known_sender_check
  before insert or update of written_automatically, document_id, status
  on public.bills
  for each row execute function public.bills_auto_needs_known_sender();

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

alter table public.organization_inbound_senders enable row level security;
alter table public.inbound_emails enable row level security;

create policy organization_inbound_senders_select_member on public.organization_inbound_senders
  for select to authenticated using (public.is_org_member(organization_id));

create policy organization_inbound_senders_insert_member on public.organization_inbound_senders
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy organization_inbound_senders_update_member on public.organization_inbound_senders
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy organization_inbound_senders_delete_member on public.organization_inbound_senders
  for delete to authenticated using (public.is_org_member(organization_id));

-- The journal is written only by the inbound route, which runs as the service
-- role. A landlord reads it and nothing more: a record of what was refused is
-- worthless if the refused party can edit it.
create policy inbound_emails_select_member on public.inbound_emails
  for select to authenticated using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Give every organization an address
-- ---------------------------------------------------------------------------

-- A readable default derived from the name, falling back to a short id when the
-- name yields nothing usable (Cyrillic names do, which is the common case
-- here). Collisions get the id appended rather than failing the migration.
create or replace function public.default_inbox_address(org_name text, org_id uuid)
returns text
language sql
immutable
as $$
  select case
    when candidate ~ '^[a-z0-9][a-z0-9._-]{2,63}$' then candidate
    else 'imot-' || left(replace(org_id::text, '-', ''), 10)
  end
  from (
    select left(
      regexp_replace(lower(coalesce(org_name, '')), '[^a-z0-9]+', '-', 'g'),
      40
    ) as candidate
  ) c
$$;

update public.organizations o
set inbox_address = case
  when exists (
    select 1 from public.organizations x
    where x.id <> o.id
      and x.inbox_address = public.default_inbox_address(o.name, o.id)
  )
  then 'imot-' || left(replace(o.id::text, '-', ''), 10)
  else public.default_inbox_address(o.name, o.id)
end
where o.inbox_address is null;

-- New organizations get one at signup, so the address exists before the
-- landlord ever opens Settings.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  display_name text;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''));

  insert into public.organizations (name)
  values (display_name)
  returning id into new_org_id;

  update public.organizations
  set inbox_address = public.default_inbox_address(display_name, new_org_id)
  where id = new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

insert into public.schema_migrations (version) values ('0022_inbound_email')
on conflict (version) do nothing;
