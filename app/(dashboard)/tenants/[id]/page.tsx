import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { requireOrganization } from "@/lib/auth";
import { LEASE_STATUS_LABELS, label } from "@/lib/labels";
import { balanceNote, balanceTone, monthLabel } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { tenantName, type Tenant } from "@/lib/types";
import { deleteTenant } from "../actions";

type LeaseRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: string;
  currency: string;
  status: string;
  property: { name: string } | null;
};

export default async function TenantPage({
  params,
  searchParams,
}: PageProps<"/tenants/[id]">) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load tenant: ${error.message}`);
  if (!data) notFound();

  const tenant = data as Tenant;

  const { data: leaseData, error: leaseError } = await supabase
    .from("leases")
    .select("id, start_date, end_date, monthly_rent::text, currency, status, property:properties(name)")
    .eq("tenant_id", id)
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });

  if (leaseError) throw new Error(`Could not load leases: ${leaseError.message}`);

  const leases = (leaseData ?? []) as unknown as LeaseRow[];

  // The newest ledger row per lease carries the balance for that lease.
  const { data: ledgerData, error: ledgerError } = await supabase
    .from("lease_monthly_ledger")
    .select("lease_id, currency, month, balance::text, property:properties(name)")
    .eq("tenant_id", id)
    .eq("organization_id", organizationId)
    .order("month", { ascending: false });

  if (ledgerError) throw new Error(`Не мога да заредя баланса: ${ledgerError.message}`);

  const latest = new Map<
    string,
    { lease_id: string; currency: string; month: string; balance: string; property: { name: string } | null }
  >();
  for (const row of (ledgerData ?? []) as unknown as {
    lease_id: string;
    currency: string;
    month: string;
    balance: string;
    property: { name: string } | null;
  }[]) {
    if (!latest.has(row.lease_id)) latest.set(row.lease_id, row);
  }
  const balances = [...latest.values()];

  return (
    <div>
      <Link href="/tenants" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Наематели
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{tenantName(tenant)}</h1>
        <div className="flex items-center gap-4">
          <Link
            href={`/tenants/${tenant.id}/edit`}
            className="text-sm font-medium text-neutral-900 hover:underline"
          >
            Редактирай
          </Link>
          <ConfirmDeleteButton
            action={deleteTenant.bind(null, tenant.id)}
            confirmMessage={`Да изтрия ли ${tenantName(tenant)}? Действието е необратимо.`}
          />
        </div>
      </div>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 px-4 py-2">
        {[
          ["Имейл", tenant.email],
          ["Телефон", tenant.phone],
          ["Бележки", tenant.notes],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-4 py-2">
            <dt className="w-32 shrink-0 text-sm text-neutral-500">{label}</dt>
            <dd className="text-sm">
              {value?.trim() ? value : <span className="text-neutral-400">&mdash;</span>}
            </dd>
          </div>
        ))}
      </dl>

      {balances.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold tracking-tight">Баланс</h2>
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {balances.map((row) => (
              <li key={row.lease_id} className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="block text-sm font-medium">
                    {row.property?.name ?? "Непознат имот"}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    към {monthLabel(row.month)}
                  </span>
                </span>
                <span className={`text-right text-sm font-medium ${balanceTone(row.balance)}`}>
                  {formatMoney(row.balance.replace("-", ""), row.currency)}
                  <span className="block text-xs font-normal">{balanceNote(row.balance)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Договори</h2>
      {leases.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Този наемател още няма договори.</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {leases.map((lease) => (
            <li key={lease.id}>
              <Link
                href={`/leases/${lease.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {lease.property?.name ?? "Непознат имот"}
                  </span>
                  <span className="block text-sm text-neutral-500">
                    от {lease.start_date}
                    {lease.end_date ? ` до ${lease.end_date}` : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm">
                    {formatMoney(lease.monthly_rent, lease.currency)}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {label(LEASE_STATUS_LABELS, lease.status)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
