import { revalidatePath } from "next/cache";
import { autoCreateBill, setStatus } from "@/lib/invoice/auto-create";
import { authorizeInbound, createAdminClient } from "../authorize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Step two of two. The PDFs are in Storage; now they go down the same path an
// uploaded file does.
//
// The one difference from an upload: a document from a sender who is not on the
// landlord's list is never handed to autoCreateBill. The database would refuse
// the write anyway (bills_auto_needs_known_sender), but sending it to review
// deliberately is clearer than relying on an exception to produce the right
// outcome.

type Payload = { inboundEmailId?: unknown };

export async function POST(request: Request) {
  const auth = authorizeInbound(request);
  if (!auth.ok) return auth.response;

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "body is not JSON" }, { status: 400 });
  }

  const inboundEmailId = typeof payload.inboundEmailId === "string" ? payload.inboundEmailId : "";
  if (!inboundEmailId) {
    return Response.json({ error: "inboundEmailId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: email, error: emailError } = await admin
    .from("inbound_emails")
    .select("id, organization_id, sender_known")
    .eq("id", inboundEmailId)
    .maybeSingle();

  if (emailError) return Response.json({ error: emailError.message }, { status: 500 });
  if (!email) return Response.json({ error: "unknown inbound email" }, { status: 404 });

  const organizationId = email.organization_id as string;
  const senderKnown = email.sender_known as boolean;

  const { data: documents, error: documentError } = await admin
    .from("documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("inbound_email_id", inboundEmailId);

  if (documentError) return Response.json({ error: documentError.message }, { status: 500 });

  const results: { documentId: string; outcome: string; detail?: string }[] = [];

  for (const document of documents ?? []) {
    const documentId = document.id as string;

    if (!senderKnown) {
      await setStatus(admin, organizationId, documentId, "needs_review");
      results.push({
        documentId,
        outcome: "review",
        detail: "Подателят не е в списъка с разрешените.",
      });
      continue;
    }

    const result = await autoCreateBill(admin, organizationId, documentId);
    results.push({
      documentId,
      outcome: result.outcome,
      detail: result.outcome === "review" ? result.reason : undefined,
    });
  }

  if (results.some((entry) => entry.outcome === "created")) {
    revalidatePath("/bills");
    revalidatePath("/dashboard");
    revalidatePath("/properties");
  }
  revalidatePath("/documents");
  revalidatePath("/settings");

  return Response.json({ results });
}
