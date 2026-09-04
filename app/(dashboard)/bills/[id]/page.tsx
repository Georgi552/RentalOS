import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { requireOrganization } from "@/lib/auth";
import { BILL_STATUS_LABELS, BILL_TYPE_LABELS, label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { deleteBill } from "../actions";

type BillDetail = {
  id: string;
  bill_type: string;
  provider: string | null;
  issue_date: string | null;
  charge_month_override: string | null;
  invoice_number: string | null;
  customer_number: string | null;
  period_start: string | null;
  period_end: string | null;
  amount: string;
  invoice_total: string | null;
  currency: string;
  due_date: string | null;
  status: string;
  tenant_chargeable: boolean;
  paid_by_landlord: boolean;
  extraction_confidence: string | null;
  match_reason: string | null;
  notes: string | null;
  property: { id: string; name: string } | null;
  document: { id: string; filename: string } | null;
};

export default async function BillPage({ params, searchParams }: PageProps<"/bills/[id]">) {
  const { id } = await params;
  const { error: actionError, created, duplicate } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("bills")
    .select(
      "id, bill_type, provider, issue_date, charge_month_override, invoice_number, customer_number, period_start, period_end, amount::text, invoice_total::text, currency, due_date, status, tenant_chargeable, paid_by_landlord, extraction_confidence::text, match_reason, notes, property:properties(id, name), document:documents(id, filename)",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Не мога да заредя сметката: ${error.message}`);
  if (!data) notFound();

  const bill = data as unknown as BillDetail;

  const rows: [string, string | null][] = [
    ["Вид", label(BILL_TYPE_LABELS, bill.bill_type)],
    ["Статус", label(BILL_STATUS_LABELS, bill.status)],
    ["Доставчик", bill.provider],
    ["Дата на издаване", bill.issue_date],
    [
      "Начислена в месец",
      bill.charge_month_override
        ? `${bill.charge_month_override.slice(0, 7)} (зададено ръчно)`
        : null,
    ],
    ["Номер на фактура", bill.invoice_number],
    ["Клиентски номер", bill.customer_number],
    [
      "Период",
      bill.period_start || bill.period_end
        ? `${bill.period_start ?? "?"} – ${bill.period_end ?? "?"}`
        : null,
    ],
    ["Сума", formatMoney(bill.amount, bill.currency)],
    [
      "По фактура",
      bill.invoice_total && bill.invoice_total !== bill.amount
        ? `${formatMoney(bill.invoice_total, bill.currency)} (различава се от записаната сума)`
        : null,
    ],
    ["Падеж", bill.due_date],
    ["Плаща се от нас", bill.paid_by_landlord ? "Да" : "Не, наемателят плаща директно"],
    ["Начислява се на наемателя", bill.tenant_chargeable ? "Да" : "Не"],
    ["Бележки", bill.notes],
  ];

  return (
    <div>
      <Link href="/bills" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Сметки
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {label(BILL_TYPE_LABELS, bill.bill_type)}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {formatMoney(bill.amount, bill.currency)}
            {" · "}
            {bill.property?.name ?? "без имот"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={`/bills/${bill.id}/edit`}
            className="text-sm font-medium text-neutral-900 hover:underline"
          >
            Редактирай
          </Link>
          <ConfirmDeleteButton
            action={deleteBill.bind(null, bill.id)}
            confirmMessage="Да изтрия ли тази сметка? Действието е необратимо."
          />
        </div>
      </div>

      {created === "1" && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Фактурата е прочетена и вписана автоматично. Провери числата.
        </p>
      )}

      {duplicate === "1" && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Тази сметка вече беше въведена — това е съществуващият запис. Изтрий го,
          ако искаш да го замениш с новия документ.
        </p>
      )}

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 px-4 py-2">
        <div className="flex gap-4 py-2">
          <dt className="w-40 shrink-0 text-sm text-neutral-500">Имот</dt>
          <dd className="text-sm">
            {bill.property ? (
              <Link href={`/properties/${bill.property.id}`} className="underline">
                {bill.property.name}
              </Link>
            ) : (
              <span className="text-neutral-400">&mdash;</span>
            )}
          </dd>
        </div>
        <div className="flex gap-4 py-2">
          <dt className="w-40 shrink-0 text-sm text-neutral-500">Оригинален документ</dt>
          <dd className="text-sm">
            {bill.document ? (
              <a
                href={`/documents/${bill.document.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {bill.document.filename}
              </a>
            ) : (
              <span className="text-neutral-400">&mdash;</span>
            )}
          </dd>
        </div>
        {rows.map(([rowLabel, rowValue]) => (
          <div key={rowLabel} className="flex gap-4 py-2">
            <dt className="w-40 shrink-0 text-sm text-neutral-500">{rowLabel}</dt>
            <dd className="text-sm">
              {rowValue ? rowValue : <span className="text-neutral-400">&mdash;</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
