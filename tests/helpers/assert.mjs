// A test harness small enough to read in one sitting.

let passed = 0;
let failed = 0;
const failures = [];

export function ok(message) {
  console.log(`    ok   ${message}`);
  passed++;
}

export function fail(message, detail = "") {
  console.log(`    FAIL ${message}${detail ? `\n         ${detail}` : ""}`);
  failed++;
  failures.push(message);
}

export function equals(label, actual, expected) {
  if (String(actual) === String(expected)) ok(`${label} = ${expected}`);
  else fail(label, `expected ${expected}, got ${actual}`);
}

export function truthy(label, value) {
  if (value) ok(label);
  else fail(label);
}

// Asserts the database refuses something, and refuses it for the stated
// reason. A test that passes because a different constraint fired first is
// worse than no test: it reports a guarantee nobody is actually enforcing.
export async function rejects(db, label, sql, expectedReason) {
  try {
    await db.exec(sql);
    fail(`${label} — was ALLOWED`);
  } catch (cause) {
    if (!expectedReason || cause.message.includes(expectedReason)) ok(label);
    else fail(label, `expected "${expectedReason}", got: ${cause.message.slice(0, 120)}`);
  }
}

export async function allows(db, label, sql) {
  try {
    await db.exec(sql);
    ok(label);
  } catch (cause) {
    fail(label, cause.message.slice(0, 140));
  }
}

export function section(title) {
  console.log(`\n  ${title}`);
}

export function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nfailed:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  return failed === 0;
}
