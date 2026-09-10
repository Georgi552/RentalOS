import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setNewPassword } from "../actions";

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { error } = await searchParams;

  // The recovery link created the session. Without one there is nothing to
  // change, and sending the visitor back is clearer than an empty form.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent("Връзката е изтекла или вече е използвана. Поискай нова.")}`,
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Нова парола</h1>
      <p className="mt-1 text-sm text-neutral-500">За {user.email}</p>

      {typeof error === "string" && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={setNewPassword} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Нова парола</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <span className="mt-1 block text-xs text-neutral-500">Поне 8 символа.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Повтори паролата</span>
          <input
            type="password"
            name="confirmation"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Запази новата парола
        </button>
      </form>
    </div>
  );
}
