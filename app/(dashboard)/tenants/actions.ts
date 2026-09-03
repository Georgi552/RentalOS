"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";

export type TenantFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parse(formData: FormData) {
  const values = {
    first_name: text(formData, "first_name"),
    last_name: text(formData, "last_name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    notes: text(formData, "notes"),
  };

  const fieldErrors: Record<string, string> = {};

  if (!values.first_name) fieldErrors.first_name = "First name is required.";
  else if (values.first_name.length > 80) fieldErrors.first_name = "Keep it under 80 characters.";

  if (!values.last_name) fieldErrors.last_name = "Last name is required.";
  else if (values.last_name.length > 80) fieldErrors.last_name = "Keep it under 80 characters.";

  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    fieldErrors.email = "That does not look like an email address.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false as const, state: { fieldErrors, values } };
  }

  return {
    ok: true as const,
    data: {
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email || null,
      phone: values.phone || null,
      notes: values.notes || null,
    },
    values,
  };
}

export async function createTenant(
  _prev: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("tenants")
    .insert({ ...parsed.data, organization_id: organizationId })
    .select("id")
    .single();

  if (error) return { error: error.message, values: parsed.values };

  revalidatePath("/tenants");
  redirect(`/tenants/${data.id}`);
}

export async function updateTenant(
  id: string,
  _prev: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("tenants")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) return { error: error.message, values: parsed.values };

  revalidatePath("/tenants");
  revalidatePath(`/tenants/${id}`);
  redirect(`/tenants/${id}`);
}

export async function deleteTenant(id: string) {
  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("tenants")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    // leases_tenant_fkey is ON DELETE RESTRICT, so the database refuses to
    // remove a tenant that still has lease history.
    const message =
      error.code === "23503"
        ? "This tenant has leases. Delete those leases first."
        : error.message;
    redirect(`/tenants/${id}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/tenants");
  redirect("/tenants");
}
