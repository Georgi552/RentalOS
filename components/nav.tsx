"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

export type NavItem = { href: string; label: string; icon: IconName };

// A section is active on its own page and on everything beneath it, so
// /bills/123/edit still lights up "Сметки". `exact` is for a root like /portal
// that would otherwise be active everywhere.
function isActive(pathname: string, href: string, exact?: boolean) {
  if (pathname === href) return true;
  return !exact && pathname.startsWith(`${href}/`);
}

// The vertical list in the sidebar, on a dark background.
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              active
                ? "bg-white/10 text-white"
                : "text-[var(--sidebar-fg)] hover:bg-white/5 hover:text-white"
            }`}
          >
            {active && (
              <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-brand-300" />
            )}
            <Icon
              name={item.icon}
              className={`h-[18px] w-[18px] shrink-0 ${
                active ? "text-brand-300" : "text-brand-300/70 group-hover:text-brand-300"
              }`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

// The horizontal strip used on narrow screens and in the tenant portal.
export function TabNav({
  items,
  tone = "dark",
  exactRoot,
}: {
  items: NavItem[];
  tone?: "dark" | "light";
  exactRoot?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {items.map((item) => {
        const active = isActive(pathname, item.href, item.href === exactRoot);
        const cls =
          tone === "dark"
            ? active
              ? "bg-white/15 text-white"
              : "text-[var(--sidebar-fg)] hover:bg-white/10 hover:text-white"
            : active
              ? "bg-brand-50 text-brand-700"
              : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900";
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${cls}`}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
