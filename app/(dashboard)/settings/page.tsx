import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Icon, type IconName } from "@/components/icons";
import { requireOrganization } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import {
  INBOUND_STATUS_LABELS,
  MAX_INBOUND_PER_DAY,
  inboundAddress,
  inboundConfigured,
  inboundDomain,
} from "@/lib/inbound";
import { removeInboundSender } from "./actions";
import {
  AddInboundSenderForm,
  ChangePasswordForm,
  InboxAddressForm,
  StatementSettingsForm,
} from "./settings-form";

// Each setting is its own card, so it is clear where one ends and the next
// begins.
function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: IconName;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3 border-b border-neutral-200 pb-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 max-w-lg text-sm text-neutral-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

type Sender = { id: string; email: string; note: string | null };

type InboundEmail = {
  id: string;
  created_at: string;
  from_address: string;
  subject: string | null;
  attachment_count: number;
  sender_known: boolean;
  status: string;
  reason: string | null;
};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { saved, password, inbox, sender, error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("organizations")
    .select(
      "name, statement_auto_send, statement_lead_days, statement_from_name, statement_reply_to, inbox_address",
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Не мога да заредя настройките: ${error.message}`);

  const { data: senderRows, error: senderError } = await supabase
    .from("organization_inbound_senders")
    .select("id, email, note")
    .eq("organization_id", organizationId)
    .order("email");

  if (senderError) throw new Error(`Не мога да заредя подателите: ${senderError.message}`);

  const { data: mailRows, error: mailError } = await supabase
    .from("inbound_emails")
    .select("id, created_at, from_address, subject, attachment_count, sender_known, status, reason")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (mailError) throw new Error(`Не мога да заредя входящата поща: ${mailError.message}`);

  const senders = (senderRows ?? []) as unknown as Sender[];
  const mail = (mailRows ?? []) as unknown as InboundEmail[];

  const configured = emailConfigured();
  const domain = inboundDomain();
  const address = inboundAddress(data?.inbox_address);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Как изглеждат справките, които получават наемателите, и откъде влизат фактурите.
      </p>

      {saved === "1" && (
        <p className="mt-4 max-w-lg rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Настройките са запазени.
        </p>
      )}

      {typeof actionError === "string" && (
        <p className="mt-4 max-w-lg rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {!configured && (
        <p className="mt-4 max-w-lg rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Изпращането на имейли не е настроено. Липсва RESEND_API_KEY или STATEMENT_FROM_EMAIL — до
          тогава справките се отварят и печатат, но не тръгват по имейл.
        </p>
      )}

      <SettingsSection
        icon="statement"
        title="Справки за наематели"
        description="Кога и от чие име тръгват месечните справки."
      >
        <StatementSettingsForm
          name={data?.name ?? ""}
          autoSend={data?.statement_auto_send ?? false}
          leadDays={data?.statement_lead_days ?? 3}
          fromName={data?.statement_from_name ?? ""}
          replyTo={data?.statement_reply_to ?? ""}
        />
      </SettingsSection>

      <SettingsSection
        icon="bills"
        title="Фактури по имейл"
        description="Препрати имейла от доставчика на адреса по-долу. PDF-ът минава по същия път като ръчно качен: прочита се, съпоставя се с имот и става сметка, когато нищо не е под съмнение."
      >
        {inbox === "1" && (
          <p className="mt-4 max-w-lg rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Адресът е сменен. Старият вече не приема поща.
          </p>
        )}

        {!inboundConfigured() ? (
          <p className="mt-4 max-w-lg rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Получаването на имейли не е настроено. Липсва INBOUND_EMAIL_DOMAIN или INBOUND_SECRET, а
            домейнът иска MX записи — до тогава нищо не влиза по пощата и фактурите се качват на
            ръка.
          </p>
        ) : (
          <p className="mt-4 max-w-lg rounded-md border border-neutral-200 px-3 py-2 text-sm">
            <span className="block text-xs text-neutral-500">Твоят адрес</span>
            <span className="font-medium break-all">{address}</span>
          </p>
        )}

        <InboxAddressForm address={data?.inbox_address ?? ""} domain={domain || "домейна"} />

        <div className="mt-8 border-t border-neutral-200 pt-6">
          <h3 className="text-sm font-semibold">Разрешени податели</h3>
          <p className="mt-1 max-w-lg text-sm text-neutral-500">
            Адресът е четим, не таен, така че всеки, който го знае, може да прати. Фактура от адрес
            в този списък може да стане сметка сама. Фактура от непознат подател влиза само за
            преглед — това е гарантирано от базата, не от приложението. Повече от{" "}
            {MAX_INBOUND_PER_DAY} писма на ден се отказват.
          </p>

          {sender === "added" && (
            <p className="mt-4 max-w-lg rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              Подателят е добавен.
            </p>
          )}
          {sender === "removed" && (
            <p className="mt-4 max-w-lg rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              Подателят е премахнат. Занапред писмата му влизат само за преглед.
            </p>
          )}

          {senders.length === 0 ? (
            <p className="mt-4 max-w-lg rounded-md border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-500">
              Няма разрешени податели. Всичко, което влезе, ще иска преглед. Добави адреса, от който
              препращаш.
            </p>
          ) : (
            <ul className="mt-4 max-w-lg divide-y divide-neutral-200 rounded-md border border-neutral-200">
              {senders.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{row.email}</span>
                    {row.note && (
                      <span className="block truncate text-xs text-neutral-500">{row.note}</span>
                    )}
                  </span>
                  <ConfirmDeleteButton
                    action={removeInboundSender.bind(null, row.id)}
                    confirmMessage={`Да премахна ли ${row.email}? Писмата му ще влизат само за преглед.`}
                    label="Премахни"
                  />
                </li>
              ))}
            </ul>
          )}

          <AddInboundSenderForm />
        </div>

        <div className="mt-8 border-t border-neutral-200 pt-6">
          <h3 className="text-sm font-semibold">Последни писма</h3>
          {mail.length === 0 ? (
            <p className="mt-4 max-w-lg rounded-md border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-500">
              Още нищо не е влизало по имейл.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-md border border-neutral-200">
              <table className="w-full text-xs">
                <thead className="border-b border-neutral-200 text-left text-neutral-500">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Кога</th>
                    <th className="px-3 py-1.5 font-medium">От</th>
                    <th className="px-3 py-1.5 text-right font-medium">PDF-и</th>
                    <th className="px-3 py-1.5 font-medium">Какво стана</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {mail.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString("bg-BG")}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="block break-all">{row.from_address}</span>
                        {row.subject && (
                          <span className="block truncate text-neutral-500">{row.subject}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">{row.attachment_count}</td>
                      <td className="px-3 py-1.5">
                        <span className="block">
                          {INBOUND_STATUS_LABELS[row.status] ?? row.status}
                          {!row.sender_known && row.status === "accepted" && " · само за преглед"}
                        </span>
                        {row.reason && <span className="block text-neutral-500">{row.reason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection icon="key" title="Парола">
        {password === "changed" && (
          <p className="mt-4 max-w-lg rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Паролата е сменена.
          </p>
        )}
        <ChangePasswordForm />
      </SettingsSection>
    </div>
  );
}
