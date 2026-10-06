import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

// requireUser() rather than requireTenant(), because requireTenant() redirects
// here. Nothing of the tenant's data is on this page, so a user who has no lease
// yet can still set their password.
export default async function PortalPasswordPage() {
  await requireUser();

  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Избери своя парола</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Влезе с временна парола, която наемодателят ти даде. Смени я с твоя, за да
        продължиш.
      </p>

      <PasswordForm />
    </div>
  );
}
