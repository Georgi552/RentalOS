"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";

export type SettingsFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function updateStatementSettings(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const name = text(formData, "name");
  const autoSend = Boolean(formData.get("statement_auto_send"));
  const leadDaysRaw = text(formData, "statement_lead_days") || "3";
  const fromName = text(formData, "statement_from_name");
  const replyTo = text(formData, "statement_reply_to");

  const fieldErrors: Record<string, string> = {};

  // The organization name heads every tenant statement, so it cannot be blank.
  if (!name) fieldErrors.name = "Името е задължително — показва се на наемателя.";
  else if (name.length > 120) fieldErrors.name = "Името да е под 120 символа.";

  const leadDays = Number(leadDaysRaw);
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 20) {
    fieldErrors.statement_lead_days = "Избери между 0 и 20 дни.";
  }

  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    fieldErrors.statement_reply_to = "Това не изглежда като имейл адрес.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      statement_auto_send: autoSend,
      statement_lead_days: leadDays,
      statement_from_name: fromName || null,
      statement_reply_to: replyTo || null,
    })
    .eq("id", organizationId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
