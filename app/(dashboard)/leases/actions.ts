"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { parseMoney } from "@/lib/money";

export type LeaseFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const STATUSES = ["draft", "active", "ended"];
const CURRENCIES = ["EUR", "BGN"];

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parse(formData: FormData) {
  const values = {
    property_id: text(formData, "property_id"),
    tenant_id: text(formData, "tenant_id"),
    start_date: text(formData, "start_date"),
    end_date: text(formData, "end_date"),
    monthly_rent: text(formData, "monthly_rent"),
    deposit: text(formData, "deposit"),
    currency: text(formData, "currency") || "EUR",
    rent_due_day: text(formData, "rent_due_day") || "1",
    status: text(formData, "status") || "active",
    notes: text(formData, "notes"),
  };

  const fieldErrors: Record<string, string> = {};

  if (!values.property_id) fieldErrors.property_id = "Choose a property.";
  if (!values.tenant_id) fieldErrors.tenant_id = "Choose a tenant.";

  if (!values.start_date) fieldErrors.start_date = "Start date is required.";
  else if (!isDate(values.start_date)) fieldErrors.start_date = "Use a valid date.";

  if (values.end_date && !isDate(values.end_date)) {
    fieldErrors.end_date = "Use a valid date.";
  } else if (
    values.end_date &&
    isDate(values.start_date) &&
    values.end_date < values.start_date
  ) {
    fieldErrors.end_date = "End date cannot be before the start date.";
  }

  const rent = parseMoney(values.monthly_rent, "Monthly rent");
  if (!rent.ok) fieldErrors.monthly_rent = rent.error;

  let deposit: string | null = null;
  if (values.deposit) {
    const parsedDeposit = parseMoney(values.deposit, "Deposit");
    if (!parsedDeposit.ok) fieldErrors.deposit = parsedDeposit.error;
    else deposit = parsedDeposit.value;
  }

  const dueDay = Number(values.rent_due_day);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    fieldErrors.rent_due_day = "Choose a day between 1 and 28.";
  }

  if (!CURRENCIES.includes(values.currency)) fieldErrors.currency = "Unsupported currency.";
  if (!STATUSES.includes(values.status)) fieldErrors.status = "Unsupported status.";

  if (Object.keys(fieldErrors).length > 0 || !rent.ok) {
    return { ok: false as const, state: { fieldErrors, values } };
  }

  return {
    ok: true as const,
    data: {
      property_id: values.property_id,
      tenant_id: values.tenant_id,
      start_date: values.start_date,
      end_date: values.end_date || null,
      monthly_rent: rent.value,
      deposit,
      currency: values.currency,
      rent_due_day: dueDay,
      status: values.status,
      notes: values.notes || null,
    },
    values,
  };
}

// Turns database constraint violations into something a landlord can act on.
function friendlyError(error: { code?: string; message: string }) {
  if (error.code === "23505" && error.message.includes("leases_one_active_per_property")) {
    return "That property already has an active lease. End it first, or save this one as a draft.";
  }
  if (error.code === "23503") {
    return "That property or tenant no longer exists.";
  }
  return error.message;
}

export async function createLease(
  _prev: LeaseFormState,
  formData: FormData,
): Promise<LeaseFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("leases")
    .insert({ ...parsed.data, organization_id: organizationId })
    .select("id")
    .single();

  if (error) return { error: friendlyError(error), values: parsed.values };

  revalidatePath("/leases");
  revalidatePath("/properties");
  redirect(`/leases/${data.id}`);
}

export async function updateLease(
  id: string,
  _prev: LeaseFormState,
  formData: FormData,
): Promise<LeaseFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("leases")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) return { error: friendlyError(error), values: parsed.values };

  revalidatePath("/leases");
  revalidatePath(`/leases/${id}`);
  revalidatePath("/properties");
  redirect(`/leases/${id}`);
}

export async function deleteLease(id: string) {
  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("leases")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    redirect(`/leases/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/leases");
  revalidatePath("/properties");
  redirect("/leases");
}
