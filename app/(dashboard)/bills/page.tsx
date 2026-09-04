import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { BILL_TYPE_LABELS, label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";

type BillRow = {
  id: string;
  bill_type: string;
  provider: string | null;
  period_start: string | null;
  period_end: string | null;
  amount: string;
  currency: string;
  status: string;
  tenant_chargeable: boolean;
  paid_by_landlord: boolean;
  property: { name: string } | null;
};

export default async function BillsPage() {
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("bills")
    .select(
      "id, bill_type, provider, period_start, period_end, amount::text, currency, status, tenant_chargeable, paid_by_landlord, property:properties(name)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Не мога да заредя сметките: ${error.message}`);

  const bills = (data ?? []) as unknown as BillRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Сметки</h1>
        <Link
          href="/bills/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Добави сметка
        </Link>
      </div>

      {bills.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">
            Още няма сметки. Добавена сметка се начислява веднага на наемателя,
            ако така е записано в договора.
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {bills.map((bill) => (
            <li key={bill.id}>
              <Link
                href={`/bills/${bill.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {label(BILL_TYPE_LABELS, bill.bill_type)}
                    <span className="text-neutral-400"> · </span>
                    {bill.property?.name ?? "Без имот"}
                  </span>
                  <span className="block text-sm text-neutral-500">
                    {bill.provider ?? "Без доставчик"}
                    {bill.period_start ? ` · ${bill.period_start}` : ""}
                    {bill.period_end ? ` – ${bill.period_end}` : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm">
                    {formatMoney(bill.amount, bill.currency)}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {bill.tenant_chargeable
                      ? "начислена на наемателя"
                      : bill.paid_by_landlord
                        ? "наш разход"
                        : "наемателят плаща директно"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
