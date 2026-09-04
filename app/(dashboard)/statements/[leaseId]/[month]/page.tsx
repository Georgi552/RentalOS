import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireOrganization } from "@/lib/auth";
import { BILL_TYPE_LABELS, EXPENSE_CATEGORY_LABELS, label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { buildStatement } from "@/lib/statement";
import { SendStatementButton } from "../../send-button";

function lineLabel(key: string) {
  return (
    BILL_TYPE_LABELS[key as keyof typeof BILL_TYPE_LABELS] ??
    label(EXPENSE_CATEGORY_LABELS, key)
  );
}

export default async function StatementPage({
  params,
  searchParams,
}: PageProps<"/statements/[leaseId]/[month]">) {
  const { leaseId, month } = await params;
  const { sent, error: actionError } = await searchParams;

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();

  const { supabase, organizationId } = await requireOrganization();
  const statement = await buildStatement(supabase, organizationId, leaseId, month);

  if (!statement) notFound();

  const { data: lastSend } = await supabase
    .from("statement_sends")
    .select("sent_at, sent_to, trigger")
    .eq("organization_id", organizationId)
    .eq("lease_id", leaseId)
    .eq("period_month", `${month}-01`)
    .eq("status", "sent")
    .maybeSingle();

  const rows: { label: string; detail: string | null; amount: string }[] = [
    { label: "Наем", detail: null, amount: statement.rentDue },
    ...statement.lines.map((line) => ({
      label: lineLabel(line.label),
      detail: line.detail,
      amount: line.amount,
    })),
  ];

  return (
    <div className="max-w-2xl">
      <div className="no-print">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-900">
          &larr; Табло
        </Link>

        {sent === "1" && (
          <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Справката е изпратена.
          </p>
        )}
        {typeof actionError === "string" && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
        )}
      </div>

      <article className="mt-4 rounded-lg border border-neutral-200 bg-white px-6 py-5">
        <p className="text-sm text-neutral-500">{statement.organizationName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Справка за {statement.month}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {statement.propertyName}
          <span className="block text-neutral-500">{statement.propertyAddress}</span>
        </p>
        <p className="mt-3 text-sm">
          Наемател: <span className="font-medium">{statement.tenantName}</span>
          <span className="block text-neutral-500">Срок за плащане: {statement.dueDate}</span>
        </p>

        <table className="mt-5 w-full text-sm">
          <tbody className="divide-y divide-neutral-200">
            {rows.map((row, index) => (
              <tr key={`${row.label}-${index}`}>
                <td className="py-2">
                  {row.label}
                  {row.detail && (
                    <span className="block text-xs text-neutral-500">{row.detail}</span>
                  )}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {formatMoney(row.amount, statement.currency)}
                </td>
              </tr>
            ))}

            {statement.balanceBefore !== "0.00" && (
              <tr>
                <td className="py-2">
                  {statement.balanceBefore.startsWith("-")
                    ? "Задължение от предходен месец"
                    : "Надплатено от предходен месец"}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {formatMoney(statement.balanceBefore.replace("-", ""), statement.currency)}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-900">
              <td className="py-3 text-base font-semibold">За плащане</td>
              <td className="py-3 text-right text-base font-semibold whitespace-nowrap">
                {formatMoney(statement.totalDue, statement.currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        {statement.paid !== "0.00" && (
          <p className="mt-3 text-sm text-neutral-500">
            Отбелязано като платено за този месец:{" "}
            {formatMoney(statement.paid, statement.currency)}
          </p>
        )}
      </article>

      <div className="no-print mt-4 flex flex-wrap items-center gap-4">
        <SendStatementButton
          leaseId={leaseId}
          month={month}
          tenantEmail={statement.tenantEmail}
          alreadySent={Boolean(lastSend)}
        />
        <PrintButton label="PDF / печат" />
        {lastSend && (
          <p className="text-xs text-neutral-500">
            Изпратена на {new Date(lastSend.sent_at).toLocaleString("bg-BG")} до{" "}
            {lastSend.sent_to}
            {lastSend.trigger === "scheduled" ? " (автоматично)" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
