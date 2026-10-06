-- handle_new_user has to read account_type where it actually arrives.
--
-- Migration 0024 read the flag from raw_app_meta_data, on the reasoning that
-- only the service role can write app metadata and so the claim could not be
-- forged. The reasoning was sound and the field was wrong: GoTrue's admin
-- createUser inserts the auth.users row first and applies the caller's app
-- metadata in a second statement, so an AFTER INSERT trigger sees only
-- {"provider":"email","providers":["email"]} there. The first tenant account
-- created in production therefore took the landlord path and arrived holding an
-- organization of its own.
--
-- raw_user_meta_data, by contrast, is part of the insert - proved by the same
-- account, whose profiles row was named from raw_user_meta_data ->> 'full_name'
-- in the very same trigger call that failed to see account_type.
--
-- Both are read now, user metadata first. User metadata is writable by the user
-- themselves, which costs nothing here: the trigger runs once, at insert, and
-- nothing else in the schema or the app reads account_type afterwards. What a
-- user must not be able to forge is must_change_password, and that stays in app
-- metadata, where it is only ever read after the insert has long finished.
--
-- The test harness inserted raw_app_meta_data directly in one statement, which
-- is why this passed in tests and failed in production. tests/helpers now create
-- the account the way GoTrue does.

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

  -- A tenant belongs to no organization. Their reach is decided by the lease
  -- their tenants row is attached to (migration 0024).
  if coalesce(
       nullif(new.raw_user_meta_data ->> 'account_type', ''),
       nullif(new.raw_app_meta_data  ->> 'account_type', ''),
       ''
     ) = 'tenant' then
    return new;
  end if;

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

insert into public.schema_migrations (version) values ('0025_tenant_account_type')
on conflict (version) do nothing;
