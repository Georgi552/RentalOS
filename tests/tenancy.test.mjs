// Nothing of one landlord's may ever be reachable by another.

import {
  freshDatabase,
  asUser,
  createLandlord,
  createTenantUser,
} from "./helpers/database.mjs";
import { section, ok, fail, equals, rejects } from "./helpers/assert.mjs";

export const name = "tenancy isolation";

export async function run() {
  const db = await freshDatabase();
  const ana = await createLandlord(db, "ana@example.com");
  const boris = await createLandlord(db, "boris@example.com");

  section("signup");
  equals(
    "one organization per landlord",
    (await db.query("select count(*)::int as n from public.organizations")).rows[0].n,
    2,
  );

  const property = crypto.randomUUID();
  const tenant = crypto.randomUUID();

  await asUser(db, ana.id, async () => {
    await db.exec(`insert into public.properties (id, organization_id, name, address)
      values ('${property}', '${ana.organizationId}', 'Апартамент', 'ул. Витоша 1')`);
    await db.exec(`insert into public.tenants (id, organization_id, first_name, last_name)
      values ('${tenant}', '${ana.organizationId}', 'Иван', 'Петров')`);
  });

  section("row level security");
  await asUser(db, boris.id, async () => {
    equals(
      "another landlord sees no properties",
      (await db.query("select count(*)::int as n from public.properties")).rows[0].n,
      0,
    );
    equals(
      "and cannot update what they cannot see",
      (await db.query("update public.properties set name = 'taken' returning id")).rows.length,
      0,
    );
    await rejects(
      db,
      "cannot insert into another organization",
      `insert into public.properties (organization_id, name, address)
       values ('${ana.organizationId}', 'taken', 'x')`,
      "row-level security",
    );
  });

  section("composite foreign keys");
  // The attack these defend against: a landlord using their own organization
  // id but pointing at somebody else's row.
  await asUser(db, boris.id, async () => {
    const ownTenant = crypto.randomUUID();
    await db.exec(`insert into public.tenants (id, organization_id, first_name, last_name)
      values ('${ownTenant}', '${boris.organizationId}', 'Мария', 'Иванова')`);

    await rejects(
      db,
      "a lease cannot point at another organization's property",
      `insert into public.leases (organization_id, property_id, tenant_id, start_date, monthly_rent)
       values ('${boris.organizationId}', '${property}', '${ownTenant}', '2026-01-01', 500)`,
      "leases_property_fkey",
    );
    await rejects(
      db,
      "a bill cannot point at another organization's property",
      `insert into public.bills (organization_id, property_id, bill_type, amount)
       values ('${boris.organizationId}', '${property}', 'water', 10)`,
      "bills_property_fkey",
    );
    await rejects(
      db,
      "an expense cannot either",
      `insert into public.expenses (organization_id, property_id, category, amount, expense_date)
       values ('${boris.organizationId}', '${property}', 'repair', 10, '2026-01-01')`,
      "expenses_property_fkey",
    );
  });

  section("bill terms");
  // Every bill type is answered explicitly, and "not charged" is one of the
  // three answers rather than a missing row (migration 0023). The constraint is
  // what keeps a half-answered term - charged to nobody, yet collected somehow -
  // out of the table.
  await asUser(db, ana.id, async () => {
    const lease = crypto.randomUUID();
    await db.exec(`insert into public.leases (id, organization_id, property_id, tenant_id, start_date, monthly_rent)
      values ('${lease}', '${ana.organizationId}', '${property}', '${tenant}', '2026-01-01', 500)`);

    const term = (billType, payer, collection) =>
      `insert into public.lease_bill_terms (organization_id, lease_id, bill_type, payer, collection)
       values ('${ana.organizationId}', '${lease}', '${billType}', '${payer}', '${collection}')`;

    await db.exec(term("heating", "not_charged", "not_applicable"));
    equals(
      "a bill type can be declared not charged",
      (
        await db.query(
          `select count(*)::int as n from public.lease_bill_terms
           where lease_id = '${lease}' and payer = 'not_charged'`,
        )
      ).rows[0].n,
      1,
    );

    await rejects(
      db,
      "not charged cannot also be collected",
      term("water", "not_charged", "via_rent"),
      "lease_bill_terms_collection_matches_payer",
    );
    await rejects(
      db,
      "a bill we pay cannot be collected either",
      term("water", "landlord", "via_rent"),
      "lease_bill_terms_collection_matches_payer",
    );
    // Which of the two checks fires is not asserted: both forbid an unknown
    // payer, and PostgreSQL does not promise an evaluation order.
    await rejects(
      db,
      "and no fourth payer exists",
      term("water", "nobody", "not_applicable"),
      "violates check constraint",
    );
  });

  section("tenant portal");
  // A tenant is the second kind of reader. These assertions are the whole
  // guarantee: everything of their own, nothing of anybody else's, and no way
  // to write. Two tenants of the SAME landlord are used on purpose - the
  // landlord-against-landlord case is already covered above, and the harder
  // question is whether one tenant can reach the other's rows inside one
  // organization, where every row shares an organization_id.
  const flat = crypto.randomUUID();
  const otherFlat = crypto.randomUUID();
  const ivan = crypto.randomUUID();
  const maria = crypto.randomUUID();
  const ivanLease = crypto.randomUUID();
  const mariaLease = crypto.randomUUID();
  const ownBill = crypto.randomUUID();
  const otherBill = crypto.randomUUID();
  const rejected = crypto.randomUUID();
  const ownDoc = crypto.randomUUID();
  const otherDoc = crypto.randomUUID();
  const unfiledDoc = crypto.randomUUID();
  const ownPath = `${ana.organizationId}/${ownDoc}/own.pdf`;
  const otherPath = `${ana.organizationId}/${otherDoc}/other.pdf`;

  await asUser(db, ana.id, async () => {
    await db.exec(`
      insert into public.properties (id, organization_id, name, address) values
        ('${flat}', '${ana.organizationId}', 'Бели брези', 'ул. Бели брези 5'),
        ('${otherFlat}', '${ana.organizationId}', 'Люлин', 'ул. Люлин 9');

      insert into public.tenants (id, organization_id, first_name, last_name) values
        ('${ivan}', '${ana.organizationId}', 'Иван', 'Георгиев'),
        ('${maria}', '${ana.organizationId}', 'Мария', 'Стоянова');

      insert into public.leases (id, organization_id, property_id, tenant_id, start_date, monthly_rent) values
        ('${ivanLease}', '${ana.organizationId}', '${flat}', '${ivan}', '2026-01-01', 600),
        ('${mariaLease}', '${ana.organizationId}', '${otherFlat}', '${maria}', '2026-01-01', 700);

      insert into public.rent_payments (organization_id, lease_id, period_month, paid_amount, kind) values
        ('${ana.organizationId}', '${ivanLease}', '2026-01-01', 600, 'combined'),
        ('${ana.organizationId}', '${mariaLease}', '2026-01-01', 700, 'combined');

      insert into public.documents (id, organization_id, property_id, storage_path, filename) values
        ('${ownDoc}', '${ana.organizationId}', '${flat}', '${ownPath}', 'own.pdf'),
        ('${otherDoc}', '${ana.organizationId}', '${otherFlat}', '${otherPath}', 'other.pdf'),
        ('${unfiledDoc}', '${ana.organizationId}', null, '${ana.organizationId}/${unfiledDoc}/x.pdf', 'x.pdf');

      insert into public.bills (id, organization_id, property_id, document_id, bill_type, amount, status, tenant_chargeable) values
        ('${ownBill}', '${ana.organizationId}', '${flat}', '${ownDoc}', 'electricity', 42.00, 'confirmed', true),
        ('${otherBill}', '${ana.organizationId}', '${otherFlat}', '${otherDoc}', 'water', 19.00, 'confirmed', true),
        ('${rejected}', '${ana.organizationId}', '${flat}', null, 'heating', 88.00, 'rejected', true);

      insert into public.expenses (organization_id, property_id, category, amount, expense_date, tenant_chargeable) values
        ('${ana.organizationId}', '${flat}', 'other', 10.00, '2026-01-10', true),
        ('${ana.organizationId}', '${flat}', 'repair', 300.00, '2026-01-10', false);

      insert into storage.objects (bucket_id, name) values
        ('documents', '${ownPath}'),
        ('documents', '${otherPath}');
    `);
  });

  const ivanUser = await createTenantUser(db, "ivan@example.com", ivan);

  // The whole point of reusing lease_monthly_ledger rather than writing a
  // second query for the portal: the tenant's figure cannot drift from the
  // landlord's, because it is the same figure. Read it as the landlord first so
  // the comparison below has something to be equal to.
  const landlordCharges = await asUser(db, ana.id, async () =>
    (
      await db.query(
        `select sum(charges)::text as n from public.lease_monthly_ledger
         where lease_id = '${ivanLease}'`,
      )
    ).rows[0].n,
  );

  equals(
    "a tenant account gets no organization",
    (
      await db.query(
        `select count(*)::int as n from public.organization_members where user_id = '${ivanUser.id}'`,
      )
    ).rows[0].n,
    0,
  );
  equals(
    "and no organization is created for it",
    (await db.query("select count(*)::int as n from public.organizations")).rows[0].n,
    2,
  );
  equals(
    "but it still gets a profile",
    (
      await db.query(
        `select count(*)::int as n from public.profiles where id = '${ivanUser.id}'`,
      )
    ).rows[0].n,
    1,
  );

  // The flag is read from either place. user_metadata is where GoTrue actually
  // puts it at insert time and is therefore what the app sets; app_metadata is
  // kept as a second carrier so a change in that behaviour cannot silently turn
  // tenants back into landlords (migration 0025).
  const appMetaOnly = crypto.randomUUID();
  await db.exec(
    `insert into auth.users (id, email, raw_app_meta_data)
     values ('${appMetaOnly}', 'app-meta@example.com', '{"account_type": "tenant"}'::jsonb)`,
  );
  equals(
    "account_type in app metadata also means no organization",
    (
      await db.query(
        `select count(*)::int as n from public.organization_members where user_id = '${appMetaOnly}'`,
      )
    ).rows[0].n,
    0,
  );

  // The other direction matters just as much: a landlord signing up must still
  // get an organization, and this is the trigger that was rewritten twice.
  const plain = crypto.randomUUID();
  await db.exec(
    `insert into auth.users (id, email) values ('${plain}', 'plain@example.com')`,
  );
  equals(
    "an account with no account_type is still a landlord",
    (
      await db.query(
        `select count(*)::int as n from public.organization_members
         where user_id = '${plain}' and role = 'owner'`,
      )
    ).rows[0].n,
    1,
  );

  const counts = async (sql) => (await db.query(sql)).rows[0].n;

  await asUser(db, ivanUser.id, async () => {
    equals(
      "a tenant sees only their own tenants row",
      await counts("select count(*)::int as n from public.tenants"),
      1,
    );
    equals(
      "only their own lease",
      await counts("select count(*)::int as n from public.leases"),
      1,
    );
    equals(
      "only their own property",
      await counts("select count(*)::int as n from public.properties"),
      1,
    );
    equals(
      "only their own payments",
      await counts("select count(*)::int as n from public.rent_payments"),
      1,
    );
    equals(
      "only their own months in the ledger",
      await counts(
        `select count(*)::int as n from public.lease_monthly_ledger where lease_id <> '${ivanLease}'`,
      ),
      0,
    );
    // The ledger runs a month per month from the lease start, so the count is
    // whatever today makes it. What matters is that exactly one lease is in
    // there and the figures arrive.
    equals(
      "and exactly one lease is in there",
      await counts(
        "select count(distinct lease_id)::int as n from public.lease_monthly_ledger",
      ),
      1,
    );
    equals(
      "with the same total the landlord sees",
      (
        await db.query(
          `select sum(charges)::text as n from public.lease_monthly_ledger
           where lease_id = '${ivanLease}'`,
        )
      ).rows[0].n,
      landlordCharges,
    );

    // Every invoice for the property, which is what the landlord asked for -
    // but not the rejected one, and not another property's.
    equals(
      "every bill for their property",
      await counts("select count(*)::int as n from public.bills"),
      1,
    );
    equals(
      "a rejected bill stays hidden",
      await counts(
        `select count(*)::int as n from public.bills where id = '${rejected}'`,
      ),
      0,
    );
    equals(
      "a chargeable expense is visible",
      await counts("select count(*)::int as n from public.expenses"),
      1,
    );
    equals(
      "their own documents",
      await counts("select count(*)::int as n from public.documents"),
      1,
    );
    equals(
      "a document filed against no property stays hidden",
      await counts(
        `select count(*)::int as n from public.documents where id = '${unfiledDoc}'`,
      ),
      0,
    );
    equals(
      "their own file in storage",
      await counts(
        `select count(*)::int as n from storage.objects where name = '${ownPath}'`,
      ),
      1,
    );
    equals(
      "and not another property's file",
      await counts(
        `select count(*)::int as n from storage.objects where name = '${otherPath}'`,
      ),
      0,
    );

    // inbox_address lives on organizations. A tenant who could read it could
    // post invoices into the landlord's inbox.
    equals(
      "a tenant cannot read the organization at all",
      await counts("select count(*)::int as n from public.organizations"),
      0,
    );

    equals(
      "and cannot change a bill they can see",
      (await db.query("update public.bills set amount = 1 returning id")).rows.length,
      0,
    );
    equals(
      "nor delete it",
      (await db.query("delete from public.bills returning id")).rows.length,
      0,
    );
    equals(
      "nor record a payment",
      (await db.query("update public.rent_payments set paid_amount = 0 returning lease_id")).rows
        .length,
      0,
    );
    await rejects(
      db,
      "nor file a bill of their own",
      `insert into public.bills (organization_id, property_id, bill_type, amount)
       values ('${ana.organizationId}', '${flat}', 'water', 1)`,
      "row-level security",
    );
    await rejects(
      db,
      "nor attach their account to a second tenant",
      `insert into public.tenants (organization_id, first_name, last_name, user_id)
       values ('${ana.organizationId}', 'X', 'Y', '${ivanUser.id}')`,
      "row-level security",
    );
  });

  // A tenant of the same landlord, so the only thing keeping them apart is the
  // predicate - not the organization.
  const mariaUser = await createTenantUser(db, "maria@example.com", maria);
  await asUser(db, mariaUser.id, async () => {
    equals(
      "another tenant of the same landlord sees their own lease",
      await counts(
        `select count(*)::int as n from public.leases where id = '${mariaLease}'`,
      ),
      1,
    );
    equals(
      "and nothing of the first tenant's",
      await counts(
        `select count(*)::int as n from public.leases where id = '${ivanLease}'`,
      ),
      0,
    );
    equals(
      "nor their bills",
      await counts(
        `select count(*)::int as n from public.bills where id = '${ownBill}'`,
      ),
      0,
    );
    equals(
      "nor their files",
      await counts(
        `select count(*)::int as n from storage.objects where name = '${ownPath}'`,
      ),
      0,
    );
  });

  // Revoking is a single write: user_id back to null. Everything the tenant
  // could reach went through it, so one statement ends all of it.
  await db.exec(`update public.tenants set user_id = null where id = '${ivan}'`);
  await asUser(db, ivanUser.id, async () => {
    equals(
      "a revoked tenant sees no lease",
      await counts("select count(*)::int as n from public.leases"),
      0,
    );
    equals(
      "no bills",
      await counts("select count(*)::int as n from public.bills"),
      0,
    );
    equals(
      "no documents",
      await counts("select count(*)::int as n from public.documents"),
      0,
    );
    equals(
      "no files",
      await counts("select count(*)::int as n from storage.objects"),
      0,
    );
    equals(
      "and not even their own tenants row",
      await counts("select count(*)::int as n from public.tenants"),
      0,
    );
  });

  // The landlord is untouched by any of the above.
  await asUser(db, ana.id, async () => {
    equals(
      "the landlord still sees every bill",
      await counts("select count(*)::int as n from public.bills"),
      3,
    );
    equals(
      "and every document",
      await counts("select count(*)::int as n from public.documents"),
      3,
    );
  });

  section("views");
  // A view without security_invoker runs as its owner and bypasses RLS. Every
  // view is enumerated rather than listed by hand, so a new one is covered the
  // moment it is created instead of being silently unchecked.
  const { rows: views } = await db.query(`
    select c.relname as view,
           'security_invoker=true' = any(c.reloptions) as invoker
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
    order by c.relname`);

  if (views.length === 0) fail("no views found — the check is not looking at anything");
  for (const { view, invoker } of views) {
    if (invoker) ok(`${view} runs as the caller`);
    else fail(`${view} is NOT security_invoker`);
  }

  section("every table is protected");
  const { rows: unguarded } = await db.query(`
    select t.tablename
    from pg_tables t
    where t.schemaname = 'public'
      and not exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relname = t.tablename and n.nspname = 'public' and c.relrowsecurity
      )`);
  if (unguarded.length === 0) ok("row level security is on for every table");
  else fail("tables without RLS", unguarded.map((r) => r.tablename).join(", "));
}
