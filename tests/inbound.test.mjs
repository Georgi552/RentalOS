// An invoice that arrives by email is still untrusted input.
//
// The rule these assert is the one the landlord asked to be enforced by the
// database rather than the application: mail from a sender who is not on the
// list may be accepted, but it can never become a bill on its own.

import { freshDatabase, asUser, createLandlord } from "./helpers/database.mjs";
import { section, ok, fail, equals, rejects, allows } from "./helpers/assert.mjs";

export const name = "inbound email";

export async function run() {
  const db = await freshDatabase();
  const ana = await createLandlord(db, "ana@example.com");
  const boris = await createLandlord(db, "boris@example.com");

  section("every organization gets an address");
  {
    const { rows } = await db.query(`
      select inbox_address from public.organizations order by inbox_address`);
    const missing = rows.filter((row) => !row.inbox_address);
    if (missing.length === 0) ok(`all ${rows.length} organizations have one`);
    else fail(`${missing.length} organizations have no inbox address`);

    const pattern = /^[a-z0-9][a-z0-9._-]{2,63}$/;
    const invalid = rows.filter((row) => !pattern.test(row.inbox_address ?? ""));
    if (invalid.length === 0) ok("and every one is routable");
    else fail("an address would not route", invalid.map((r) => r.inbox_address).join(", "));

    equals(
      "no two organizations share one",
      (await db.query("select count(distinct inbox_address)::int as n from public.organizations")).rows[0].n,
      rows.length,
    );
  }

  section("an address that could not be routed is refused");
  await rejects(
    db,
    "upper case",
    `update public.organizations set inbox_address = 'Ivan' where id = '${ana.organizationId}'`,
    "organizations_inbox_address_check",
  );
  await rejects(
    db,
    "an at sign",
    `update public.organizations set inbox_address = 'ivan@x' where id = '${ana.organizationId}'`,
    "organizations_inbox_address_check",
  );
  await rejects(
    db,
    "too short",
    `update public.organizations set inbox_address = 'ab' where id = '${ana.organizationId}'`,
    "organizations_inbox_address_check",
  );
  await allows(
    db,
    "a plain readable one is fine",
    `update public.organizations set inbox_address = 'ana-imoti' where id = '${ana.organizationId}'`,
  );
  await rejects(
    db,
    "and the same one twice is not",
    `update public.organizations set inbox_address = 'ana-imoti' where id = '${boris.organizationId}'`,
    "organizations_inbox_address_key",
  );

  section("the same email is only taken once");
  const firstEmail = crypto.randomUUID();
  await db.exec(`
    insert into public.inbound_emails
      (id, organization_id, message_id, from_address, to_address, sender_known, status)
    values ('${firstEmail}', '${ana.organizationId}', '<inv-1@electrohold.bg>',
            'ana@example.com', 'ana-imoti@in.tedataone.com', true, 'accepted')`);

  await rejects(
    db,
    "forwarding it twice does not journal it twice",
    `insert into public.inbound_emails
       (organization_id, message_id, from_address, to_address, sender_known, status)
     values ('${ana.organizationId}', '<inv-1@electrohold.bg>',
             'ana@example.com', 'ana-imoti@in.tedataone.com', true, 'accepted')`,
    "inbound_emails_message_unique",
  );

  await allows(
    db,
    "but another organization may receive the same message id",
    `insert into public.inbound_emails
       (organization_id, message_id, from_address, to_address, sender_known, status)
     values ('${boris.organizationId}', '<inv-1@electrohold.bg>',
             'boris@example.com', 'boris@in.tedataone.com', false, 'accepted')`,
  );

  section("a bill from an unknown sender needs a person");
  // Two documents from two emails, identical but for who sent them.
  const unknownEmail = crypto.randomUUID();
  const knownDoc = crypto.randomUUID();
  const unknownDoc = crypto.randomUUID();
  const property = crypto.randomUUID();

  await db.exec(`
    insert into public.inbound_emails
      (id, organization_id, message_id, from_address, to_address, sender_known, status)
    values ('${unknownEmail}', '${ana.organizationId}', '<inv-2@unknown.example>',
            'stranger@example.com', 'ana-imoti@in.tedataone.com', false, 'accepted');

    insert into public.properties (id, organization_id, name, address)
      values ('${property}', '${ana.organizationId}', 'Апартамент', 'ул. Витоша 1');

    insert into public.documents (id, organization_id, inbound_email_id, storage_path, filename)
      values ('${knownDoc}', '${ana.organizationId}', '${firstEmail}', 'a/known.pdf', 'known.pdf');

    insert into public.documents (id, organization_id, inbound_email_id, storage_path, filename)
      values ('${unknownDoc}', '${ana.organizationId}', '${unknownEmail}', 'a/unknown.pdf', 'unknown.pdf');`);

  const insertBill = (documentId, automatic, invoiceNumber) => `
    insert into public.bills
      (organization_id, property_id, document_id, provider, bill_type, invoice_number,
       issue_date, amount, currency, status, written_automatically)
    values ('${ana.organizationId}', '${property}', '${documentId}', 'Електрохолд',
            'electricity', '${invoiceNumber}', '2026-09-10', 43.01, 'EUR', 'confirmed', ${automatic})`;

  await rejects(
    db,
    "written by extraction from an unknown sender is refused",
    insertBill(unknownDoc, true, "0001"),
    "bills_auto_needs_known_sender",
  );

  await allows(
    db,
    "but the landlord may confirm the very same document by hand",
    insertBill(unknownDoc, false, "0002"),
  );

  await allows(
    db,
    "and a known sender needs nobody",
    insertBill(knownDoc, true, "0003"),
  );

  // The rule has to hold on update too, or a bill could be inserted as manual
  // and then flipped.
  await rejects(
    db,
    "and it cannot be flipped to automatic afterwards",
    `update public.bills set written_automatically = true
     where organization_id = '${ana.organizationId}' and invoice_number = '0002'`,
    "bills_auto_needs_known_sender",
  );

  section("an uploaded bill is unaffected");
  await allows(
    db,
    "no inbound email means no sender to check",
    `insert into public.bills
       (organization_id, property_id, provider, bill_type, invoice_number,
        issue_date, amount, currency, status, written_automatically)
     values ('${ana.organizationId}', '${property}', 'Електрохолд', 'electricity',
             '0004', '2026-09-10', 12.00, 'EUR', 'confirmed', true)`,
  );

  section("the journal and the sender list are private");
  await asUser(db, boris.id, async () => {
    equals(
      "another landlord sees none of the mail",
      (await db.query(
        `select count(*)::int as n from public.inbound_emails
         where organization_id = '${ana.organizationId}'`,
      )).rows[0].n,
      0,
    );

    await db.exec(`insert into public.organization_inbound_senders (organization_id, email)
      values ('${boris.organizationId}', 'boris@example.com')`);

    equals(
      "and cannot read the other's sender list",
      (await db.query(
        `select count(*)::int as n from public.organization_inbound_senders
         where organization_id = '${ana.organizationId}'`,
      )).rows[0].n,
      0,
    );

    await rejects(
      db,
      "nor add a sender to it",
      `insert into public.organization_inbound_senders (organization_id, email)
       values ('${ana.organizationId}', 'stranger@example.com')`,
      "row-level security",
    );
  });

  section("the journal is not writable from the client");
  // There is no delete or update policy, so RLS does not raise - it simply finds
  // no rows to act on. The assertion is therefore that nothing was touched, not
  // that an error came back.
  await asUser(db, ana.id, async () => {
    equals(
      "a landlord cannot erase a refusal",
      (await db.query(
        `delete from public.inbound_emails
         where organization_id = '${ana.organizationId}' returning id`,
      )).rows.length,
      0,
    );
    equals(
      "nor rewrite one",
      (await db.query(
        `update public.inbound_emails set status = 'accepted', reason = null
         where organization_id = '${ana.organizationId}' returning id`,
      )).rows.length,
      0,
    );
    await rejects(
      db,
      "nor add one by hand",
      `insert into public.inbound_emails
         (organization_id, message_id, from_address, to_address, sender_known, status)
       values ('${ana.organizationId}', '<forged@example>', 'x@example.com',
               'ana-imoti@in.tedataone.com', true, 'accepted')`,
      "row-level security",
    );
  });

  // And the rows really are still there, which is what the two counts above
  // would fail to prove on their own.
  equals(
    "the journal survived",
    (await db.query(
      `select count(*)::int as n from public.inbound_emails
       where organization_id = '${ana.organizationId}'`,
    )).rows[0].n,
    2,
  );
}
