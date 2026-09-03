import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import type { Property } from "@/lib/types";
import { DeleteButton } from "../delete-button";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-4 py-2">
      <dt className="w-32 shrink-0 text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm">{value?.trim() ? value : <span className="text-neutral-400">&mdash;</span>}</dd>
    </div>
  );
}

export default async function PropertyPage({
  params,
  searchParams,
}: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Could not load property: ${error.message}`);
  if (!data) notFound();

  const property = data as Property;

  return (
    <div>
      <Link href="/properties" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Properties
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{property.name}</h1>
        <div className="flex items-center gap-4">
          <Link
            href={`/properties/${property.id}/edit`}
            className="text-sm font-medium text-neutral-900 hover:underline"
          >
            Edit
          </Link>
          <DeleteButton id={property.id} name={property.name} />
        </div>
      </div>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 px-4 py-2">
        <Row label="Address" value={property.address} />
        <Row label="City" value={property.city} />
        <Row label="Postal code" value={property.postal_code} />
        <Row label="Country" value={property.country} />
        <Row label="Notes" value={property.notes} />
      </dl>
    </div>
  );
}
