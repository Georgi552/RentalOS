// Nothing of one landlord's may ever be reachable by another.

import { freshDatabase, asUser, createLandlord } from "./helpers/database.mjs";
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

  section("views");
  // A view without security_invoker runs as its owner and bypasses RLS.
  for (const view of ["lease_monthly_ledger", "property_monthly_financials"]) {
    const { rows } = await db.query(
      `select 'security_invoker=true' = any(c.reloptions) as invoker
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = '${view}'`,
    );
    if (rows[0]?.invoker) ok(`${view} runs as the caller`);
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
