import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { propertyOptions } from "@/lib/property-options";
import { UploadForm } from "../upload-form";

export default async function NewDocumentPage() {
  const { supabase, organizationId } = await requireOrganization();
  const properties = await propertyOptions(supabase, organizationId);

  return (
    <div>
      <Link href="/documents" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Документи
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Качи документ</h1>

      <UploadForm organizationId={organizationId} properties={properties} />
    </div>
  );
}
