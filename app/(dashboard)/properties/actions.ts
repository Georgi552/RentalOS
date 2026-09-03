"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";

export type PropertyFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

type ParsedProperty = {
  name: string;
  address: string;
  city: string | null;
  postal_code: string | null;
  country: string;
  notes: string | null;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parse(formData: FormData):
  | { ok: true; data: ParsedProperty }
  | { ok: false; state: PropertyFormState } {
  const values = {
    name: text(formData, "name"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    postal_code: text(formData, "postal_code"),
    country: text(formData, "country").toUpperCase(),
    notes: text(formData, "notes"),
  };

  const fieldErrors: Record<string, string> = {};

  if (!values.name) fieldErrors.name = "Name is required.";
  else if (values.name.length > 120) fieldErrors.name = "Keep the name under 120 characters.";

  if (!values.address) fieldErrors.address = "Address is required.";
  else if (values.address.length > 300) fieldErrors.address = "Keep the address under 300 characters.";

  if (!values.country) fieldErrors.country = "Country is required.";
  else if (!/^[A-Z]{2}$/.test(values.country))
    fieldErrors.country = "Use a 2-letter country code, for example BG.";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, state: { fieldErrors, values } };
  }

  return {
    ok: true,
    data: {
      name: values.name,
      address: values.address,
      city: values.city || null,
      postal_code: values.postal_code || null,
      country: values.country,
      notes: values.notes || null,
    },
  };
}

export async function createProperty(
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("properties")
    .insert({ ...parsed.data, organization_id: organizationId })
    .select("id")
    .single();

  if (error) {
    return { error: error.message, values: Object.fromEntries(
      Object.entries(parsed.data).map(([k, v]) => [k, v ?? ""]),
    ) };
  }

  revalidatePath("/properties");
  redirect(`/properties/${data.id}`);
}

export async function updateProperty(
  id: string,
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  // organization_id is also enforced by RLS; filtering here keeps the update
  // scoped even if a policy is ever loosened.
  const { error } = await supabase
    .from("properties")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    return { error: error.message, values: Object.fromEntries(
      Object.entries(parsed.data).map(([k, v]) => [k, v ?? ""]),
    ) };
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  redirect(`/properties/${id}`);
}

export async function deleteProperty(id: string) {
  const { supabase, organizationId } = await requireOrganization();

  // Deleting a property cascades to its leases, bills and expenses. Refuse
  // while a lease exists so financial history is never silently destroyed.
  const { count, error: countError } = await supabase
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("property_id", id)
    .eq("organization_id", organizationId);

  if (countError) {
    redirect(`/properties/${id}?error=${encodeURIComponent(countError.message)}`);
  }

  if (count && count > 0) {
    redirect(
      `/properties/${id}?error=${encodeURIComponent(
        "This property has leases. Delete or end them first.",
      )}`,
    );
  }

  const { error } = await supabase
    .from("properties")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    redirect(`/properties/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/properties");
  redirect("/properties");
}
