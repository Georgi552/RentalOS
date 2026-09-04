import Link from "next/link";
import { PropertyChart, PropertyChartTable, type ChartMonth } from "@/components/property-chart";
import { requireOrganization } from "@/lib/auth";
import { balanceNote, balanceTone } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { tenantName } from "@/lib/types";

const MONTHS_SHOWN = 6;

type LedgerRow = ChartMonth & {
  lease_id: string;
  property_id: string;
  property: { id: string; name: string } | null;
  tenant: { id: string; first_name: string; last_name: string } | null;
};

function firstOfMonthsAgo(count: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + 1, 1));
  return start.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("lease_monthly_ledger")
    .select(
      "lease_id, property_id, month, currency, rent_due::text, bills_electricity::text, bills_water::text, bills_heating::text, bills_building_fee::text, bills_internet::text, bills_other::text, expenses_due::text, charges::text, paid::text, balance::text, property:properties(id, name), tenant:tenants(id, first_name, last_name)",
    )
    .eq("organization_id", organizationId)
    .gte("month", firstOfMonthsAgo(MONTHS_SHOWN))
    .order("month");

  if (error) throw new Error(`Не мога да заредя таблото: ${error.message}`);

  const rows = (data ?? []) as unknown as LedgerRow[];

  // One card per lease, months in order. The balance shown is the newest month.
  const byLease = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const list = byLease.get(row.lease_id);
    if (list) list.push(row);
    else byLease.set(row.lease_id, [row]);
  }

  const cards = [...byLease.values()]
    .map((months) => ({ months, latest: months[months.length - 1] }))
    .sort((a, b) =>
      (a.latest.property?.name ?? "").localeCompare(b.latest.property?.name ?? "", "bg"),
    );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Табло</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Последните {MONTHS_SHOWN} месеца по имот.
      </p>

      {cards.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">
            Още няма данни. Създай{" "}
            <Link href="/properties/new" className="underline">
              имот
            </Link>{" "}
            и активен{" "}
            <Link href="/leases/new" className="underline">
              договор
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {cards.map(({ months, latest }) => (
            <section
              key={latest.lease_id}
              className="rounded-lg border border-neutral-200 bg-white px-5 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">
                    {latest.property ? (
                      <Link href={`/properties/${latest.property.id}`} className="hover:underline">
                        {latest.property.name}
                      </Link>
                    ) : (
                      "Непознат имот"
                    )}
                  </h2>
                  <p className="mt-0.5 text-sm text-neutral-500">
                    {latest.tenant ? (
                      <Link href={`/tenants/${latest.tenant.id}`} className="hover:underline">
                        {tenantName(latest.tenant)}
                      </Link>
                    ) : (
                      "Непознат наемател"
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-neutral-500">
                    Текущ баланс · {latest.month.slice(0, 7)}
                  </p>
                  <p className={`text-2xl font-semibold ${balanceTone(latest.balance)}`}>
                    {formatMoney(latest.balance.replace("-", ""), latest.currency)}
                  </p>
                  <p className={`text-xs ${balanceTone(latest.balance)}`}>
                    {balanceNote(latest.balance)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <PropertyChart months={months} />
                <PropertyChartTable months={months} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
