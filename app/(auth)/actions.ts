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
