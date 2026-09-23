"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization, requireUser } from "@/lib/auth";
import {
  normalizeEmail,
  validateInboxAddress,
  validateSenderEmail,
} from "@/lib/inbound";
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

export type InboundFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

// The landlord owns their inbox address and may change it, which is the whole
// reason it is readable rather than a generated token. Changing it retires the
// old one immediately: mail sent to it afterwards no longer resolves to an
// organization and is refused at the door.
export async function updateInboxAddress(
  _prev: InboundFormState,
  formData: FormData,
): Promise<InboundFormState> {
  const address = text(formData, "inbox_address").toLowerCase();

  const problem = validateInboxAddress(address);
  if (problem) return { fieldErrors: { inbox_address: problem } };

  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("organizations")
    .update({ inbox_address: address })
    .eq("id", organizationId);

  if (error) {
    // The unique index is the real guard. Another landlord may hold this
    // address, and saying so is not a leak: an address is meant to be known.
    if (error.code === "23505") {
      return { fieldErrors: { inbox_address: "Този адрес е зает. Избери друг." } };
    }
    return { error: error.message };
  }

  revalidatePath("/settings");
  redirect("/settings?inbox=1");
}

// A sender on this list can have an invoice turned into a bill without anyone
// looking at it, so adding one is a real grant of trust, not a convenience.
export async function addInboundSender(
  _prev: InboundFormState,
  formData: FormData,
): Promise<InboundFormState> {
  const email = normalizeEmail(text(formData, "email"));
  const note = text(formData, "note");

  const problem = validateSenderEmail(email);
  if (problem) return { fieldErrors: { email: problem } };

  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("organization_inbound_senders")
    .insert({ organization_id: organizationId, email, note: note || null });

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { email: "Този подател вече е в списъка." } };
    }
    return { error: error.message };
  }

  revalidatePath("/settings");
  redirect("/settings?sender=added");
}

export async function removeInboundSender(id: string) {
  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("organization_inbound_senders")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings");
  redirect("/settings?sender=removed");
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
