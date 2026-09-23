import { DOCUMENT_BUCKET, MAX_UPLOAD_BYTES, documentStoragePath } from "@/lib/documents";
import { MAX_INBOUND_PER_DAY, normalizeEmail } from "@/lib/inbound";
import { authorizeInbound, createAdminClient } from "../authorize";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Step one of two. The Worker tells us who sent what; we decide whether to
// accept it, and hand back a place to put each PDF.
//
// The files themselves never pass through here. Vercel caps a request body at
// roughly 4.5 MB while an uploaded invoice may be 10 MB (MAX_UPLOAD_BYTES), so
// the Worker uploads straight to Storage with the signed URLs this returns. That
// also keeps SUPABASE_SERVICE_ROLE_KEY out of a second environment.

type Attachment = { filename: string; size: number };

type Payload = {
  messageId?: unknown;
  from?: unknown;
  to?: unknown;
  subject?: unknown;
  attachments?: unknown;
};

function localPartOf(address: string) {
  return address.split("@")[0]?.trim().toLowerCase() ?? "";
}

// An address arrives as either "Name <a@b>" or "a@b" depending on the header.
function addressOnly(value: string) {
  const angled = value.match(/<([^>]+)>/);
  return normalizeEmail(angled ? angled[1] : value);
}

export async function POST(request: Request) {
  const auth = authorizeInbound(request);
  if (!auth.ok) return auth.response;

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "body is not JSON" }, { status: 400 });
  }

  const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
  const fromRaw = typeof payload.from === "string" ? payload.from : "";
  const toRaw = typeof payload.to === "string" ? payload.to : "";
  const subject = typeof payload.subject === "string" ? payload.subject.slice(0, 500) : null;

  if (!messageId || !fromRaw || !toRaw) {
    return Response.json({ error: "messageId, from and to are required" }, { status: 400 });
  }

  const from = addressOnly(fromRaw);
  const to = addressOnly(toRaw);

  const attachments: Attachment[] = Array.isArray(payload.attachments)
    ? payload.attachments
        .filter((item): item is { filename: string; size: number } =>
          Boolean(
            item &&
              typeof item === "object" &&
              typeof (item as { filename?: unknown }).filename === "string" &&
              typeof (item as { size?: unknown }).size === "number",
          ),
        )
        .map((item) => ({ filename: item.filename, size: item.size }))
    : [];

  const admin = createAdminClient();

  // Rule 1: the address has to belong to somebody. An unrecognised one is not
  // journalled at all - there is no organization to journal it against, and
  // writing rows for stray traffic would be its own denial of service.
  const { data: organization, error: lookupError } = await admin
    .from("organizations")
    .select("id")
    .eq("inbox_address", localPartOf(to))
    .maybeSingle();

  if (lookupError) {
    return Response.json({ error: lookupError.message }, { status: 500 });
  }
  if (!organization) {
    return Response.json({ error: "unknown recipient", reject: true }, { status: 404 });
  }

  const organizationId = organization.id as string;

  // Was the sender on the list when the mail arrived? Recorded as a fact about
  // this email so that removing a sender later cannot retroactively invalidate a
  // bill already written.
  const { data: knownSender } = await admin
    .from("organization_inbound_senders")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", from)
    .maybeSingle();

  const senderKnown = Boolean(knownSender);

  const journal = async (
    status: "accepted" | "rejected" | "ignored",
    reason: string | null,
    attachmentCount: number,
  ) =>
    admin
      .from("inbound_emails")
      .insert({
        organization_id: organizationId,
        message_id: messageId,
        from_address: from,
        to_address: to,
        subject,
        attachment_count: attachmentCount,
        sender_known: senderKnown,
        status,
        reason,
      })
      .select("id")
      .single();

  // Rule 4 before rule 2: a flood of mail with no attachments is still a flood,
  // and the cap is what compensates for the address being readable rather than
  // secret.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", since);

  if ((count ?? 0) >= MAX_INBOUND_PER_DAY) {
    await journal("rejected", `Повече от ${MAX_INBOUND_PER_DAY} писма за 24 часа.`, 0);
    return Response.json({ error: "rate limited" }, { status: 429 });
  }

  // Rule 2 and 3: only PDFs, only within the size a document may be.
  const usable = attachments.filter(
    (file) => file.filename.toLowerCase().endsWith(".pdf") && file.size > 0,
  );
  const tooBig = usable.filter((file) => file.size > MAX_UPLOAD_BYTES);
  const accepted = usable.filter((file) => file.size <= MAX_UPLOAD_BYTES);

  if (accepted.length === 0) {
    const reason =
      attachments.length === 0
        ? "Писмото няма прикачени файлове."
        : tooBig.length > 0
          ? "PDF-ът е над допустимия размер."
          : "Няма прикачен PDF. Доставчик, който праща линк, не се обработва.";

    const entry = await journal("ignored", reason, attachments.length);
    if (entry.error) return duplicateOrError(entry.error);

    return Response.json({ accepted: false, reason });
  }

  const entry = await journal(
    "accepted",
    [
      tooBig.length > 0 ? `${tooBig.length} файл(а) над допустимия размер.` : null,
      senderKnown ? null : "Подателят не е в списъка, затова иска преглед.",
    ]
      .filter(Boolean)
      .join(" ") || null,
    accepted.length,
  );

  if (entry.error) return duplicateOrError(entry.error);

  const inboundEmailId = entry.data.id as string;
  const uploads: { documentId: string; filename: string; path: string; token: string }[] = [];

  for (const file of accepted) {
    const { data: document, error: documentError } = await admin
      .from("documents")
      .insert({
        organization_id: organizationId,
        inbound_email_id: inboundEmailId,
        // Written before the file exists, so the row is never left pointing at
        // nothing: the path is derived from the id we are about to get back.
        storage_path: `pending/${crypto.randomUUID()}`,
        filename: file.filename,
        mime_type: "application/pdf",
        file_size: file.size,
        processing_status: "processing",
      })
      .select("id")
      .single();

    if (documentError) {
      return Response.json({ error: documentError.message }, { status: 500 });
    }

    const documentId = document.id as string;
    const path = documentStoragePath(organizationId, documentId, file.filename);

    const { data: signed, error: signError } = await admin.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUploadUrl(path);

    if (signError || !signed) {
      return Response.json(
        { error: signError?.message ?? "could not sign upload" },
        { status: 500 },
      );
    }

    await admin.from("documents").update({ storage_path: path }).eq("id", documentId);

    uploads.push({ documentId, filename: file.filename, path, token: signed.token });
  }

  return Response.json({
    accepted: true,
    inboundEmailId,
    senderKnown,
    bucket: DOCUMENT_BUCKET,
    uploads,
  });
}

function duplicateOrError(error: { code?: string; message: string }) {
  // The same invoice forwarded twice. Not an error worth retrying: the first
  // one already produced the document.
  if (error.code === "23505") {
    return Response.json({ accepted: false, reason: "already received" }, { status: 200 });
  }
  return Response.json({ error: error.message }, { status: 500 });
}
