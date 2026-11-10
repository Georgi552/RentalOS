import { signOut } from "../(auth)/actions";
import { Logo } from "@/components/brand";
import { Icon } from "@/components/icons";
import { TabNav, type NavItem } from "@/components/nav";
import { requireUser } from "@/lib/auth";

const navItems: NavItem[] = [
  { href: "/portal", label: "Справка", icon: "statement" },
  { href: "/portal/invoices", label: "Фактури", icon: "bills" },
];

// The tenant's shell. requireUser() and nothing more: the two gates that decide
// what a tenant may see - the forced password change and the lease lookup - live
// in requireTenant(), because a layout cannot tell which page it is wrapping and
// would guard the very pages it needs to send people to.
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="no-print bg-[var(--sidebar)]">
        <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-2 sm:px-6 lg:px-8">
          {/* ml-auto rather than justify-between: globals.css stacks every
              .flex.items-center.justify-between into a column on phones. */}
          <div className="flex items-center gap-4">
            <Logo href="/portal" tone="dark" size={24} />
            <span className="ml-auto hidden min-w-0 truncate text-sm text-[var(--sidebar-fg)] opacity-80 sm:inline">
              {user.email}
            </span>
            <form action={signOut} className="ml-auto sm:ml-0">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--sidebar-fg)] hover:bg-white/10 hover:text-white"
              >
                <Icon name="logout" className="h-4 w-4" />
                Изход
              </button>
            </form>
          </div>
          <div className="mt-3">
            <TabNav items={navItems} exactRoot="/portal" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
