import { signOut } from "../(auth)/actions";
import { Logo } from "@/components/brand";
import { Icon } from "@/components/icons";
import { SidebarNav, TabNav, type NavItem } from "@/components/nav";
import { requireOrganization } from "@/lib/auth";

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Табло", icon: "dashboard" },
  { href: "/properties", label: "Имоти", icon: "properties" },
  { href: "/tenants", label: "Наематели", icon: "tenants" },
  { href: "/leases", label: "Договори", icon: "leases" },
  { href: "/rent", label: "Плащания", icon: "rent" },
  { href: "/bills", label: "Сметки", icon: "bills" },
  { href: "/expenses", label: "Разходи", icon: "expenses" },
  { href: "/documents", label: "Документи", icon: "documents" },
  { href: "/settings", label: "Настройки", icon: "settings" },
];

// requireOrganization() rather than requireUser(), so that every page in this
// group is landlord-only without each one having to remember. A tenant is sent
// to /portal from here. The two pages that are only a form - properties/new and
// tenants/new - read nothing and so had no guard of their own.
//
// Route handlers do not render layouts, which is what lets
// /documents/[id]/download serve both audiences.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireOrganization();

  return (
    <div className="flex min-h-full flex-1">
      {/* Sidebar from lg up. */}
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-[var(--sidebar)] px-4 py-5 lg:flex">
        <Logo href="/dashboard" tone="dark" size={28} className="px-2" />

        <div className="mt-8 flex-1 overflow-y-auto">
          <SidebarNav items={navItems} />
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="truncate px-3 text-xs text-[var(--sidebar-fg)] opacity-80">
            {user.email}
          </p>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--sidebar-fg)] hover:bg-white/5 hover:text-white"
            >
              <Icon name="logout" className="h-[18px] w-[18px] text-brand-300/70" />
              Изход
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar below lg. */}
        <header className="no-print bg-[var(--sidebar)] px-4 pt-3 pb-2 sm:px-6 lg:hidden">
          {/* ml-auto rather than justify-between: globals.css stacks every
              .flex.items-center.justify-between into a column on phones. */}
          <div className="flex items-center gap-4">
            <Logo href="/dashboard" tone="dark" size={24} />
            <form action={signOut} className="ml-auto">
              <button
                type="submit"
                aria-label="Изход"
                title={user.email ?? undefined}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--sidebar-fg)] hover:bg-white/10 hover:text-white"
              >
                <Icon name="logout" className="h-4 w-4" />
                <span className="hidden sm:inline">Изход</span>
              </button>
            </form>
          </div>
          <div className="mt-3">
            <TabNav items={navItems} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
