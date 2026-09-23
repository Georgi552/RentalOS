import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Shared by both inbound routes. The Worker is the only caller, and it proves
// itself with a secret the app also holds.
//
// A weaker check was tempting - the address is unguessable enough, the Worker is
// ours - but this endpoint writes into a landlord's books, so it refuses to run
// rather than defaulting to open. Same reasoning as /api/cron/statements.
export function authorizeInbound(request: Request):
  | { ok: true }
  | { ok: false; response: Response } {
  const secret = process.env.INBOUND_SECRET;

  if (!secret) {
    return {
      ok: false,
      response: Response.json({ error: "INBOUND_SECRET is not set" }, { status: 500 }),
    };
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }

  return { ok: true };
}

export { createAdminClient };
