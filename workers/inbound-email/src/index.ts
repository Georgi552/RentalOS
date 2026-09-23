import PostalMime from "postal-mime";
import { createClient } from "@supabase/supabase-js";

// Receives mail for the inbound addresses and does as little as possible with
// it: parse, keep the PDFs, upload them, then hand over to the app.
//
// Why the work is split this way:
//
//   - The PDFs never pass through the Next.js app. Vercel caps a request body at
//     roughly 4.5 MB and an invoice may be 10 MB, so the Worker uploads straight
//     to Supabase Storage with a short-lived signed URL the app issues.
//   - Uploading with a signed token needs no RLS permissions, so the anon key is
//     enough here and SUPABASE_SERVICE_ROLE_KEY stays in the app alone.
//   - Every decision about whose invoice this is, whether the sender is trusted
//     and whether a bill may be written lives in the app. Duplicating any of it
//     here is how the ledger and the statement came to disagree once already.

// Typed structurally rather than against @cloudflare/workers-types, so this file
// compiles with only the two runtime dependencies installed.
type ForwardableEmailMessage = {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;
  setReject(reason: string): void;
};

type Env = {
  APP_URL: string;
  INBOUND_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

type Upload = {
  documentId: string;
  filename: string;
  path: string;
  token: string;
};

type AcceptResponse =
  | { accepted: true; inboundEmailId: string; bucket: string; uploads: Upload[] }
  | { accepted: false; reason?: string };

// A mail far larger than a plausible invoice is refused before it is parsed.
// postal-mime's own limits guard nesting, not sheer size.
const MAX_RAW_BYTES = 25 * 1024 * 1024;

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (!env.APP_URL || !env.INBOUND_SECRET || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      // Rejecting is better than dropping: the sender gets a bounce and the
      // invoice is not silently lost while the Worker is misconfigured.
      message.setReject("Inbound processing is not configured");
      return;
    }

    if (message.rawSize > MAX_RAW_BYTES) {
      message.setReject("Message too large");
      return;
    }

    const email = await PostalMime.parse(message.raw);

    // The envelope recipient, not the parsed To: header. A forwarded invoice
    // still carries the provider's original To:, so the header would route mail
    // to whoever the provider addressed rather than to the landlord's inbox.
    const to = message.to;
    const from = email.from?.address ?? message.from;
    const messageId =
      email.messageId ?? message.headers.get("message-id") ?? `<no-id-${Date.now()}@worker>`;

    const pdfs = email.attachments.filter((attachment) => {
      const name = attachment.filename ?? "";
      const isPdf =
        attachment.mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf");
      return isPdf && attachment.content instanceof ArrayBuffer;
    });

    const accept = await post<AcceptResponse>(env, "/api/inbound/email", {
      messageId,
      from,
      to,
      subject: email.subject ?? null,
      attachments: pdfs.map((attachment, index) => ({
        filename: attachment.filename || `faktura-${index + 1}.pdf`,
        size: (attachment.content as ArrayBuffer).byteLength,
      })),
    });

    // Only an unrecognised recipient is rejected at the door. Everything else has
    // already been journalled by the app, and bouncing it would tell a stranger
    // which addresses exist.
    if (accept.status === 404) {
      message.setReject("No such recipient");
      return;
    }

    if (!accept.ok || !accept.body || accept.body.accepted !== true) {
      // Accepted-and-ignored is a normal outcome: a mail with no PDF, a
      // duplicate, or one over the daily cap. The journal says which.
      return;
    }

    const { inboundEmailId, bucket, uploads } = accept.body;

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const upload of uploads) {
      const attachment = pdfs.find(
        (candidate, index) =>
          (candidate.filename || `faktura-${index + 1}.pdf`) === upload.filename,
      );
      if (!attachment) continue;

      const { error } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(upload.path, upload.token, attachment.content as ArrayBuffer, {
          contentType: "application/pdf",
        });

      if (error) {
        // The document row exists and stays in "processing", which is visible in
        // the app rather than silently absent.
        console.error(`upload failed for ${upload.path}: ${error.message}`);
      }
    }

    await post(env, "/api/inbound/analyze", { inboundEmailId });
  },
};

async function post<T>(
  env: Env,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  const response = await fetch(`${env.APP_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.INBOUND_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let parsed: T | null = null;
  try {
    parsed = (await response.json()) as T;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    console.error(`${path} responded ${response.status}`);
  }

  return { ok: response.ok, status: response.status, body: parsed };
}
