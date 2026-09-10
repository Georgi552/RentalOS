"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { parseMoney } from "@/lib/money";

export type PaymentFormState = {
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

// One number per month: what the tenant actually paid. Everything owed is
// derived by lease_monthly_ledger.
export async function recordPayment(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const values = {
    lease_id: text(formData, "lease_id"),
    period_month: text(formData, "period_month"),
    paid_amount: text(formData, "paid_amount"),
    paid_rent: text(formData, "paid_rent"),
    paid_bills: text(formData, "paid_bills"),
    payment_date: text(formData, "payment_date"),
    notes: text(formData, "notes"),
  };

  const fieldErrors: Record<string, string> = {};

  if (!values.lease_id) fieldErrors.lease_id = "Избери договор.";
  if (!values.period_month) fieldErrors.period_month = "Избери месец.";
  else if (!isMonth(values.period_month)) fieldErrors.period_month = "Използвай формат 2026-08.";


  if (values.payment_date && !isDate(values.payment_date)) {
    fieldErrors.payment_date = "Въведи валидна дата.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const { supabase, organizationId } = await requireOrganization();

  // Currency and the split follow the lease, so a payment can never disagree
  // with the agreement it belongs to.
  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select("currency, split_rent_and_bills")
    .eq("id", values.lease_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (leaseError) return { error: leaseError.message, values };
  if (!lease) return { error: "Този договор вече не съществува.", values };

  // A split lease keeps the two streams apart; anything else is one amount,
  // which the ledger treats as the whole payment.
  let paidRent: string;
  let paidBills: string;

  if (lease.split_rent_and_bills) {
    const rent = parseMoney(values.paid_rent || "0", "Платеното за наем");
    const bills = parseMoney(values.paid_bills || "0", "Платеното за сметки");
    if (!rent.ok) return { fieldErrors: { paid_rent: rent.error }, values };
    if (!bills.ok) return { fieldErrors: { paid_bills: bills.error }, values };
    paidRent = rent.value;
    paidBills = bills.value;
  } else {
    const paid = parseMoney(values.paid_amount, "Платената сума");
    if (!paid.ok) return { fieldErrors: { paid_amount: paid.error }, values };
    paidRent = paid.value;
    paidBills = "0.00";
  }

  // One record per lease per month, so re-entering a month corrects it
  // instead of double counting.
  const { error } = await supabase.from("rent_payments").upsert(
    {
      organization_id: organizationId,
      lease_id: values.lease_id,
      period_month: `${values.period_month}-01`,
      paid_rent: paidRent,
      paid_bills: paidBills,
      currency: lease.currency,
      payment_date: values.payment_date || null,
      notes: values.notes || null,
    },
    { onConflict: "lease_id,period_month" },
  );

  if (error) return { error: error.message, values };

  revalidatePath("/rent");
  revalidatePath("/properties");
  revalidatePath("/tenants");
  redirect("/rent");
}

export async function deletePayment(id: string) {
  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("rent_payments")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    redirect(`/rent?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/rent");
  revalidatePath("/properties");
  revalidatePath("/tenants");
  redirect("/rent");
}
