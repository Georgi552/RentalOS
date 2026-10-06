"use server";

// Giving a tenant a way in, and taking it away.
//
// The account is created by the landlord rather than by the tenant signing up,
// so there is no invite to accept and no email that has to arrive before
// anything works. What the tenant gets is a temporary password, shown to the
// landlord once, which the portal then forces them to replace.

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type AccountState = {
  error?: string;
  // Shown once and never stored. A lost password is replaced by a new temporary
  // one rather than read again - resetTenantPassword below.
  password?: string;
};

// No O/0, I/l/1 - this gets read out over the phone.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function temporaryPassword() {
  let out = "";
  for (let i = 0; i < 14; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

// tenantId travels in the form rather than bound into the action, so that the
// state argument is not the last one and the signature reads the way every other
// action in the app does. Tampering with it buys nothing: the lookup below is
// still scoped to the organization from the session, and a landlord is allowed
// to create an account for any tenant of their own.
export async function createTenantAccount(
  _state: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const tenantId = String(formData.get("tenant_id") ?? "");
  const { supabase, organizationId } = await requireOrganization();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, email, user_id, first_name, last_name")
    .eq("id", tenantId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) return { error: `Не мога да заредя наемателя: ${error.message}` };
  if (!tenant) return { error: "Няма такъв наемател." };
  if (tenant.user_id) return { error: "Този наемател вече има акаунт." };
  if (!tenant.email?.trim()) {
    return { error: "Наемателят няма имейл. Добави имейл и опитай пак." };
  }

  const password = temporaryPassword();
  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: tenant.email.trim(),
    password,
    // Confirming by email is off on this project, and the account was created by
    // the landlord rather than by a stranger, so there is nothing to verify.
    email_confirm: true,
    // account_type keeps the signup trigger from handing this account an
    // organization of its own. It goes in user_metadata because that is what the
    // trigger can see: GoTrue inserts the auth.users row first and applies
    // app_metadata afterwards, so an AFTER INSERT trigger reads nothing from it
    // (migration 0025 - the first account created this way became a landlord).
    //
    // must_change_password stays in app_metadata, which the tenant cannot
    // rewrite. It is only read later, so the ordering does not touch it.
    app_metadata: { account_type: "tenant", must_change_password: true },
    user_metadata: {
      account_type: "tenant",
      full_name: `${tenant.first_name} ${tenant.last_name}`,
    },
  });

  if (createError || !created.user) {
    const taken =
      createError?.message.toLowerCase().includes("already") ||
      createError?.code === "email_exists";
    return {
      error: taken
        ? "Вече има акаунт с този имейл. Използвай друг адрес."
        : `Не мога да създам акаунта: ${createError?.message ?? "неизвестна грешка"}`,
    };
  }

  // The account exists before the link does - user_id has nothing to point at
  // until then - so a failure here would leave an account nobody can reach and
  // an email address that can never be used again. Undo it.
  const { error: linkError } = await supabase
    .from("tenants")
    .update({ user_id: created.user.id })
    .eq("id", tenantId)
    .eq("organization_id", organizationId);

  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: `Не мога да свържа акаунта: ${linkError.message}` };
  }

  revalidatePath(`/tenants/${tenantId}`);
  return { password };
}

// A new temporary password for an account that already exists. Needed because
// the password is shown once: a tenant who loses it before their first login
// would otherwise have to have their account deleted and rebuilt.
//
// The account is left alone - same id, same email, same link to the tenants row.
// Only the password changes, and must_change_password goes back on, so whoever
// receives it still has to replace it.
export async function resetTenantPassword(
  _state: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const tenantId = String(formData.get("tenant_id") ?? "");
  const { supabase, organizationId } = await requireOrganization();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("user_id")
    .eq("id", tenantId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) return { error: `Не мога да заредя наемателя: ${error.message}` };
  if (!tenant?.user_id) return { error: "Този наемател няма акаунт." };

  const password = temporaryPassword();

  const { error: updateError } = await createAdminClient().auth.admin.updateUserById(
    tenant.user_id,
    {
      password,
      app_metadata: { account_type: "tenant", must_change_password: true },
    },
  );

  if (updateError) {
    return { error: `Не мога да сменя паролата: ${updateError.message}` };
  }

  revalidatePath(`/tenants/${tenantId}`);
  return { password };
}

export async function revokeTenantAccount(tenantId: string) {
  const { supabase, organizationId } = await requireOrganization();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("user_id")
    .eq("id", tenantId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !tenant?.user_id) {
    redirect(`/tenants/${tenantId}`);
  }

  // Clearing user_id first. Everything the tenant could read went through that
  // column, so this one write ends all of it, and it is the database doing the
  // ending rather than a route remembering to check.
  const { error: unlinkError } = await supabase
    .from("tenants")
    .update({ user_id: null })
    .eq("id", tenantId)
    .eq("organization_id", organizationId);

  if (unlinkError) {
    redirect(
      `/tenants/${tenantId}?error=${encodeURIComponent(`Не мога да спра достъпа: ${unlinkError.message}`)}`,
    );
  }

  // Then remove the login itself, so nothing is left that signs in to an empty
  // portal. If this fails the tenant can still get in but sees nothing, which
  // is why it goes second.
  await createAdminClient().auth.admin.deleteUser(tenant.user_id);

  revalidatePath(`/tenants/${tenantId}`);
  redirect(`/tenants/${tenantId}`);
}
