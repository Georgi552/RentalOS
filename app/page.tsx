import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">RentalOS</h1>
        <p className="mt-3 text-neutral-500">
          Rent, tenants, and paperwork for private landlords with 1&ndash;20
          properties.
        </p>

        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
