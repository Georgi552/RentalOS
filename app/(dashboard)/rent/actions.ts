"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { rentStatus } from "@/lib/rent";

export type RentFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parse(formData: FormData, requireLease: boolean) {
  const values = {
    lease_id: text(formData, "lease_id"),
    period_month: text(formData, "period_month"),
    expected_amount: text(formData, "expected_amount"),
    paid_amount: text(formData, "paid_amount") || "0",
    payment_date: text(formData, "payment_date"),
    notes: text(formData, "notes"),
  };

  const fieldErrors: Record<string, string> = {};

  if (requireLease && !values.lease_id) fieldErrors.lease_id = "Choose a lease.";

  if (!values.period_month) fieldErrors.period_month = "Choose a month.";
  else if (!isMonth(values.period_month)) fieldErrors.period_month = "Use a month like 2026-08.";

  const expected = parseMoney(values.expected_amount, "Expected rent");
  if (!expected.ok) fieldErrors.expected_amount = expected.error;

  const paid = parseMoney(values.paid_amount, "Paid amount");
  if (!paid.ok) fieldErrors.paid_amount = paid.error;

  if (values.payment_date && !isDate(values.payment_date)) {
    fieldErrors.payment_date = "Use a valid date.";
  }

  if (Object.keys(fieldErrors).length > 0 || !expected.ok || !paid.ok) {
    return { ok: false as const, state: { fieldErrors, values } };
  }

  return {
    ok: true as const,
    data: {
      period_month: `${values.period_month}-01`,
      expected_amount: expected.value,
      paid_amount: paid.value,
      payment_date: values.payment_date || null,
      status: rentStatus(expected.value, paid.value),
      notes: values.notes || null,
    },
    leaseId: values.lease_id,
    values,
  };
}

function friendlyError(error: { code?: string; message: string }) {
  if (error.code === "23505" && error.message.includes("rent_payments_lease_period_key")) {
    return "This lease already has a rent record for that month. Edit that one instead.";
  }
  return error.message;
}

export async function createRentPayment(
  _prev: RentFormState,
  formData: FormData,
): Promise<RentFormState> {
  const parsed = parse(formData, true);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  // Currency follows the lease, never the form, so a rent row cannot disagree
  // with the lease it belongs to.
  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select("currency")
    .eq("id", parsed.leaseId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (leaseError) return { error: leaseError.message, values: parsed.values };
  if (!lease) return { error: "That lease no longer exists.", values: parsed.values };

  const { data, error } = await supabase
    .from("rent_payments")
    .insert({
      ...parsed.data,
      lease_id: parsed.leaseId,
      organization_id: organizationId,
      currency: lease.currency,
    })
    .select("id")
    .single();

  if (error) return { error: friendlyError(error), values: parsed.values };

  revalidatePath("/rent");
  revalidatePath("/properties");
  redirect(`/rent/${data.id}/edit`);
}

export async function updateRentPayment(
  id: string,
  _prev: RentFormState,
  formData: FormData,
): Promise<RentFormState> {
  const parsed = parse(formData, false);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("rent_payments")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) return { error: friendlyError(error), values: parsed.values };

  revalidatePath("/rent");
  revalidatePath("/properties");
  redirect("/rent");
}

export async function deleteRentPayment(id: string) {
  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("rent_payments")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    redirect(`/rent/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/rent");
  revalidatePath("/properties");
  redirect("/rent");
}
