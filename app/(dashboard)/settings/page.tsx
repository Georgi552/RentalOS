import { requireOrganization } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { ChangePasswordForm, StatementSettingsForm } from "./settings-form";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { saved, password } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("organizations")
    .select("name, statement_auto_send, statement_lead_days, statement_from_name, statement_reply_to")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Не мога да заредя настройките: ${error.message}`);

  const configured = emailConfigured();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Как изглеждат справките, които получават наемателите.
      </p>

      {saved === "1" && (
        <p className="mt-4 max-w-lg rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Настройките са запазени.
        </p>
      )}

      {!configured && (
        <p className="mt-4 max-w-lg rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Изпращането на имейли не е настроено. Липсва RESEND_API_KEY или
          STATEMENT_FROM_EMAIL — до тогава справките се отварят и печатат, но не
          тръгват по имейл.
        </p>
      )}

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Справки за наематели</h2>

      <StatementSettingsForm
        name={data?.name ?? ""}
        autoSend={data?.statement_auto_send ?? false}
        leadDays={data?.statement_lead_days ?? 3}
        fromName={data?.statement_from_name ?? ""}
        replyTo={data?.statement_reply_to ?? ""}
      />

      <h2 className="mt-12 text-lg font-semibold tracking-tight">Парола</h2>
      {password === "changed" && (
        <p className="mt-4 max-w-lg rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Паролата е сменена.
        </p>
      )}
      <ChangePasswordForm />
    </div>
  );
}
