// Money rule for this codebase (context doc section 16).
//
// Amounts are PostgreSQL numeric and MUST be read with a ::text cast, e.g.
//   .select("monthly_rent::text")
// Without the cast PostgREST returns a JSON number and supabase-js parses it
// into a JS double, where 0.07 * 3 === 0.21000000000000002. Amounts therefore
// travel through this app as exact decimal strings, are never added in
// JavaScript, and are only ever summed in PostgreSQL.

export type MoneyParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const MAX_INTEGER_DIGITS = 10; // numeric(12, 2)

export function parseMoney(input: string, label = "Amount"): MoneyParseResult {
  const raw = input.trim().replace(/\s/g, "").replace(",", ".");

  if (!raw) return { ok: false, error: `${label} is required.` };

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: `${label} must be a number like 650 or 650.50.` };
  }

  const [whole, frac = ""] = raw.split(".");

  if (whole.replace(/^0+(?=\d)/, "").length > MAX_INTEGER_DIGITS) {
    return { ok: false, error: `${label} is too large.` };
  }

  return { ok: true, value: `${whole}.${frac.padEnd(2, "0")}` };
}

// Formats without ever converting to a JS number.
export function formatMoney(value: string | null, currency: string): string {
  if (value === null || value === "") return "—";

  const [whole = "0", frac = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const amount = `${grouped}.${frac.padEnd(2, "0").slice(0, 2)}`;

  return currency === "BGN" ? `${amount} лв.` : `€${amount}`;
}

function toCents(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole = "0", frac = ""] = value.replace("-", "").split(".");
  const cents = BigInt(whole || "0") * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2) || "0");
  return negative ? -cents : cents;
}

function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const frac = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

// Adds exact decimal strings through integer cents, so no float ever sees an
// amount. Only pixel geometry may use Number().
export function addMoney(...values: (string | null | undefined)[]): string {
  let total = 0n;
  for (const value of values) {
    if (value) total += toCents(value);
  }
  return fromCents(total);
}
