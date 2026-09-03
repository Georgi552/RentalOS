import Link from "next/link";
import { signIn } from "../actions";

const NOTICES: Record<string, string> = {
  "check-email": "Check your inbox for a confirmation link, then sign in.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { error, notice, redirectTo } = await searchParams;
  const noticeText = typeof notice === "string" ? NOTICES[notice] : undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-neutral-500">Manage your rentals.</p>

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
        {typeof redirectTo === "string" && (
          <input type="hidden" name="redirectTo" value={redirectTo} />
        )}

        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Password</span>
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
          Sign in
        </button>
      </form>

      <p className="mt-6 text-sm text-neutral-500">
        No account?{" "}
        <Link href="/signup" className="font-medium text-neutral-900 underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
