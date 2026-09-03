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
          <Link href="/dashboard" className="font-semibold tracking-tight">
            RentalOS
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-500">{user.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-neutral-900 underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
