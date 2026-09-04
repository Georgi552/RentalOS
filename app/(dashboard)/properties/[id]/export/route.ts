import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { csvResponse, slugify, toCsv, type CsvCell } from "@/lib/csv";

// Amounts are exported as plain decimals, not formatted with a currency
// symbol, so a spreadsheet can add them up.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const table = new URL(request.url).searchParams.get("table") ?? "ledger";
  const { supabase, organizationId } = await requireOrganization();

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("name")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (!property) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const rows: CsvCell[][] = [];

  if (table === "financials") {
    const { data, error } = await supabase
      .from("property_monthly_financials")
      .select(
        "month, currency, rent_paid::text, bills_total::text, bills_we_pay::text, expenses_total::text, net::text",
      )
      .eq("property_id", id)
      .eq("organization_id", organizationId)
      .order("month", { ascending: false });

    if (error) throw new Error(error.message);

    rows.push([
      "Месец",
      "Валута",
      "Получен наем",
      "Сметки общо",
      "Сметки платени от нас",
      "Разходи",
      "Нето",
    ]);

    for (const row of data ?? []) {
      rows.push([
        String(row.month).slice(0, 7),
        row.currency,
        row.rent_paid,
        row.bills_total,
        row.bills_we_pay,
        row.expenses_total,
        row.net,
      ]);
    }

    return csvResponse(
      `${slugify(property.name)}-prihodi-razhodi-${today}.csv`,
      toCsv(rows),
    );
  }

  const { data, error } = await supabase
    .from("lease_monthly_ledger")
    .select(
      "month, currency, rent_due::text, bills_due::text, expenses_due::text, charges::text, paid::text, balance::text, tenant:tenants(first_name, last_name)",
    )
    .eq("property_id", id)
    .eq("organization_id", organizationId)
    .order("month", { ascending: false });

  if (error) throw new Error(error.message);

  rows.push([
    "Месец",
    "Наемател",
    "Валута",
    "Наем",
    "Сметки",
    "Разходи към наемателя",
    "Начислено",
    "Платено",
    "Баланс",
  ]);

  for (const row of (data ?? []) as unknown as {
    month: string;
    currency: string;
    rent_due: string;
    bills_due: string;
    expenses_due: string;
    charges: string;
    paid: string;
    balance: string;
    tenant: { first_name: string; last_name: string } | null;
  }[]) {
    rows.push([
      row.month.slice(0, 7),
      row.tenant ? `${row.tenant.first_name} ${row.tenant.last_name}` : "",
      row.currency,
      row.rent_due,
      row.bills_due,
      row.expenses_due,
      row.charges,
      row.paid,
      row.balance,
    ]);
  }

  return csvResponse(
    `${slugify(property.name)}-dalzhimo-${today}.csv`,
    toCsv(rows),
  );
}
