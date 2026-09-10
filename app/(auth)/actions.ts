"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

async function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const origin = (await headers()).get("origin");
  if (!origin) throw new Error("Cannot resolve site URL: set NEXT_PUBLIC_SITE_URL");

  return origin;
}

function backTo(path: string, message: string, redirectTo?: string) {
  const params = new URLSearchParams({ error: message });
  // Only carry the target on if it is local, so a hostile value cannot survive
  // a failed attempt and be used on the next one.
  if (redirectTo && safeRedirect(redirectTo, "") !== "") {
    params.set("redirectTo", redirectTo);
  }
  redirect(`${path}?${params}`);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "");

  if (!email || !password) {
    backTo("/login", "Въведи имейл и парола.", redirectTo);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) backTo("/login", error.message, redirectTo);

  redirect(safeRedirect(redirectTo));
}

export async function signUp(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    backTo("/signup", "Въведи имейл и парола.");
  }

  if (password.length < 8) {
    backTo("/signup", "Паролата трябва да е поне 8 символа.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null },
      emailRedirectTo: `${await siteUrl()}/auth/confirm`,
    },
  });

  if (error) backTo("/signup", error.message);

  // No session means Supabase is set to confirm emails first.
  if (!data.session) redirect("/login?notice=check-email");

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Password recovery.
//
// The reply is deliberately the same whether or not the address has an
// account: telling a stranger which emails are registered is a gift to
// someone stuffing credentials.
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect(`/forgot-password?error=${encodeURIComponent("Въведи имейл адрес.")}`);
  }

  const supabase = await createClient();

  // Supabase sends the link; /auth/confirm exchanges the token for a session
  // and then hands the visitor to the page where they choose a new password.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password`,
  });

  redirect("/forgot-password?sent=1");
}

// Reached only with a session, which the recovery link creates.
export async function setNewPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 8) {
    redirect(`/reset-password?error=${encodeURIComponent("Паролата трябва да е поне 8 символа.")}`);
  }
  if (password !== confirmation) {
    redirect(`/reset-password?error=${encodeURIComponent("Двете пароли не съвпадат.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?error=${encodeURIComponent("Връзката за смяна на парола е изтекла. Поискай нова.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard?password=changed");
}
