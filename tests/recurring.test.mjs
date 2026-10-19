// A bill that repeats monthly. The building fee has no invoice to read, so it
// was typed in by hand every month until one month it was not, and the tenant's
// statement went out without it.

import {
  freshDatabase,
  asUser,
  createLandlord,
  createTenantUser,
} from "./helpers/database.mjs";
import { section, equals, rejects } from "./helpers/assert.mjs";

export const name = "recurring bills";

export async function run() {
  const db = await freshDatabase();
  const owner = await createLandlord(db, "owner@example.com");
  const other = await createLandlord(db, "other@example.com");
  const org = owner.organizationId;

  const property = crypto.randomUUID();
  const tenant = crypto.randomUUID();
  const lease = crypto.randomUUID();
  await db.exec(`
    insert into public.properties (id, organization_id, name, address)
      values ('${property}', '${org}', 'Бели брези', 'а');
    insert into public.tenants (id, organization_id, first_name, last_name)
      values ('${tenant}', '${org}', 'К', 'С');
    insert into public.leases
      (id, organization_id, property_id, tenant_id, start_date, monthly_rent,
       currency, rent_due_day)
      values ('${lease}', '${org}', '${property}', '${tenant}', '2026-05-21', 550,
              'EUR', 20);`);

  const addTemplate = async (lastMonth, { stopped = false } = {}) => {
    const id = crypto.randomUUID();
    await db.exec(`insert into public.recurring_bills
      (id, organization_id, property_id, bill_type, amount, currency,
       tenant_chargeable, paid_by_landlord, last_month, stopped_at)
      values ('${id}', '${org}', '${property}', 'building_fee', 24.00, 'EUR',
              true, true, '${lastMonth}', ${stopped ? "now()" : "null"})`);
    return id;
  };

  const generate = (today) =>
    db.query(`select public.generate_recurring_bills('${today}') as n`).then((r) => r.rows[0].n);

  const billsOf = (template) =>
    db.query(`select to_char(issue_date, 'YYYY-MM-DD') as issued, amount::text, status
              from public.bills where recurring_bill_id = '${template}' order by issue_date`)
      .then((r) => r.rows);

  const feeIn = (month) =>
    db.query(`select bills_building_fee::text as fee from public.lease_monthly_ledger
              where lease_id = '${lease}' and to_char(month, 'YYYY-MM') = '${month}'`)
      .then((r) => r.rows[0]?.fee);

  section("the next month is written on its 1st and charged in that month");
  {
    const template = await addTemplate("2026-10-01");
    equals("nothing is due within the month already written", await generate("2026-10-19"), 0);
    equals("on 01.11 one bill is written", await generate("2026-11-01"), 1);
    const rows = await billsOf(template);
    equals("dated the 1st", rows[0]?.issued, "2026-11-01");
    equals("with the template's amount", rows[0]?.amount, "24.00");
    equals("and confirmed, so it counts", rows[0]?.status, "confirmed");
    equals("the ledger charges it in November", await feeIn("2026-11"), "24.00");
    equals("running again the same month writes nothing", await generate("2026-11-17"), 0);
    await db.exec(`delete from public.recurring_bills where id = '${template}'`);
    equals("deleting the template keeps the bill it wrote",
      (await db.query(`select count(*)::int as n from public.bills
                       where bill_type = 'building_fee' and issue_date = '2026-11-01'`)).rows[0].n,
      1);
    await db.exec(`delete from public.bills where bill_type = 'building_fee'`);
  }

  section("a missed day catches up instead of skipping a month");
  {
    const template = await addTemplate("2026-09-01");
    equals("two months owed, two written", await generate("2026-11-05"), 2);
    equals("October and November",
      (await billsOf(template)).map((r) => r.issued).join(","), "2026-10-01,2026-11-01");
  }

  section("a deleted month stays deleted");
  {
    const template = await addTemplate("2026-10-01");
    await generate("2026-11-01");
    await db.exec(`delete from public.bills where recurring_bill_id = '${template}'`);
    equals("the template does not write November again", await generate("2026-11-20"), 0);
    await generate("2026-12-01");
    equals("but December comes",
      (await billsOf(template)).map((r) => r.issued).join(","), "2026-12-01");
  }

  section("a stopped template writes nothing");
  {
    const template = await addTemplate("2026-10-01", { stopped: true });
    await generate("2027-02-01");
    equals("no bills", (await billsOf(template)).length, 0);
  }

  section("the template obeys the bill rules");
  await rejects(
    db,
    "a bill we do not pay cannot be charged to the tenant",
    `insert into public.recurring_bills
      (organization_id, property_id, bill_type, amount, tenant_chargeable,
       paid_by_landlord, last_month)
      values ('${org}', '${property}', 'building_fee', 24, true, false, '2026-10-01')`,
    "recurring_bills_chargeable_needs_payer",
  );
  await rejects(
    db,
    "last_month is a month, not a day",
    `insert into public.recurring_bills
      (organization_id, property_id, bill_type, amount, tenant_chargeable,
       paid_by_landlord, last_month)
      values ('${org}', '${property}', 'building_fee', 24, true, true, '2026-10-15')`,
    "recurring_bills_last_month_check",
  );

  section("tenancy");
  const foreign = await addTemplate("2026-10-01");
  await asUser(db, other.id, async () => {
    equals("another landlord sees no templates",
      (await db.query("select count(*)::int as n from public.recurring_bills")).rows[0].n, 0);
    equals("and generating writes nothing of ours", await generate("2027-06-01"), 0);
  });
  equals("the template was left where it was",
    (await db.query(`select to_char(last_month, 'YYYY-MM') as m from public.recurring_bills
                     where id = '${foreign}'`)).rows[0].m,
    "2026-10");

  const tenantUser = await createTenantUser(db, "tenant@example.com", tenant);
  await asUser(db, tenantUser.id, async () => {
    equals("a tenant sees no templates",
      (await db.query("select count(*)::int as n from public.recurring_bills")).rows[0].n, 0);
  });
}
