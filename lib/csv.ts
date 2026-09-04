export type CsvCell = string | number | null | undefined;

// RFC 4180 quoting: a field is wrapped only when it has to be, and any quote
// inside is doubled.
function cell(value: CsvCell) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: CsvCell[][]) {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

// Excel assumes the system encoding unless the file starts with a BOM, which
// turns Cyrillic into mojibake without it.
export function csvResponse(filename: string, csv: string) {
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${asciiFallback(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

// Content-Disposition filenames must be ASCII; filename* carries the real one.
function asciiFallback(filename: string) {
  return filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
}

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "export"
  );
}
