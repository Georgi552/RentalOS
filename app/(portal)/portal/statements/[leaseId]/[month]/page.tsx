import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { StatementView } from "@/components/statement-view";
import { requireTenant } from "@/lib/auth";
import { buildStatement } from "@/lib/statement";

// The tenant's own copy of the monthly statement, built by the same function
// that builds the landlord's. Nothing here checks that the lease belongs to this
// tenant: the policies do, and buildStatement finds no ledger row for a lease
// the caller cannot read, so a guessed id ends at notFound().
export default async function PortalStatementPage({
  params,
}: PageProps<"/portal/statements/[leaseId]/[month]">) {
  const { leaseId, month } = await params;

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();

  const { supabase, organizationId } = await requireTenant();
  const statement = await buildStatement(supabase, organizationId, leaseId, month);

  if (!statement) notFound();

  return (
    <div className="max-w-2xl">
      <div className="no-print">
        <Link href="/portal" className="text-sm text-neutral-500 hover:text-neutral-900">
          &larr; Справка
        </Link>
      </div>

      <StatementView statement={statement} />

      <div className="no-print mt-4">
        <PrintButton label="PDF / печат" />
      </div>
    </div>
  );
}
