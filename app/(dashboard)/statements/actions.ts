"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { buildStatement } from "@/lib/statement";
import { statementHtml, statementSubject, statementText } from "@/lib/statement-email";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SendOutcome = { ok: true } | { ok: false; error: string };

// Shared by the button and the cron, so a scheduled send and a manual one can
// never drift apart.
export async function sendStatementFor(
  supabase: SupabaseClient,
  organizationId: string,
  leaseId: string,
  month: string,
  trigger: "manual" | "scheduled",
): Promise<SendOutcome> {
  const statement = await buildStatement(supabase, organizationId, leaseId, month);

  if (!statement) return { ok: false, error: "Няма справка за този месец." };
  if (!statement.tenantEmail) {
    return { ok: false, error: "Наемателят няма имейл адрес. Добави го в профила му." };
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("statement_from_name, statement_reply_to")
    .eq("id", organizationId)
    .maybeSingle();

  const result = await sendEmail({
    to: statement.tenantEmail,
    subject: statementSubject(statement),
    html: statementHtml(statement),
    text: statementText(statement),
    fromName: organization?.statement_from_name ?? statement.organizationName,
    replyTo: organization?.statement_reply_to ?? null,
  });

  const snapshot = {
    organization_id: organizationId,
    lease_id: leaseId,
    period_month: `${month}-01`,
    sent_to: statement.tenantEmail,
    trigger,
    currency: statement.currency,
    rent_due: statement.rentDue,
    bills_due: statement.billsDue,
    expenses_due: statement.expensesDue,
    charges: statement.charges,
    balance_before: statement.balanceBefore,
    total_due: statement.totalDue,
  };

  if (!result.ok) {
    await supabase
      .from("statement_sends")
      .insert({ ...snapshot, status: "failed", error: result.error });
    return { ok: false, error: result.error };
  }

  // A resend replaces the previous success, which the partial unique index
  // would otherwise refuse.
  await supabase
    .from("statement_sends")
    .delete()
    .eq("lease_id", leaseId)
    .eq("period_month", `${month}-01`)
    .eq("organization_id", organizationId)
    .eq("status", "sent");

  const { error } = await supabase
    .from("statement_sends")
    .insert({ ...snapshot, status: "sent", provider_message_id: result.id });

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function sendStatement(leaseId: string, month: string) {
  const { supabase, organizationId } = await requireOrganization();
  const result = await sendStatementFor(supabase, organizationId, leaseId, month, "manual");

  revalidatePath("/dashboard");
  revalidatePath(`/statements/${leaseId}/${month}`);

  const target = `/statements/${leaseId}/${month}`;
  redirect(
    result.ok
      ? `${target}?sent=1`
      : `${target}?error=${encodeURIComponent(result.error)}`,
  );
}
