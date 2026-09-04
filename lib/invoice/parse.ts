// Shared parsing helpers for invoice text.
//
// Bulgarian utility invoices are inconsistent about nearly everything:
// Електрохолд writes 34,62 with a comma and dates as 20.08.2026, Софийска вода
// writes 14.78 with a dot and dates as 06/08/2026, and meter readings carry a
// space as the thousands separator (42 062). These helpers absorb that so the
// provider adapters stay readable.

export type ParsedDate = string; // ISO, YYYY-MM-DD

// Accepts 20.08.2026, 06/08/2026 and 20-08-2026. Day first, as every Bulgarian
// invoice writes it.
export function parseDate(value: string | null | undefined): ParsedDate | null {
  if (!value) return null;

  const match = value.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!match) return null;

  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== iso) return null; // rejects 31.02

  return iso;
}

// Returns an exact decimal string, never a float. "1 234,56" and "1234.56"
// both become "1234.56".
export function parseAmount(value: string | null | undefined): string | null {
  if (!value) return null;

  const cleaned = value.replace(/[ \s]/g, "");
  const match = cleaned.match(/^-?\d+(?:[.,]\d{1,2})?$/);
  if (!match) return null;

  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").replace(",", ".").split(".");

  return `${negative ? "-" : ""}${whole}.${frac.padEnd(2, "0")}`;
}

// The first capture group of the first pattern that hits.
export function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

// The month a billing period belongs to.
//
// Taking the start of the period is wrong: a water invoice covering
// 24.06 - 30.07 is the July bill, not June's. Taking the end is wrong too: an
// electricity invoice covering 15.07 - 13.08 is still July's. The midpoint
// gets both right, and matches how a landlord files them.
export function periodMonth(
  start: ParsedDate | null,
  end: ParsedDate | null,
): string | null {
  if (start && end) {
    const from = Date.parse(`${start}T00:00:00Z`);
    const to = Date.parse(`${end}T00:00:00Z`);
    return new Date((from + to) / 2).toISOString().slice(0, 7);
  }
  return (start ?? end)?.slice(0, 7) ?? null;
}

// Collapses whitespace and case so two spellings of the same address compare
// equal. Deliberately not clever: no transliteration, no fuzzy distance.
export function normalizeAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/[.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
