import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { PrintButton } from "@/components/print-button";
import { requireOrganization } from "@/lib/auth";
import { LEASE_STATUS_LABELS, label } from "@/lib/labels";
import { balanceNote, balanceTone, dueNote, monthLabel, type LedgerRow } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import type { Property } from "@/lib/types";
import { deleteProperty } from "../actions";

type FinancialRow = {
  month: string;
  currency: string;
  rent_paid: string;
  expenses_total: string;
  bills_total: string;
  bills_we_pay: string;
  net: string;
};

type LeaseRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: string;
  currency: string;
  status: string;
  tenant: { id: string; first_name: string; last_name: string } | null;
};

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-4 py-2">
      <dt className="w-32 shrink-0 text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm">
        {value?.trim() ? value : <span className="text-neutral-400">&mdash;</span>}
      </dd>
    </div>
  );
}

export default async function PropertyPage({
  params,
  searchParams,
}: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load property: ${error.message}`);
  if (!data) notFound();

  const property = data as Property;

  const { data: leaseData, error: leaseError } = await supabase
    .from("leases")
    .select(
      "id, start_date, end_date, monthly_rent::text, currency, status, tenant:tenants(id, first_name, last_name)",
    )
    .eq("property_id", id)
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });

  if (leaseError) throw new Error(`Could not load leases: ${leaseError.message}`);

  const leases = (leaseData ?? []) as unknown as LeaseRow[];
  const current = leases.find((lease) => lease.status === "active");

  // Sums are computed in PostgreSQL by property_monthly_financials, never in
  // JavaScript. See lib/money.ts.
  const { data: financeData, error: financeError } = await supabase
    .from("property_monthly_financials")
    .select(
      "month, currency, rent_paid::text, expenses_total::text, bills_total::text, bills_we_pay::text, net::text",
    )
    .eq("property_id", id)
    .eq("organization_id", organizationId)
    .order("month", { ascending: false })
    .limit(12);

  if (financeError) throw new Error(`Could not load financials: ${financeError.message}`);

  const financials = (financeData ?? []) as unknown as FinancialRow[];

  const { data: ledgerData, error: ledgerError } = await supabase
    .from("lease_monthly_ledger")
    .select(
      "lease_id, property_id, tenant_id, currency, month, payment_id, rent_due::text, bills_due::text, expenses_due::text, charges::text, charges_due::text, bills_and_expenses_due::text, due_date, is_due, paid::text, paid_rent::text, paid_bills::text, rent_balance::text, bills_balance::text, split_rent_and_bills, month_delta::text, balance::text",
    )
    .eq("property_id", id)
    .eq("organization_id", organizationId)
    .order("month", { ascending: false })
    .limit(12);

  if (ledgerError) throw new Error(`Не мога да заредя баланса: ${ledgerError.message}`);

  const ledger = (ledgerData ?? []) as unknown as LedgerRow[];
  const splitLedger = ledger.some((row) => row.split_rent_and_bills);

  return (
    <div>
      <Link href="/properties" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Имоти
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{property.name}</h1>
        <div className="no-print flex items-center gap-4">
          <Link
            href={`/properties/${property.id}/edit`}
            className="text-sm font-medium text-neutral-900 hover:underline"
          >
            Редактирай
          </Link>
          <ConfirmDeleteButton
            action={deleteProperty.bind(null, property.id)}
            confirmMessage={`Delete "${property.name}"? This cannot be undone.`}
          />
        </div>
      </div>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <div className="mt-6 rounded-lg border border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-medium">Текущ наемател</h2>
        {current ? (
          <p className="mt-1 text-sm text-neutral-600">
            {current.tenant ? (
              <Link href={`/tenants/${current.tenant.id}`} className="underline">
                {current.tenant.first_name} {current.tenant.last_name}
              </Link>
            ) : (
              "Непознат наемател"
            )}
            {" · "}
            {formatMoney(current.monthly_rent, current.currency)} / месец
            {" · "}
            <Link href={`/leases/${current.id}`} className="underline">
              виж договора
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">
            Няма активен договор.{" "}
            <Link href="/leases/new" className="underline">
              Добави
            </Link>
            .
          </p>
        )}
      </div>

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 px-4 py-2">
        <Row label="Адрес" value={property.address} />
        <Row label="Град" value={property.city} />
        <Row label="Пощенски код" value={property.postal_code} />
        <Row label="Държава" value={property.country} />
        <Row label="Бележки" value={property.notes} />
      </dl>

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Дължимо от наемателя</h2>
        {ledger.length > 0 && (
          <span className="no-print flex items-center gap-4">
            <a
              href={`/properties/${property.id}/export?table=ledger`}
              className="text-sm font-medium text-neutral-900 hover:underline"
            >
              CSV
            </a>
            <PrintButton />
          </span>
        )}
      </div>
      {ledger.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          Няма начисления. Създай активен договор и месеците се появяват сами.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Месец</th>
                <th className="px-4 py-2 text-right font-medium">Наем</th>
                <th className="px-4 py-2 text-right font-medium">Сметки</th>
                <th className="px-4 py-2 text-right font-medium">Начислено</th>
                <th className="px-4 py-2 text-right font-medium">Платено</th>
                {splitLedger ? (
                  <>
                    <th className="px-4 py-2 text-right font-medium">Баланс наем</th>
                    <th className="px-4 py-2 text-right font-medium">Баланс сметки</th>
                  </>
                ) : (
                  <th className="px-4 py-2 text-right font-medium">Баланс</th>
                )}
                <th className="no-print px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {ledger.map((row) => (
                <tr key={`${row.lease_id}-${row.month}`}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {monthLabel(row.month)}
                    {dueNote(row) && (
                      <span className="block text-xs text-neutral-400">{dueNote(row)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatMoney(row.rent_due, row.currency)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatMoney(row.bills_due, row.currency)}
                    {row.expenses_due !== "0.00" && (
                      <span className="block text-xs text-neutral-500">
                        + разходи {formatMoney(row.expenses_due, row.currency)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatMoney(row.charges, row.currency)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatMoney(row.paid, row.currency)}
                  </td>
                  {splitLedger ? (
                    <>
                      <td
                        className={`px-4 py-2 text-right font-medium whitespace-nowrap ${balanceTone(row.rent_balance)}`}
                      >
                        {formatMoney(row.rent_balance.replace("-", ""), row.currency)}
                        <span className="block text-xs font-normal">
                          {balanceNote(row.rent_balance)}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-medium whitespace-nowrap ${balanceTone(row.bills_balance)}`}
                      >
                        {formatMoney(row.bills_balance.replace("-", ""), row.currency)}
                        <span className="block text-xs font-normal">
                          {balanceNote(row.bills_balance)}
                        </span>
                      </td>
                    </>
                  ) : (
                    <td
                      className={`px-4 py-2 text-right font-medium whitespace-nowrap ${balanceTone(row.balance)}`}
                    >
                      {formatMoney(row.balance.replace("-", ""), row.currency)}
                      <span className="block text-xs font-normal">{balanceNote(row.balance)}</span>
                    </td>
                  )}
                  <td className="no-print px-4 py-2 text-right whitespace-nowrap">
                    <Link
                      href={`/rent/new?lease=${row.lease_id}&month=${monthLabel(row.month)}`}
                      className="text-sm font-medium text-neutral-900 hover:underline"
                    >
                      {row.payment_id ? "Промени" : "Отбележи"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Приходи и разходи</h2>
        {financials.length > 0 && (
          <span className="no-print flex items-center gap-4">
            <a
              href={`/properties/${property.id}/export?table=financials`}
              className="text-sm font-medium text-neutral-900 hover:underline"
            >
              CSV
            </a>
            <PrintButton />
          </span>
        )}
      </div>
      {financials.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          Още няма записи. Добави{" "}
          <Link href="/rent/new" className="underline">
            наем
          </Link>
          {", "}
          <Link href="/bills/new" className="underline">
            сметка
          </Link>{" "}
          или{" "}
          <Link href="/expenses/new" className="underline">
            разход
          </Link>
          .
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Месец</th>
                <th className="px-4 py-2 text-right font-medium">Получен наем</th>
                <th className="px-4 py-2 text-right font-medium">Сметки</th>
                <th className="px-4 py-2 text-right font-medium">Разходи</th>
                <th className="px-4 py-2 text-right font-medium">Нето</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {financials.map((row) => (
                <tr key={`${row.month}-${row.currency}`}>
                  <td className="px-4 py-2 whitespace-nowrap">{row.month.slice(0, 7)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatMoney(row.rent_paid, row.currency)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatMoney(row.bills_total, row.currency)}
                    {row.bills_total !== row.bills_we_pay && (
                      <span className="block text-xs text-neutral-500">
                        плащаме {formatMoney(row.bills_we_pay, row.currency)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatMoney(row.expenses_total, row.currency)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium whitespace-nowrap">
                    {formatMoney(row.net, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {leases.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold tracking-tight">История на договорите</h2>
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {leases.map((lease) => (
              <li key={lease.id}>
                <Link
                  href={`/leases/${lease.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {lease.tenant
                        ? `${lease.tenant.first_name} ${lease.tenant.last_name}`
                        : "Непознат наемател"}
                    </span>
                    <span className="block text-sm text-neutral-500">
                      от {lease.start_date}
                      {lease.end_date ? ` до ${lease.end_date}` : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm">
                      {formatMoney(lease.monthly_rent, lease.currency)}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {label(LEASE_STATUS_LABELS, lease.status)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
