import { requireTenant } from "@/lib/auth";
import { formatBytes } from "@/lib/documents";
import { BILL_TYPE_LABELS, label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";

type InvoiceRow = {
  id: string;
  filename: string;
  file_size: number | null;
  created_at: string;
  property: { name: string } | null;
  // A document can carry at most one bill in practice, but the foreign key is
  // one-to-many, so PostgREST hands back an array.
  bills: {
    bill_type: string;
    provider: string | null;
    amount: string;
    currency: string;
    period_start: string | null;
    period_end: string | null;
  }[];
};

// Every invoice filed against the properties this tenant rents. Which rows those
// are is decided by the policies, not here: documents_select_tenant scopes by
// property, and the storage policy scopes the file itself, so a document for
// another property is not merely hidden from this list - it cannot be downloaded
// either, whatever id is typed into the URL.
export default async function PortalInvoicesPage() {
  const { supabase } = await requireTenant();

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, filename, file_size, created_at, property:properties(name), bills(bill_type, provider, amount::text, currency, period_start, period_end)",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Не мога да заредя фактурите: ${error.message}`);

  const invoices = (data ?? []) as unknown as InvoiceRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Фактури</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Всички документи за имота, който наемаш, най-новите отгоре.
      </p>

      {invoices.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">Още няма качени фактури за имота.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {invoices.map((invoice) => {
            const bill = invoice.bills[0];
            const period =
              bill?.period_start && bill?.period_end
                ? `${bill.period_start} – ${bill.period_end}`
                : null;

            return (
              <li key={invoice.id}>
                <a
                  href={`/documents/${invoice.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {bill ? label(BILL_TYPE_LABELS, bill.bill_type) : invoice.filename}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {[
                        bill?.provider,
                        period,
                        invoice.property?.name,
                        invoice.created_at.slice(0, 10),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {bill && (
                      <span className="block text-sm whitespace-nowrap">
                        {formatMoney(bill.amount, bill.currency)}
                      </span>
                    )}
                    <span className="block text-xs text-neutral-500 whitespace-nowrap">
                      {formatBytes(invoice.file_size)}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
