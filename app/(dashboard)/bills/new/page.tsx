import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { analyzeDocument } from "@/lib/invoice/from-document";
import { propertyOptions } from "@/lib/property-options";
import { createBill } from "../actions";
import { BillForm, type BillDefaults } from "../bill-form";
import { activeLeaseTerms } from "../lease-terms-lookup";
import { documentOptions } from "../options";

export default async function NewBillPage({ searchParams }: PageProps<"/bills/new">) {
  const { document: documentParam } = await searchParams;
  const documentId = typeof documentParam === "string" ? documentParam : "";

  const { supabase, organizationId } = await requireOrganization();

  const [properties, documents, terms] = await Promise.all([
    propertyOptions(supabase, organizationId),
    documentOptions(supabase, organizationId),
    activeLeaseTerms(supabase, organizationId),
  ]);

  // Reading the PDF fills the form in. Nothing is saved until the landlord
  // presses the button.
  const analysis = documentId
    ? await analyzeDocument(supabase, organizationId, documentId)
    : null;

  const invoice = analysis?.invoice ?? null;

  const defaults: Partial<BillDefaults> = {
    document_id: documentId,
    ...(invoice
      ? {
          property_id: analysis?.match.propertyId ?? "",
          provider: invoice.provider,
          bill_type: invoice.billType,
          invoice_number: invoice.invoiceNumber ?? "",
          customer_number: invoice.customerNumber ?? "",
          issue_date: invoice.issueDate ?? "",
          period_start: invoice.periodStart ?? "",
          period_end: invoice.periodEnd ?? "",
          due_date: invoice.dueDate ?? "",
          // When the invoice states a payable amount that differs from the
          // period charge, the payable one is offered and the charge is kept
          // beside it. The warning above says why, and the landlord decides.
          amount: invoice.amountDue ?? invoice.amount ?? "",
          invoice_total:
            invoice.amountDue && invoice.amountDue !== invoice.amount
              ? (invoice.amount ?? "")
              : "",
          currency: invoice.currency,
        }
      : {}),
  };

  const blocked = (analysis?.errors.length ?? 0) > 0;

  return (
    <div>
      <Link href="/bills" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Сметки
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Добави сметка</h1>

      {!documentId && (
        <p className="mt-2 max-w-lg text-sm text-neutral-500">
          Ако имаш PDF на фактурата,{" "}
          <Link href="/documents/new" className="underline">
            качи я
          </Link>{" "}
          и полетата ще се попълнят сами.
        </p>
      )}

      {analysis && (
        <div className="mt-4 max-w-lg space-y-3">
          {invoice ? (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm">
              <p className="font-medium">Прочетено от {analysis.filename}</p>
              <p className="mt-1 text-neutral-600">
                {invoice.provider}
                {invoice.periodStart && invoice.periodEnd && (
                  <>
                    {" · период "}
                    {invoice.periodStart} – {invoice.periodEnd}
                  </>
                )}
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                Провери числата срещу фактурата, преди да запишеш.
              </p>
            </div>
          ) : (
            <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
              Не успях да прочета {analysis.filename}. Попълни полетата ръчно.
            </p>
          )}

          {analysis.match.reason && (
            <p
              className={`rounded-md px-3 py-2 text-sm ${
                analysis.match.confidence === "certain"
                  ? "bg-green-50 text-green-800"
                  : analysis.match.confidence === "likely"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {analysis.match.reason}
            </p>
          )}

          {analysis.errors.map((issue) => (
            <p
              key={`${issue.field}-${issue.message}`}
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {issue.message}
            </p>
          ))}

          {analysis.warnings.map((issue) => (
            <p
              key={`${issue.field}-${issue.message}`}
              className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              {issue.message}
            </p>
          ))}
        </div>
      )}

      {blocked ? (
        <p className="mt-6 max-w-lg text-sm text-neutral-500">
          Оправи горното или{" "}
          <Link href="/bills/new" className="underline">
            въведи сметката на ръка
          </Link>
          .
        </p>
      ) : (
        <BillForm
          action={createBill}
          defaults={defaults}
          properties={properties}
          documents={documents}
          terms={terms}
          submitLabel="Създай сметка"
          cancelHref="/bills"
        />
      )}
    </div>
  );
}
