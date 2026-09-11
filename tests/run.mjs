#!/usr/bin/env node
// Runs every *.test.mjs in this directory against a throwaway PostgreSQL.
//
//   npm test
//
// No Supabase project and no network are needed: the schema is applied to an
// in-process database, so a migration can be proven before anyone pastes it
// into the SQL editor.

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { summary } from "./helpers/assert.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();

for (const file of files) {
  const suite = await import(join(here, file));
  console.log(`\n${"=".repeat(60)}\n${suite.name ?? file}\n${"=".repeat(60)}`);
  try {
    await suite.run();
  } catch (cause) {
    console.log(`    FAIL suite threw: ${cause.message}`);
    process.exitCode = 1;
  }
}

if (!summary()) process.exitCode = 1;
