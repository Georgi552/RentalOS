import { createAdminClient } from "@/lib/supabase/admin";
import { sendStatementFor } from "@/app/(dashboard)/statements/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs once a day. A statement goes out statement_lead_days before the lease's
// own rent_due_day, so each lease is billed on its own cycle.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  // Without a secret this endpoint would let anyone on the internet mail every
  // tenant, so it refuses to run rather than defaulting to open.
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date();
  const dayOfMonth = today.getUTCDate();
  const month = today.toISOString().slice(0, 7);
  const period = `${month}-01`;

  const { data: leases, error } = await admin
    .from("leases")
    .select(
      "id, organization_id, rent_due_day, organization:organizations!inner(statement_auto_send, statement_lead_days)",
    )
    .eq("status", "active")
    .eq("organization.statement_auto_send", true);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const due = ((leases ?? []) as unknown as {
    id: string;
    organization_id: string;
    rent_due_day: number;
    organization: { statement_lead_days: number } | null;
  }[]).filter((lease) => {
    const lead = lease.organization?.statement_lead_days ?? 3;
    // Clamped at 1: a lead longer than the due day would fall in the previous
    // month, and the statement is for this one.
    const sendDay = Math.max(1, lease.rent_due_day - lead);
    return sendDay === dayOfMonth;
  });

  const results: { lease: string; status: string; error?: string }[] = [];

  for (const lease of due) {
    // Never mail the same tenant twice for one month, whatever restarts.
    const { data: already } = await admin
      .from("statement_sends")
      .select("id")
      .eq("lease_id", lease.id)
      .eq("period_month", period)
      .eq("status", "sent")
      .maybeSingle();

    if (already) {
      results.push({ lease: lease.id, status: "skipped" });
      continue;
    }

    const outcome = await sendStatementFor(
      admin,
      lease.organization_id,
      lease.id,
      month,
      "scheduled",
    );

    results.push(
      outcome.ok
        ? { lease: lease.id, status: "sent" }
        : { lease: lease.id, status: "failed", error: outcome.error },
    );
  }

  return Response.json({ month, dayOfMonth, considered: due.length, results });
}
