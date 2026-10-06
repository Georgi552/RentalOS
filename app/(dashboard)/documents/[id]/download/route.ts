import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DOCUMENT_BUCKET } from "@/lib/documents";

// Files are never public. Each view mints a short-lived signed URL
// (context doc section 42).
//
// One route for both a landlord and a tenant. It asks only for a signed-in user
// and does not scope the look-up itself: the policies on documents decide which
// row is visible, and the policies on storage.objects decide whether a signed
// URL is issued at all, so a guessed id finds nothing on either side of the
// call. Scoping here as well would mean two rules to keep in step, and the
// weaker of the two would be the one that mattered.
//
// A failure answers with a status rather than redirecting to a page, because the
// two audiences have different pages and the route does not know which one is
// asking.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: document, error } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error || !document) {
    return new Response("Документът не е намерен.", { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path, 60);

  if (signError || !signed) {
    return new Response(signError?.message ?? "Не мога да създам връзка към файла.", {
      status: 502,
    });
  }

  redirect(signed.signedUrl);
}
