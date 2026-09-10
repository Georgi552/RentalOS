import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { balanceNote, balanceTone, dueNote, monthLabel, type LedgerRow } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { tenantName } from "@/lib/types";

type Row = LedgerRow & {
  property: { name: string } | null;
  tenant: { first_name: string; last_name: string } | null;
};

export default async function RentPage({ searchParams }: PageProps<"/rent">) {
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("lease_monthly_ledger")
    .select(
      "lease_id, property_id, tenant_id, currency, month, payment_id, rent_due::text, bills_due::text, expenses_due::text, charges::text, charges_due::text, bills_and_expenses_due::text, due_date, is_due, paid::text, paid_rent::text, paid_bills::text, rent_balance::text, bills_balance::text, split_rent_and_bills, balance::text, property:properties(name), tenant:tenants(first_name, last_name)",
    )
    .eq("organization_id", organizationId)
    .order("month", { ascending: false })
    .limit(60);

  if (error) throw new Error(`Не мога да заредя справката: ${error.message}`);

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Плащания</h1>
        <Link
          href="/rent/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Отбележи плащане
        </Link>
      </div>

      <p className="mt-2 text-sm text-neutral-500">
        Наемът и сметките се начисляват сами. Ти въвеждаш само платеното.
      </p>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">
            Още няма начисления. Създай активен договор и месеците ще се появят сами.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Месец</th>
                <th className="px-4 py-2 font-medium">Имот / наемател</th>
                <th className="px-4 py-2 text-right font-medium">Начислено</th>
                <th className="px-4 py-2 text-right font-medium">Платено</th>
                <th className="px-4 py-2 text-right font-medium">Баланс</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((row) => (
                <tr key={`${row.lease_id}-${row.month}`}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {monthLabel(row.month)}
                    {dueNote(row) && (
                      <span className="block text-xs text-neutral-400">{dueNote(row)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="block">{row.property?.name ?? "Непознат имот"}</span>
                    <span className="block text-xs text-neutral-500">
                      {row.tenant ? tenantName(row.tenant) : "Непознат наемател"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatMoney(row.charges, row.currency)}
                    <span className="block text-xs text-neutral-500">
                      наем {formatMoney(row.rent_due, row.currency)}
                      {row.bills_due !== "0.00" && ` · сметки ${formatMoney(row.bills_due, row.currency)}`}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatMoney(row.paid, row.currency)}
                  </td>
                  {row.split_rent_and_bills ? (
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <span className={`block text-sm font-medium ${balanceTone(row.rent_balance)}`}>
                        наем {formatMoney(row.rent_balance.replace("-", ""), row.currency)}
                      </span>
                      <span className={`block text-xs ${balanceTone(row.bills_balance)}`}>
                        сметки {formatMoney(row.bills_balance.replace("-", ""), row.currency)}
                      </span>
                    </td>
                  ) : (
                    <td
                      className={`px-4 py-2 text-right font-medium whitespace-nowrap ${balanceTone(row.balance)}`}
                    >
                      {formatMoney(row.balance.replace("-", ""), row.currency)}
                      <span className="block text-xs font-normal">{balanceNote(row.balance)}</span>
                    </td>
                  )}
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {row.split_rent_and_bills ? (
                      // Two balances, so two entry points: one link would leave the
                      // landlord guessing which stream they were about to touch.
                      <span className="flex justify-end gap-3">
                        <Link
                          href={`/rent/new?lease=${row.lease_id}&month=${monthLabel(row.month)}&kind=rent`}
                          className="text-sm font-medium text-neutral-900 hover:underline"
                        >
                          Наем
                        </Link>
                        <Link
                          href={`/rent/new?lease=${row.lease_id}&month=${monthLabel(row.month)}&kind=bills`}
                          className="text-sm font-medium text-neutral-900 hover:underline"
                        >
                          Сметки
                        </Link>
                      </span>
                    ) : (
                      <Link
                        href={`/rent/new?lease=${row.lease_id}&month=${monthLabel(row.month)}`}
                        className="text-sm font-medium text-neutral-900 hover:underline"
                      >
                        {row.payment_id ? "Промени" : "Отбележи"}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
