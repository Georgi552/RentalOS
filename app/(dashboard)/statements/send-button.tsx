"use client";

import { useFormStatus } from "react-dom";
import { sendStatement } from "./actions";

function Submit({ label, resend }: { label: string; resend: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        resend
          ? "rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          : "rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      }
    >
      {pending ? "Изпращане..." : label}
    </button>
  );
}

export function SendStatementButton({
  leaseId,
  month,
  tenantEmail,
  alreadySent,
}: {
  leaseId: string;
  month: string;
  tenantEmail: string | null;
  alreadySent: boolean;
}) {
  if (!tenantEmail) {
    return (
      <p className="text-sm text-neutral-500">
        Наемателят няма имейл — добави го, за да можеш да изпращаш справки.
      </p>
    );
  }

  return (
    <form
      action={sendStatement.bind(null, leaseId, month)}
      onSubmit={(event) => {
        const question = alreadySent
          ? `Справката вече е изпратена. Да я изпратя ли отново на ${tenantEmail}?`
          : `Да изпратя ли справката на ${tenantEmail}?`;
        if (!confirm(question)) event.preventDefault();
      }}
    >
      <Submit
        label={alreadySent ? "Изпрати отново" : "Изпрати по имейл"}
        resend={alreadySent}
      />
    </form>
  );
}
