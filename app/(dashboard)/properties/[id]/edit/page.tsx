import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import type { Property } from "@/lib/types";
import { updateProperty } from "../../actions";
import { PropertyForm } from "../../property-form";

export default async function EditPropertyPage({
  params,
}: PageProps<"/properties/[id]/edit">) {
  const { id } = await params;
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
      <Link
        href={`/properties/${property.id}`}
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        &larr; {property.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit property</h1>

      <PropertyForm
        action={updateProperty.bind(null, property.id)}
        property={property}
        submitLabel="Save changes"
        cancelHref={`/properties/${property.id}`}
      />
    </div>
  );
}
