import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { StatementView } from "@/components/statement-view";
import { requireOrganization } from "@/lib/auth";
import { buildStatement } from "@/lib/statement";
import { SendStatementButton } from "../../send-button";

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

      <StatementView statement={statement} />

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
