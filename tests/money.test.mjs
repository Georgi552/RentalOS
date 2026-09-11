// The rules that decide what a tenant owes. Each one is here because getting
// it wrong charged somebody the wrong amount, not because it seemed tidy.

import { freshDatabase, createLandlord } from "./helpers/database.mjs";
import { section, ok, fail, equals, rejects, allows } from "./helpers/assert.mjs";

export const name = "money and dates";

export async function run() {
  const db = await freshDatabase();
  const owner = await createLandlord(db, "owner@example.com");
  const org = owner.organizationId;

  const makeLease = async ({ rentDueDay, rent = 550, split = false, start = "2026-04-01" }) => {
    const property = crypto.randomUUID();
    const tenant = crypto.randomUUID();
    const lease = crypto.randomUUID();
    await db.exec(`
      insert into public.properties (id, organization_id, name, address)
        values ('${property}', '${org}', 'П', 'а');
      insert into public.tenants (id, organization_id, first_name, last_name)
        values ('${tenant}', '${org}', 'И', 'П');
      insert into public.leases
        (id, organization_id, property_id, tenant_id, start_date, monthly_rent,
         currency, rent_due_day, split_rent_and_bills)
        values ('${lease}', '${org}', '${property}', '${tenant}', '${start}', ${rent},
                'EUR', ${rentDueDay}, ${split});`);
    return { property, tenant, lease };
  };

  const addBill = (property, { issue = null, from, to, amount, type = "electricity" }) =>
    db.exec(`insert into public.bills
      (organization_id, property_id, bill_type, amount, currency, issue_date,
       period_start, period_end, tenant_chargeable, paid_by_landlord, status)
      values ('${org}', '${property}', '${type}', ${amount}, 'EUR',
              ${issue ? `'${issue}'` : "null"}, '${from}', '${to}', true, true, 'confirmed')`);

  const ledger = (lease) =>
    db.query(`select to_char(month, 'YYYY-MM') as month, rent_due, bills_due,
                     charges, paid, balance, rent_balance, bills_balance, is_due
              from public.lease_monthly_ledger where lease_id = '${lease}' order by month`)
      .then((r) => r.rows);

  section("a bill is charged by the END of its period, not its issue date");
  // Measured against real invoices: issuing late must not push the charge into
  // the next month.
  {
    const { property, lease } = await makeLease({ rentDueDay: 20 });
    await addBill(property, { issue: "2026-07-21", from: "2026-06-14", to: "2026-06-30", amount: 25.78 });
    await addBill(property, { issue: "2026-08-20", from: "2026-07-15", to: "2026-08-13", amount: 34.62 });
    const rows = await ledger(lease);
    equals("period ending 30.06 -> July", rows.find((r) => r.month === "2026-07")?.bills_due, "25.78");
    equals("period ending 13.08 -> August", rows.find((r) => r.month === "2026-08")?.bills_due, "34.62");
  }

  section("a short period is charged in its own cycle");
  {
    const { property, lease } = await makeLease({ rentDueDay: 20 });
    await addBill(property, { from: "2026-05-15", to: "2026-06-13", amount: 30 });
    await addBill(property, { from: "2026-06-14", to: "2026-06-18", amount: 5 });
    const june = (await ledger(lease)).find((r) => r.month === "2026-06");
    equals("a 30-day and a 5-day period, both ended before the 20th", june?.bills_due, "35.00");
  }

  section("overlapping periods are refused");
  {
    const { property } = await makeLease({ rentDueDay: 20 });
    await addBill(property, { from: "2026-06-01", to: "2026-06-15", amount: 10 });
    for (const [from, to, why] of [
      ["2026-06-10", "2026-06-20", "partial overlap"],
      ["2026-06-01", "2026-06-15", "the identical period"],
      ["2026-06-05", "2026-06-08", "one inside the other"],
      ["2026-05-20", "2026-06-30", "one spanning the other"],
    ]) {
      await rejects(
        db,
        why,
        `insert into public.bills (organization_id, property_id, bill_type, amount, currency,
           period_start, period_end, tenant_chargeable, paid_by_landlord, status)
         values ('${org}', '${property}', 'electricity', 9.99, 'EUR', '${from}', '${to}', true, true, 'confirmed')`,
        "bills_overlapping_period",
      );
    }
    await allows(
      db,
      "an adjacent period is fine",
      `insert into public.bills (organization_id, property_id, bill_type, amount, currency,
         period_start, period_end, tenant_chargeable, paid_by_landlord, status)
       values ('${org}', '${property}', 'electricity', 9.99, 'EUR', '2026-06-16', '2026-06-25', true, true, 'confirmed')`,
    );
  }

  section("nothing is owed before its due day");
  {
    const { lease } = await makeLease({ rentDueDay: 28, start: "2026-01-01" });
    const rows = await ledger(lease);
    const last = rows[rows.length - 1];
    // The final month is the current one, whose 28th has usually not arrived.
    if (last.is_due === false) {
      const previous = rows[rows.length - 2];
      equals("an upcoming month shows its charges", last.rent_due, "550.00");
      equals("but does not move the balance", last.balance, previous.balance);
    } else {
      ok("the current month has already fallen due; nothing to assert");
    }
  }

  section("rent and bills kept apart when the lease says so");
  {
    const { property, lease } = await makeLease({ rentDueDay: 1, rent: 550, split: true, start: "2026-06-01" });
    await addBill(property, { from: "2026-05-01", to: "2026-05-31", amount: 70 });
    await addBill(property, { from: "2026-06-01", to: "2026-06-30", amount: 70 });
    // Three months of rent up front, and this month's bill.
    await db.exec(`insert into public.rent_payments
      (organization_id, lease_id, period_month, kind, paid_amount, currency)
      values ('${org}', '${lease}', '2026-06-01', 'rent', 1650, 'EUR'),
             ('${org}', '${lease}', '2026-06-01', 'bills', 70, 'EUR')`);

    const rows = await ledger(lease);
    const june = rows.find((r) => r.month === "2026-06");
    const july = rows.find((r) => r.month === "2026-07");
    equals("advance leaves credit on rent", june?.rent_balance, "1100.00");
    equals("bills are square", june?.bills_balance, "0.00");
    equals("the advance melts by one month", july?.rent_balance, "550.00");
    equals("an unpaid bill still shows as owed", july?.bills_balance, "-70.00");

    const adds = rows.every(
      (r) => Math.abs(Number(r.rent_balance) + Number(r.bills_balance) - Number(r.balance)) < 0.001,
    );
    if (adds) ok("the two balances always sum to the combined one");
    else fail("balances do not add up");

    // The bug this replaced: one row per month, so recording a bills payment
    // wiped the rent.
    await db.exec(`insert into public.rent_payments
      (organization_id, lease_id, period_month, kind, paid_amount, currency)
      values ('${org}', '${lease}', '2026-06-01', 'bills', 95, 'EUR')
      on conflict (lease_id, period_month, kind) do update set paid_amount = excluded.paid_amount`);
    const after = (await ledger(lease)).find((r) => r.month === "2026-06");
    equals("correcting the bills leaves the rent alone", after?.rent_balance, "1100.00");

    await rejects(
      db,
      "a split lease refuses an untagged payment",
      `insert into public.rent_payments (organization_id, lease_id, period_month, kind, paid_amount, currency)
       values ('${org}', '${lease}', '2026-09-01', 'combined', 100, 'EUR')`,
      "rent_payments_kind_required",
    );
  }

  section("a plain lease still behaves as one balance");
  {
    const { lease } = await makeLease({ rentDueDay: 1, rent: 500, start: "2026-06-01" });
    await db.exec(`insert into public.rent_payments
      (organization_id, lease_id, period_month, kind, paid_amount, currency)
      values ('${org}', '${lease}', '2026-06-01', 'combined', 500, 'EUR')`);
    equals(
      "paid in full leaves nothing owed",
      (await ledger(lease)).find((r) => r.month === "2026-06")?.balance,
      "0.00",
    );
    await rejects(
      db,
      "and refuses a split payment",
      `insert into public.rent_payments (organization_id, lease_id, period_month, kind, paid_amount, currency)
       values ('${org}', '${lease}', '2026-07-01', 'rent', 100, 'EUR')`,
      "rent_payments_kind_unexpected",
    );
  }

  section("a bill the tenant pays directly is never charged on");
  {
    const { property, lease } = await makeLease({ rentDueDay: 1, start: "2026-06-01" });
    await db.exec(`insert into public.bills
      (organization_id, property_id, bill_type, amount, currency, period_start, period_end,
       tenant_chargeable, paid_by_landlord, status)
      values ('${org}', '${property}', 'water', 18.30, 'EUR', '2026-06-01', '2026-06-30', false, false, 'confirmed')`);
    equals(
      "it is tracked but adds nothing to the tenant's charges",
      (await ledger(lease)).find((r) => r.month === "2026-07")?.bills_due,
      "0.00",
    );
  }
}
