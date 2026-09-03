"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
  if (redirectTo) params.set("redirectTo", redirectTo);
  redirect(`${path}?${params}`);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "");

  if (!email || !password) {
    backTo("/login", "Enter your email and password.", redirectTo);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) backTo("/login", error.message, redirectTo);

  redirect(redirectTo || "/dashboard");
}

export async function signUp(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    backTo("/signup", "Enter your email and password.");
  }

  if (password.length < 8) {
    backTo("/signup", "Password must be at least 8 characters.");
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
