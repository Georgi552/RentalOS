import Link from "next/link";
import { signUp } from "../actions";

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const { error } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Регистрация</h1>
      <p className="mt-1 text-sm text-neutral-500">
        За наемодатели с 1&ndash;20 имота.
      </p>

      {typeof error === "string" && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form action={signUp} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Име и фамилия</span>
          <input
            type="text"
            name="fullName"
            autoComplete="name"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>

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
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Поне 8 символа.
          </span>
        </label>

        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Създай акаунт
        </button>
      </form>

      <p className="mt-6 text-sm text-neutral-500">
        Вече имаш акаунт?{" "}
        <Link href="/login" className="font-medium text-neutral-900 underline">
          Влез
        </Link>
      </p>
    </div>
  );
}
