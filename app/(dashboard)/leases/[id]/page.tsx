import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { requireOrganization } from "@/lib/auth";
import {
  BILL_TYPE_LABELS,
  COLLECTION_SHORT,
  LEASE_STATUS_LABELS,
  PAYER_LABELS,
  label,
} from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { deleteLease } from "../actions";

type LeaseDetail = {
  id: string;
  property_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: string;
  deposit: string | null;
  currency: string;
  rent_due_day: number;
  status: string;
  notes: string | null;
  property: { id: string; name: string } | null;
  tenant: { id: string; first_name: string; last_name: string } | null;
};

export default async function LeasePage({
  params,
  searchParams,
}: PageProps<"/leases/[id]">) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("leases")
    .select(
      "id, property_id, tenant_id, start_date, end_date, monthly_rent::text, deposit::text, currency, rent_due_day, status, notes, property:properties(id, name), tenant:tenants(id, first_name, last_name)",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load lease: ${error.message}`);
  if (!data) notFound();

  const { data: termData, error: termError } = await supabase
    .from("lease_bill_terms")
    .select("bill_type, payer, collection")
    .eq("lease_id", id)
    .eq("organization_id", organizationId);

  if (termError) throw new Error(`Не мога да заредя условията: ${termError.message}`);

  const terms = (termData ?? []) as {
    bill_type: string;
    payer: "landlord" | "tenant";
    collection: "via_rent" | "direct" | "not_applicable";
  }[];

  const lease = data as unknown as LeaseDetail;
  const tenantLabel = lease.tenant
    ? `${lease.tenant.first_name} ${lease.tenant.last_name}`
    : "Непознат наемател";

  return (
    <div>
      <Link href="/leases" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Договори
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {lease.property?.name ?? "Непознат имот"}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{tenantLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={`/leases/${lease.id}/edit`}
            className="text-sm font-medium text-neutral-900 hover:underline"
          >
            Редактирай
          </Link>
          <ConfirmDeleteButton
            action={deleteLease.bind(null, lease.id)}
            confirmMessage="Да изтрия ли този договор? Действието е необратимо."
          />
        </div>
      </div>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 px-4 py-2">
        <div className="flex gap-4 py-2">
          <dt className="w-36 shrink-0 text-sm text-neutral-500">Имот</dt>
          <dd className="text-sm">
            {lease.property ? (
              <Link href={`/properties/${lease.property.id}`} className="underline">
                {lease.property.name}
              </Link>
            ) : (
              <span className="text-neutral-400">&mdash;</span>
            )}
          </dd>
        </div>
        <div className="flex gap-4 py-2">
          <dt className="w-36 shrink-0 text-sm text-neutral-500">Наемател</dt>
          <dd className="text-sm">
            {lease.tenant ? (
              <Link href={`/tenants/${lease.tenant.id}`} className="underline">
                {tenantLabel}
              </Link>
            ) : (
              <span className="text-neutral-400">&mdash;</span>
            )}
          </dd>
        </div>
        {[
          ["Статус", label(LEASE_STATUS_LABELS, lease.status)],
          ["Начална дата", lease.start_date],
          ["Крайна дата", lease.end_date ?? null],
          ["Месечен наем", formatMoney(lease.monthly_rent, lease.currency)],
          ["Депозит", lease.deposit ? formatMoney(lease.deposit, lease.currency) : null],
          ["Ден за плащане", String(lease.rent_due_day)],
          ["Бележки", lease.notes],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-4 py-2">
            <dt className="w-36 shrink-0 text-sm text-neutral-500">{label}</dt>
            <dd className="text-sm">
              {value ? value : <span className="text-neutral-400">&mdash;</span>}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Сметки</h2>
      {terms.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          Няма записани условия за сметките.{" "}
          <Link href={`/leases/${lease.id}/edit`} className="underline">
            Добави ги
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {terms.map((term) => (
            <li
              key={term.bill_type}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-sm">{label(BILL_TYPE_LABELS, term.bill_type)}</span>
              <span className="text-right">
                <span className="block text-sm">{label(PAYER_LABELS, term.payer)}</span>
                {term.payer === "tenant" && (
                  <span className="block text-xs text-neutral-500">
                    {label(COLLECTION_SHORT, term.collection)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
