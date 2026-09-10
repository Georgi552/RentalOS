import Link from "next/link";
import { requestPasswordReset } from "../actions";

export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  const { error, sent } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Забравена парола</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Ще ти изпратим връзка за смяна на паролата.
      </p>

      {sent === "1" && (
        <p className="mt-6 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Ако има акаунт с този адрес, писмото вече пътува. Провери и папката със
          спам.
        </p>
      )}

      {typeof error === "string" && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form action={requestPasswordReset} className="mt-6 space-y-4">
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

        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Изпрати връзка
        </button>
      </form>

      <p className="mt-6 text-sm text-neutral-500">
        <Link href="/login" className="font-medium text-neutral-900 underline">
          Обратно към вход
        </Link>
      </p>
    </div>
  );
}
