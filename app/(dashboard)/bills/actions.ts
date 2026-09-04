"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { BILL_TYPES } from "@/lib/labels";
import { parseMoney } from "@/lib/money";

export type BillFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const STATUSES = ["needs_review", "confirmed", "rejected"];
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
    document_id: text(formData, "document_id"),
    provider: text(formData, "provider"),
    issue_date: text(formData, "issue_date"),
    bill_type: text(formData, "bill_type"),
    invoice_number: text(formData, "invoice_number"),
    customer_number: text(formData, "customer_number"),
    period_start: text(formData, "period_start"),
    period_end: text(formData, "period_end"),
    amount: text(formData, "amount"),
    currency: text(formData, "currency") || "EUR",
    due_date: text(formData, "due_date"),
    // A bill entered by hand counts straight away; needs_review is for
    // invoices that arrive by extraction later.
    status: "confirmed",
    tenant_chargeable: formData.get("tenant_chargeable") ? "on" : "",
    paid_by_landlord: formData.get("paid_by_landlord") ? "on" : "",
    notes: text(formData, "notes"),
  };

  const fieldErrors: Record<string, string> = {};

  if (!values.bill_type) fieldErrors.bill_type = "Избери вид сметка.";
  else if (!(BILL_TYPES as readonly string[]).includes(values.bill_type)) {
    fieldErrors.bill_type = "Невалиден вид сметка.";
  }

  const amount = parseMoney(values.amount, "Сумата");
  if (!amount.ok) fieldErrors.amount = amount.error;

  for (const [key, dateLabel] of [
    ["issue_date", "Датата на издаване"],
    ["period_start", "Началото на периода"],
    ["period_end", "Краят на периода"],
    ["due_date", "Падежът"],
  ] as const) {
    if (values[key] && !isDate(values[key])) {
      fieldErrors[key] = `${dateLabel} трябва да е валидна дата.`;
    }
  }

  if (
    values.period_start &&
    values.period_end &&
    isDate(values.period_start) &&
    isDate(values.period_end) &&
    values.period_end < values.period_start
  ) {
    fieldErrors.period_end = "Краят на периода не може да е преди началото.";
  }

  if (!CURRENCIES.includes(values.currency)) fieldErrors.currency = "Невалидна валута.";
  if (!STATUSES.includes(values.status)) fieldErrors.status = "Невалиден статус.";

  // The bill goes straight onto the tenant's balance, so it has to belong
  // somewhere. Mirrors bills_confirmed_needs_property.
  if (!values.property_id) {
    fieldErrors.property_id = "Избери имот — сметката се начислява веднага.";
  }

  // The charge month is derived from this date, so a bill without one would
  // land in whatever month it happened to be entered.
  if (!values.issue_date) {
    fieldErrors.issue_date = "Датата на издаване решава в кой месец влиза сметката.";
  }

  // If the tenant pays the provider directly, we have nothing to pass on.
  if (values.tenant_chargeable === "on" && values.paid_by_landlord !== "on") {
    fieldErrors.tenant_chargeable =
      "Сметка, която не плащаме ние, не може да се начислява на наемателя.";
  }

  if (Object.keys(fieldErrors).length > 0 || !amount.ok) {
    return { ok: false as const, state: { fieldErrors, values } };
  }

  return {
    ok: true as const,
    data: {
      property_id: values.property_id || null,
      document_id: values.document_id || null,
      provider: values.provider || null,
      issue_date: values.issue_date || null,
      bill_type: values.bill_type,
      invoice_number: values.invoice_number || null,
      customer_number: values.customer_number || null,
      period_start: values.period_start || null,
      period_end: values.period_end || null,
      amount: amount.value,
      currency: values.currency,
      due_date: values.due_date || null,
      status: values.status,
      tenant_chargeable: values.tenant_chargeable === "on",
      paid_by_landlord: values.paid_by_landlord === "on",
      notes: values.notes || null,
    },
    values,
  };
}

function friendlyError(error: { code?: string; message: string }) {
  if (error.code === "23514" && error.message.includes("bills_confirmed_needs_property")) {
    return "Потвърдена сметка трябва да е свързана с имот.";
  }
  if (error.code === "23503") {
    return "Избраният имот или документ вече не съществува.";
  }
  return error.message;
}

export async function createBill(
  _prev: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("bills")
    .insert({ ...parsed.data, organization_id: organizationId })
    .select("id")
    .single();

  if (error) return { error: friendlyError(error), values: parsed.values };

  revalidatePath("/bills");
  revalidatePath("/properties");
  redirect(`/bills/${data.id}`);
}

export async function updateBill(
  id: string,
  _prev: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("bills")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) return { error: friendlyError(error), values: parsed.values };

  revalidatePath("/bills");
  revalidatePath(`/bills/${id}`);
  revalidatePath("/properties");
  redirect(`/bills/${id}`);
}

export async function deleteBill(id: string) {
  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("bills")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    const message =
      error.code === "23503"
        ? "Тази сметка вече е в справка на наемател. Премахни я от справката първо."
        : error.message;
    redirect(`/bills/${id}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/bills");
  revalidatePath("/properties");
  redirect("/bills");
}
