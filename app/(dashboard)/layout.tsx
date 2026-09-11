import Link from "next/link";
import { signOut } from "../(auth)/actions";
import { requireUser } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Табло" },
  { href: "/properties", label: "Имоти" },
  { href: "/tenants", label: "Наематели" },
  { href: "/leases", label: "Договори" },
  { href: "/rent", label: "Плащания" },
  { href: "/bills", label: "Сметки" },
  { href: "/expenses", label: "Разходи" },
  { href: "/documents", label: "Документи" },
  { href: "/settings", label: "Настройки" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="no-print border-b border-neutral-200">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0 lg:flex lg:items-center lg:gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              RentalOS
            </Link>
            <nav className="-mx-4 mt-3 flex gap-4 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0 lg:mt-0">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="shrink-0 whitespace-nowrap text-neutral-500 hover:text-neutral-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex min-w-0 items-center gap-4">
            <span className="min-w-0 truncate text-sm text-neutral-500">{user.email}</span>
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
