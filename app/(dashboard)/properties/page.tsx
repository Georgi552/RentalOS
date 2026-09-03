import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import type { Property } from "@/lib/types";

export default async function PropertiesPage() {
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw new Error(`Could not load properties: ${error.message}`);

  const properties = (data ?? []) as Property[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Имоти</h1>
        <Link
          href="/properties/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Добави имот
        </Link>
      </div>

      {properties.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">
            Още няма имоти. Добави първия, за да започнеш.
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {properties.map((property) => (
            <li key={property.id}>
              <Link
                href={`/properties/${property.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
              >
                <span>
                  <span className="block text-sm font-medium">{property.name}</span>
                  <span className="block text-sm text-neutral-500">
                    {[property.address, property.city].filter(Boolean).join(", ")}
                  </span>
                </span>
                <span className="text-sm text-neutral-400">{property.country}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
