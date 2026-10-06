-- A tenant can be given an account and see their own statement.
--
-- Until now every row in auth.users was a landlord. The signup trigger made
-- that true by construction: it created an organization and an owner
-- membership for whoever appeared, so an account created for a tenant would
-- have arrived holding their own empty organization. And every policy on every
-- business table asks exactly one question - is_org_member(organization_id) -
-- so a user outside the organization sees nothing at all, which is correct for
-- another landlord and useless for the tenant whose rent the rows describe.
--
-- This migration adds the second kind of reader. It is a reader and nothing
-- more: there are no insert, update or delete policies for a tenant anywhere
-- below, so the portal cannot write even if a route forgets to stop it.
--
-- Three decisions are built into the predicates and worth stating, because the
-- SQL alone does not explain them:
--
--   Lease status is deliberately not checked. Access ends when the landlord
--   ends it, by setting tenants.user_id back to null - not when the lease is
--   marked ended. A tenant who has moved out keeps their own history until
--   somebody decides otherwise.
--
--   Bills are scoped by property rather than by what the tenant is charged
--   for, because the landlord asked for every invoice filed against the
--   property. The statement itself stays correct regardless: it reads
--   lease_bill_charges, which filters tenant_chargeable inside the view.
--   The consequence is that bills.notes is readable by the tenant - RLS cannot
--   hide a column - so that field is no longer a private place to write.
--
--   Expenses are scoped the other way, to tenant_chargeable only, because
--   lease_expense_charges filters the same way. Had the policy been wider the
--   tenant would see repair costs; had it been narrower the expenses_due
--   figure in their statement would not match the landlord's.
--
-- organizations gets no tenant policy on purpose. inbox_address lives there,
-- and that is the address inbound invoices arrive at. The cost is that
-- buildStatement() reads an empty organization name for a tenant, which the
-- portal simply does not render.

-- ---------------------------------------------------------------------------
-- tenants.user_id
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column user_id uuid references auth.users (id) on delete set null;

-- on delete set null, not cascade: deleting an account must not delete the
-- person whose name is on the lease.

-- An account is always created fresh for one tenant row and never attached to
-- an existing one, so two tenant rows sharing an account is a bug rather than a
-- situation. Partial, because null means "no account" and there will be many.
create unique index tenants_user_id_key on public.tenants (user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- The signup trigger learns that not every account is a landlord
-- ---------------------------------------------------------------------------

-- The flag is read from raw_app_meta_data rather than raw_user_meta_data
-- because only the service role can write app metadata. A user can rewrite
-- their own user metadata through updateUser, and a tenant who could do that
-- could not retroactively gain an organization - the trigger has already run -
-- but the same flag decides which portal they are shown, and a claim the
-- claimant can edit is not worth checking.
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
  -- their tenants row is attached to, further down this file.
  if coalesce(new.raw_app_meta_data ->> 'account_type', '') = 'tenant' then
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

-- ---------------------------------------------------------------------------
-- Predicates
-- ---------------------------------------------------------------------------

-- Both are security definer for the same reason is_org_member() is: a policy
-- that had to read tenants through the policy on tenants would recurse.

-- The leases this tenant is named on.
create or replace function public.is_tenant_lease(lease_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.leases l
    join public.tenants t
      on  t.id = l.tenant_id
      and t.organization_id = l.organization_id
    where l.id = lease_id
      and t.user_id = auth.uid()
  );
$$;

-- The properties this tenant rents. Wider than a lease on purpose: bills and
-- documents are filed against a property, not against a lease. A null
-- property_id answers false, so an unfiled document stays invisible.
create or replace function public.is_tenant_property(prop_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.leases l
    join public.tenants t
      on  t.id = l.tenant_id
      and t.organization_id = l.organization_id
    where l.property_id = prop_id
      and t.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------

-- Several permissive policies for one action combine with or, so nothing a
-- landlord can see changes. Select only, every one of them.

create policy tenants_select_self on public.tenants
  for select to authenticated
  using (user_id = auth.uid());

create policy leases_select_tenant on public.leases
  for select to authenticated
  using (public.is_tenant_lease(id));

create policy properties_select_tenant on public.properties
  for select to authenticated
  using (public.is_tenant_property(id));

create policy rent_payments_select_tenant on public.rent_payments
  for select to authenticated
  using (public.is_tenant_lease(lease_id));

-- A rejected bill is a mistake, not a charge, so it stays out.
create policy bills_select_tenant on public.bills
  for select to authenticated
  using (public.is_tenant_property(property_id) and status <> 'rejected');

create policy expenses_select_tenant on public.expenses
  for select to authenticated
  using (public.is_tenant_property(property_id) and tenant_chargeable);

create policy documents_select_tenant on public.documents
  for select to authenticated
  using (public.is_tenant_property(property_id));

-- ---------------------------------------------------------------------------
-- The file itself
-- ---------------------------------------------------------------------------

-- The four existing policies compare the first folder of the path against the
-- caller's organizations. A tenant is in no organization, so theirs goes the
-- other way round: through the documents row that owns the path. storage_path
-- is unique, so the join is exact.
--
-- This is the policy that actually decides whether a tenant sees a file:
-- createSignedUrl checks select permission on the object before it signs
-- anything. The route cannot grant what this refuses.
create policy documents_storage_select_tenant on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.documents d
      where d.storage_path = objects.name
        and public.is_tenant_property(d.property_id)
    )
  );

insert into public.schema_migrations (version) values ('0024_tenant_portal')
on conflict (version) do nothing;
