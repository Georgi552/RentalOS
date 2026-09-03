"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import type { BillType } from "@/lib/labels";
import { parseMoney } from "@/lib/money";
import { parseBillTerms, type BillTerm } from "./bill-terms";

export type LeaseFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  billTermErrors?: Partial<Record<BillType, string>>;
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
  const values: Record<string, string> = {
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

  if (!values.property_id) fieldErrors.property_id = "Избери имот.";
  if (!values.tenant_id) fieldErrors.tenant_id = "Избери наемател.";

  if (!values.start_date) fieldErrors.start_date = "Началната дата е задължителна.";
  else if (!isDate(values.start_date)) fieldErrors.start_date = "Въведи валидна дата.";

  if (values.end_date && !isDate(values.end_date)) {
    fieldErrors.end_date = "Въведи валидна дата.";
  } else if (values.end_date && isDate(values.start_date) && values.end_date < values.start_date) {
    fieldErrors.end_date = "Крайната дата не може да е преди началната.";
  }

  const rent = parseMoney(values.monthly_rent, "Наемът");
  if (!rent.ok) fieldErrors.monthly_rent = rent.error;

  let deposit: string | null = null;
  if (values.deposit) {
    const parsedDeposit = parseMoney(values.deposit, "Депозитът");
    if (!parsedDeposit.ok) fieldErrors.deposit = parsedDeposit.error;
    else deposit = parsedDeposit.value;
  }

  const dueDay = Number(values.rent_due_day);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    fieldErrors.rent_due_day = "Избери ден между 1 и 28.";
  }

  if (!CURRENCIES.includes(values.currency)) fieldErrors.currency = "Невалидна валута.";
  if (!STATUSES.includes(values.status)) fieldErrors.status = "Невалиден статус.";

  const billTerms = parseBillTerms(formData);
  Object.assign(values, billTerms.values);

  const hasErrors =
    Object.keys(fieldErrors).length > 0 ||
    Object.keys(billTerms.errors).length > 0 ||
    !rent.ok;

  if (hasErrors) {
    return {
      ok: false as const,
      state: { fieldErrors, billTermErrors: billTerms.errors, values },
    };
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
    terms: billTerms.terms,
    values,
  };
}

// Turns database constraint violations into something a landlord can act on.
function friendlyError(error: { code?: string; message: string }) {
  if (error.code === "23505" && error.message.includes("leases_one_active_per_property")) {
    return "Този имот вече има активен договор. Приключи го или запиши този като чернова.";
  }
  if (error.code === "23503") {
    return "Избраният имот или наемател вече не съществува.";
  }
  return error.message;
}

async function replaceBillTerms(
  supabase: Awaited<ReturnType<typeof requireOrganization>>["supabase"],
  organizationId: string,
  leaseId: string,
  terms: BillTerm[],
) {
  const { error: deleteError } = await supabase
    .from("lease_bill_terms")
    .delete()
    .eq("lease_id", leaseId)
    .eq("organization_id", organizationId);

  if (deleteError) return deleteError;

  const { error: insertError } = await supabase.from("lease_bill_terms").insert(
    terms.map((term) => ({
      ...term,
      lease_id: leaseId,
      organization_id: organizationId,
    })),
  );

  return insertError;
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

  const termsError = await replaceBillTerms(supabase, organizationId, data.id, parsed.terms);

  if (termsError) {
    // A lease without bill terms would quietly produce wrong statements, so
    // undo the lease rather than leave it half-created.
    await supabase.from("leases").delete().eq("id", data.id).eq("organization_id", organizationId);
    return { error: friendlyError(termsError), values: parsed.values };
  }

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

  const termsError = await replaceBillTerms(supabase, organizationId, id, parsed.terms);
  if (termsError) return { error: friendlyError(termsError), values: parsed.values };

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
