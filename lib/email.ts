import "server-only";

// Resend's REST API is a single POST, so no SDK is pulled in for it.
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.STATEMENT_FROM_EMAIL);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string | null;
  replyTo?: string | null;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.STATEMENT_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return {
      ok: false,
      error: "Липсва RESEND_API_KEY или STATEMENT_FROM_EMAIL в .env.local.",
    };
  }

  const from = input.fromName ? `${input.fromName} <${fromEmail}>` : fromEmail;

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: [input.replyTo] } : {}),
      }),
    });
  } catch (cause) {
    return { ok: false, error: `Няма връзка с пощенската услуга: ${String(cause)}` };
  }

  const body = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string }
    | null;

  if (!response.ok) {
    return {
      ok: false,
      error: body?.message ?? `Пощенската услуга отговори с ${response.status}.`,
    };
  }

  if (!body?.id) return { ok: false, error: "Пощенската услуга не върна идентификатор." };

  return { ok: true, id: body.id };
}
