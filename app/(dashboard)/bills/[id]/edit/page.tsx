import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { propertyOptions } from "@/lib/property-options";
import { updateBill } from "../../actions";
import { BillForm } from "../../bill-form";
import { activeLeaseTerms } from "../../lease-terms-lookup";
import { documentOptions } from "../../options";

export default async function EditBillPage({ params }: PageProps<"/bills/[id]/edit">) {
  const { id } = await params;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("bills")
    .select(
      "id, property_id, document_id, provider, issue_date, bill_type, invoice_number, customer_number, period_start, period_end, amount::text, invoice_total::text, currency, due_date, status, tenant_chargeable, paid_by_landlord, charge_month_override, notes",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Не мога да заредя сметката: ${error.message}`);
  if (!data) notFound();

  const bill = data as unknown as Record<string, string | boolean | null>;

  const [properties, documents, terms] = await Promise.all([
    propertyOptions(supabase, organizationId),
    documentOptions(supabase, organizationId),
    activeLeaseTerms(supabase, organizationId),
  ]);

  return (
    <div>
      <Link href={`/bills/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Сметка
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Редакция на сметка</h1>

      <BillForm
        action={updateBill.bind(null, id)}
        defaults={{
          property_id: (bill.property_id as string) ?? "",
          document_id: (bill.document_id as string) ?? "",
          provider: (bill.provider as string) ?? "",
          issue_date: (bill.issue_date as string) ?? "",
          charge_month_override:
            ((bill.charge_month_override as string) ?? "").slice(0, 7),
          bill_type: (bill.bill_type as string) ?? "",
          invoice_number: (bill.invoice_number as string) ?? "",
          customer_number: (bill.customer_number as string) ?? "",
          period_start: (bill.period_start as string) ?? "",
          period_end: (bill.period_end as string) ?? "",
          amount: (bill.amount as string) ?? "",
          invoice_total: (bill.invoice_total as string) ?? "",
          currency: (bill.currency as string) ?? "EUR",
          due_date: (bill.due_date as string) ?? "",
          status: (bill.status as string) ?? "needs_review",
          tenant_chargeable: Boolean(bill.tenant_chargeable),
          paid_by_landlord: Boolean(bill.paid_by_landlord),
          notes: (bill.notes as string) ?? "",
        }}
        properties={properties}
        documents={documents}
        terms={terms}
        submitLabel="Запази промените"
        cancelHref={`/bills/${id}`}
      />
    </div>
  );
}
