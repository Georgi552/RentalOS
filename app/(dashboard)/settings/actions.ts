"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

export type PasswordFormState = { error?: string };

// Changing a password requires proving the current one. Without that, anyone
// who reaches an unlocked laptop, or borrows a session another way, could lock
// the owner out of their own account.
export async function changePassword(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const current = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!current) return { error: "Въведи сегашната си парола." };
  if (password.length < 8) return { error: "Новата парола трябва да е поне 8 символа." };
  if (password !== confirmation) return { error: "Двете нови пароли не съвпадат." };
  if (password === current) return { error: "Новата парола е същата като сегашната." };

  const { user } = await requireUser();
  if (!user.email) return { error: "Акаунтът няма имейл адрес." };

  const supabase = await createClient();

  // Re-authenticating is what proves the current password. It refreshes the
  // session for the same user, so nothing else changes.
  const { error: checkError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });

  if (checkError) return { error: "Сегашната парола не е вярна." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/settings?password=changed");
}
