import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { safeRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// Landing point for the confirmation link in Supabase auth emails.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // A recovery link asks to continue at /reset-password. Validated, because
  // it arrives in the URL and would otherwise be an open redirect.
  const next = safeRedirect(searchParams.get("next"));

  if (!tokenHash || !type) {
    redirect("/login?error=" + encodeURIComponent("Невалиден линк за потвърждение"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(next);
}
