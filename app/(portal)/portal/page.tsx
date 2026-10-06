import {
  LeaseLedgerCard,
  groupByLease,
  type LedgerCardRow,
} from "@/components/lease-ledger-card";
import { requireTenant } from "@/lib/auth";
import { LEDGER_SELECT, MONTHS_SHOWN, firstOfMonthsAgo } from "@/lib/ledger";

// The same months, the same columns and the same card the landlord sees on their
// dashboard. Row level security has already narrowed the view to this tenant's
// lease (migration 0024); the filters below only keep the query from fetching
// more than the page draws.
export default async function PortalPage() {
  const { supabase, tenantId, tenantName } = await requireTenant();

  const { data, error } = await supabase
    .from("lease_monthly_ledger")
    .select(LEDGER_SELECT)
    .eq("tenant_id", tenantId)
    .gte("month", firstOfMonthsAgo())
    .order("month");

  if (error) throw new Error(`Не мога да заредя справката: ${error.message}`);

  const cards = groupByLease((data ?? []) as unknown as LedgerCardRow[]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Справка</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {tenantName} · последните {MONTHS_SHOWN} месеца.
      </p>

      {cards.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">
            Още няма начисления за този период. Щом наемодателят въведе наем или
            сметка, тук ще се появи справка.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {cards.map((months) => (
            <LeaseLedgerCard
              key={months[months.length - 1].lease_id}
              months={months}
              audience="tenant"
            />
          ))}
        </div>
      )}
    </div>
  );
}
