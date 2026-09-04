import Link from "next/link";
import { safeRedirect } from "@/lib/safe-redirect";
import { signIn } from "../actions";

const NOTICES: Record<string, string> = {
  "check-email": "Провери имейла си за линк за потвърждение, после влез.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { error, notice, redirectTo } = await searchParams;
  // Sanitised here too, so an off-site value never even reaches the DOM.
  const safeTarget =
    typeof redirectTo === "string" ? safeRedirect(redirectTo, "") : "";
  const noticeText = typeof notice === "string" ? NOTICES[notice] : undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Вход</h1>
      <p className="mt-1 text-sm text-neutral-500">Управлявай наемите си.</p>

      {noticeText && (
        <p className="mt-6 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
          {noticeText}
        </p>
      )}

      {typeof error === "string" && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form action={signIn} className="mt-6 space-y-4">
        {safeTarget && <input type="hidden" name="redirectTo" value={safeTarget} />}

        <label className="block">
          <span className="text-sm font-medium">Имейл</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Парола</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Вход
        </button>
      </form>

      <p className="mt-6 text-sm text-neutral-500">
        Нямаш акаунт?{" "}
        <Link href="/signup" className="font-medium text-neutral-900 underline">
          Регистрирай се
        </Link>
      </p>
    </div>
  );
}
