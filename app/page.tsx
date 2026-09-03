import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">RentalOS</h1>
        <p className="mt-3 text-neutral-500">
          Наеми, наематели и документи за частни наемодатели с 1&ndash;20
          имота.
        </p>

        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Започни
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Вход
          </Link>
        </div>
      </div>
    </main>
  );
}
