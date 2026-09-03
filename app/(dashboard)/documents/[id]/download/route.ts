import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { DOCUMENT_BUCKET } from "@/lib/documents";

// Files are never public. Each view mints a short-lived signed URL
// (context doc section 42).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, organizationId } = await requireOrganization();

  const { data: document, error } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !document) {
    redirect(`/documents?error=${encodeURIComponent("Документът не е намерен.")}`);
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path, 60);

  if (signError || !signed) {
    redirect(
      `/documents?error=${encodeURIComponent(
        signError?.message ?? "Не мога да създам връзка към файла.",
      )}`,
    );
  }

  redirect(signed.signedUrl);
}
