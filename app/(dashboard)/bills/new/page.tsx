import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { propertyOptions } from "@/lib/property-options";
import { createBill } from "../actions";
import { BillForm } from "../bill-form";
import { activeLeaseTerms } from "../lease-terms-lookup";
import { documentOptions } from "../options";

export default async function NewBillPage({ searchParams }: PageProps<"/bills/new">) {
  const { document: documentId } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const [properties, documents, terms] = await Promise.all([
    propertyOptions(supabase, organizationId),
    documentOptions(supabase, organizationId),
    activeLeaseTerms(supabase, organizationId),
  ]);

  return (
    <div>
      <Link href="/bills" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Сметки
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Добави сметка</h1>

      <BillForm
        action={createBill}
        defaults={{ document_id: typeof documentId === "string" ? documentId : "" }}
        properties={properties}
        documents={documents}
        terms={terms}
        submitLabel="Създай сметка"
        cancelHref="/bills"
      />
    </div>
  );
}
