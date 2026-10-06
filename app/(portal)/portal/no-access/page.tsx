import { requireUser } from "@/lib/auth";

// Where requireTenant() sends an account that is neither a landlord's nor
// attached to a lease. The usual cause is access that was stopped - the account
// outlives the link for as long as it takes the deletion to go through - and the
// rest is a half-finished setup. Either way it is the landlord's to fix, so the
// page says so instead of pretending something is broken.
export default async function PortalNoAccessPage() {
  const { user } = await requireUser();

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Няма свързан имот</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Акаунтът {user.email} не е свързан с договор за наем. Ако това е грешка,
        обърни се към наемодателя си.
      </p>
    </div>
  );
}
