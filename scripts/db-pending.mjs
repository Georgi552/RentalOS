#!/usr/bin/env node
// Collects the migrations this database has not run yet into one file, so
// applying them is: open the file, copy, paste into the Supabase SQL editor.
//
//   npm run db:pending

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outputPath = join(root, "supabase", "PENDING.sql");

// Migration tracking arrived in 0010. On a database created before that, the
// versions up to here were already applied by hand and cannot be re-run.
const TRACKING_INTRODUCED_AFTER = "0008_heating_and_breakdown";

function readEnv() {
  const file = join(root, ".env.local");
  if (!existsSync(file)) {
    console.error("Липсва .env.local — не мога да проверя базата.");
    process.exit(1);
  }
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
}

const env = readEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Липсва NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local.");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const versions = files.map((name) => name.replace(/\.sql$/, ""));

const { data: tracked, error } = await admin.from("schema_migrations").select("version");

let applied;

if (error) {
  // No tracking table. Either a brand new database, or one from before 0010.
  const { error: freshError } = await admin.from("organizations").select("id").limit(1);
  const fresh = Boolean(freshError);

  applied = fresh
    ? new Set()
    : new Set(versions.filter((v) => v <= TRACKING_INTRODUCED_AFTER));

  console.log(
    fresh
      ? "База без таблици — всички миграции предстоят.\n"
      : "Проследяването още не е включено; приемам, че всичко до " +
          `${TRACKING_INTRODUCED_AFTER} вече е минало.\n`,
  );
} else {
  applied = new Set((tracked ?? []).map((row) => row.version));
}

const pending = versions.filter((version) => !applied.has(version));

console.log(`Проект: ${new URL(url).hostname}`);
for (const version of versions) {
  console.log(`  ${applied.has(version) ? "✓ минала " : "→ ПРЕДСТОИ"}  ${version}`);
}

if (pending.length === 0) {
  if (existsSync(outputPath)) unlinkSync(outputPath);
  console.log("\nБазата е в крак. Няма нищо за пускане.");
  process.exit(0);
}

const body = pending
  .map((version) => {
    const sql = readFileSync(join(migrationsDir, `${version}.sql`), "utf8").trimEnd();
    return `-- ${"=".repeat(70)}\n-- ${version}\n-- ${"=".repeat(70)}\n\n${sql}\n`;
  })
  .join("\n");

writeFileSync(
  outputPath,
  `-- ПРЕДСТОЯЩИ МИГРАЦИИ (${pending.length})
--
-- Отвори този файл, маркирай всичко (Cmd+A), копирай (Cmd+C),
-- после в Supabase: SQL Editor -> New query -> постави -> Run.
--
-- Файлът е генериран от "npm run db:pending" и се презаписва при всяко
-- пускане. Не го редактирай — истинските миграции са в supabase/migrations/.
--
-- Генериран: ${new Date().toISOString()}

${body}`,
);

console.log(`\n${pending.length} предстоящи. Записани в:`);
console.log(`  supabase/PENDING.sql`);
console.log("\nОтвори файла, Cmd+A, Cmd+C, после в Supabase SQL Editor: New query -> paste -> Run.");
