import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const { user } = await requireUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Табло</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Влязъл като {user.email}.
      </p>
    </div>
  );
}
