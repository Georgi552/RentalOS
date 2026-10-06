"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type PasswordState = {
  error?: string;
};

// The tenant replacing the temporary password the landlord read out to them.
//
// Clearing must_change_password needs the service role: it lives in app
// metadata precisely so the tenant cannot clear it on their own, which also
// means they cannot clear it as a side effect of setting a password.
export async function setOwnPassword(
  _state: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const { supabase, user } = await requireUser();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: "Паролата да е поне 8 символа." };
  if (password !== confirm) return { error: "Двете пароли не съвпадат." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: `Не мога да сменя паролата: ${error.message}` };

  // The password is already changed at this point. If the flag survives, the
  // tenant lands back on this page and sets the same password again - annoying,
  // but it never leaves them locked out, which is why the order is this way
  // round.
  const admin = createAdminClient();
  const { error: flagError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, must_change_password: false },
  });

  if (flagError) {
    return {
      error:
        "Паролата е сменена, но нещо се обърка. Излез и влез отново с новата парола.",
    };
  }

  redirect("/portal");
}
