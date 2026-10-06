import Link from "next/link";
import { PropertyChart, PropertyChartTable, type ChartMonth } from "@/components/property-chart";
import { balanceNote, balanceTone, dueNote } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { tenantName } from "@/lib/types";

export type LedgerCardRow = ChartMonth & {
  lease_id: string;
  property_id: string;
  property: { id: string; name: string } | null;
  tenant: { id: string; first_name: string; last_name: string } | null;
};

// One lease, the months in order, and the balance that goes with them.
//
// The landlord's dashboard and the tenant's portal render this same component
// rather than each writing the balance block out. The block has three rules in
// it - which month the balance belongs to, that a split lease shows two
// balances instead of one, and that a month before its due date is "предстои"
// rather than a debt - and a second copy of those rules is a second chance for
// the two sides to disagree about what the tenant owes.
//
// audience says who is looking. It only decides what is a link: the landlord
// reaches the property, the tenant and a CSV export, while the tenant sees
// their own statement and nothing else. The figures are identical.
export function LeaseLedgerCard({
  months,
  audience,
}: {
  months: LedgerCardRow[];
  audience: "landlord" | "tenant";
}) {
  const latest = months[months.length - 1];
  // The balance belongs to the last month that has actually fallen due.
  const current = [...months].reverse().find((month) => month.is_due) ?? latest;
  const period = latest.month.slice(0, 7);

  const statementHref =
    audience === "landlord"
      ? `/statements/${latest.lease_id}/${period}`
      : `/portal/statements/${latest.lease_id}/${period}`;

  return (
    <section className="property-card rounded-lg border border-neutral-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {latest.property ? (
              audience === "landlord" ? (
                <Link href={`/properties/${latest.property.id}`} className="hover:underline">
                  {latest.property.name}
                </Link>
              ) : (
                latest.property.name
              )
            ) : (
              "Непознат имот"
            )}
          </h2>
          {/* The tenant knows who they are; the landlord needs to be told. */}
          {audience === "landlord" && (
            <p className="mt-0.5 text-sm text-neutral-500">
              {latest.tenant ? (
                <Link href={`/tenants/${latest.tenant.id}`} className="hover:underline">
                  {tenantName(latest.tenant)}
                </Link>
              ) : (
                "Непознат наемател"
              )}
            </p>
          )}
        </div>

        <div className="w-full sm:w-auto sm:text-right">
          <p className="text-xs text-neutral-500">Текущ баланс · {current.month.slice(0, 7)}</p>

          {current.split_rent_and_bills ? (
            // Two agreements, two balances. One number would hide a rent credit
            // sitting on top of an unpaid bill.
            <div className="mt-1 space-y-1">
              <p>
                <span className="text-xs text-neutral-500">Наем </span>
                <span className={`text-xl font-semibold ${balanceTone(current.rent_balance)}`}>
                  {formatMoney(current.rent_balance.replace("-", ""), current.currency)}
                </span>
                <span className={`ml-1 text-xs ${balanceTone(current.rent_balance)}`}>
                  {balanceNote(current.rent_balance)}
                </span>
              </p>
              <p>
                <span className="text-xs text-neutral-500">Сметки </span>
                <span className={`text-xl font-semibold ${balanceTone(current.bills_balance)}`}>
                  {formatMoney(current.bills_balance.replace("-", ""), current.currency)}
                </span>
                <span className={`ml-1 text-xs ${balanceTone(current.bills_balance)}`}>
                  {balanceNote(current.bills_balance)}
                </span>
              </p>
            </div>
          ) : (
            <>
              <p className={`text-2xl font-semibold ${balanceTone(current.balance)}`}>
                {formatMoney(current.balance.replace("-", ""), current.currency)}
              </p>
              <p className={`text-xs ${balanceTone(current.balance)}`}>
                {balanceNote(current.balance)}
              </p>
            </>
          )}

          {!latest.is_due && latest.charges !== "0.00" && (
            <p className="mt-1 text-xs text-neutral-500">
              {formatMoney(latest.charges, latest.currency)} {dueNote(latest)}
            </p>
          )}

          <Link
            href={statementHref}
            className="no-print mt-2 inline-block rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
          >
            {audience === "landlord" ? "Справка за наемателя" : "Подробна справка"}
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <PropertyChart months={months} />
        {/* The CSV export is a landlord route, so the tenant gets no link to it. */}
        <PropertyChartTable
          months={months}
          exportHref={
            audience === "landlord"
              ? `/properties/${latest.property_id}/export?table=breakdown`
              : null
          }
        />
      </div>
    </section>
  );
}

// Months arrive flat and ordered. One card per lease, cards sorted by property
// name so the dashboard does not reshuffle between reloads.
export function groupByLease(rows: LedgerCardRow[]) {
  const byLease = new Map<string, LedgerCardRow[]>();
  for (const row of rows) {
    const list = byLease.get(row.lease_id);
    if (list) list.push(row);
    else byLease.set(row.lease_id, [row]);
  }

  return [...byLease.values()].sort((a, b) =>
    (a[a.length - 1].property?.name ?? "").localeCompare(
      b[b.length - 1].property?.name ?? "",
      "bg",
    ),
  );
}
