// Boots a throwaway PostgreSQL with the whole schema applied.
//
// Migrations run in filename order, exactly as they do against Supabase, so a
// migration that only works because of something already in the live database
// fails here instead of in production.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

export async function freshDatabase() {
  const db = await new PGlite();

  await db.exec(readFileSync(join(here, "stubs.sql"), "utf8"));

  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(migrationsDir, file), "utf8")
      // pgcrypto is not bundled with PGlite; gen_random_uuid() is core since 13.
      .replace(/create extension if not exists pgcrypto;/, "");
    try {
      await db.exec(sql);
    } catch (cause) {
      throw new Error(`migration ${file} failed: ${cause.message}`);
    }
  }

  // Supabase grants these to `authenticated` by default.
  await db.exec(`
    grant usage on schema public, storage to authenticated;
    grant all on all tables in schema public to authenticated;
    grant all on all tables in schema storage to authenticated;
    grant execute on all functions in schema public, storage to authenticated;
  `);

  return db;
}

// Runs a block as a signed-in landlord, with RLS applied.
export async function asUser(db, userId, work) {
  await db.exec(
    `reset role; delete from auth._current; insert into auth._current values ('${userId}');`,
  );
  await db.exec("set role authenticated;");
  try {
    return await work();
  } finally {
    await db.exec("reset role;");
  }
}

// Creates a landlord. The signup trigger gives them an organization.
export async function createLandlord(db, email) {
  const id = crypto.randomUUID();
  await db.exec(
    `insert into auth.users (id, email) values ('${id}', '${email}');`,
  );
  const organizationId = (
    await db.query(
      `select organization_id as id from public.organization_members where user_id = '${id}'`,
    )
  ).rows[0].id;
  return { id, organizationId };
}
