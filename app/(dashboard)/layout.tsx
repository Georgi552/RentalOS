import Link from "next/link";
import { signOut } from "../(auth)/actions";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              RentalOS
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/dashboard" className="text-neutral-500 hover:text-neutral-900">
                Табло
              </Link>
              <Link href="/properties" className="text-neutral-500 hover:text-neutral-900">
                Имоти
              </Link>
              <Link href="/tenants" className="text-neutral-500 hover:text-neutral-900">
                Наематели
              </Link>
              <Link href="/leases" className="text-neutral-500 hover:text-neutral-900">
                Договори
              </Link>
              <Link href="/rent" className="text-neutral-500 hover:text-neutral-900">
                Плащания
              </Link>
              <Link href="/bills" className="text-neutral-500 hover:text-neutral-900">
                Сметки
              </Link>
              <Link href="/expenses" className="text-neutral-500 hover:text-neutral-900">
                Разходи
              </Link>
              <Link href="/documents" className="text-neutral-500 hover:text-neutral-900">
                Документи
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-500">{user.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-neutral-900 underline"
              >
                Изход
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
