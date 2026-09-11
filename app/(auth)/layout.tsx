export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex w-full flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
