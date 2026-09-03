"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/lib/types";

export type ExpenseFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

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
    category: text(formData, "category"),
    description: text(formData, "description"),
    amount: text(formData, "amount"),
    currency: text(formData, "currency") || "EUR",
    expense_date: text(formData, "expense_date"),
    tenant_chargeable: formData.get("tenant_chargeable") ? "on" : "",
    notes: text(formData, "notes"),
  };

  const fieldErrors: Record<string, string> = {};

  if (!values.property_id) fieldErrors.property_id = "Choose a property.";

  if (!values.category) fieldErrors.category = "Choose a category.";
  else if (!(EXPENSE_CATEGORIES as readonly string[]).includes(values.category)) {
    fieldErrors.category = "Unsupported category.";
  }

  const amount = parseMoney(values.amount, "Amount");
  if (!amount.ok) fieldErrors.amount = amount.error;

  if (!values.expense_date) fieldErrors.expense_date = "Date is required.";
  else if (!isDate(values.expense_date)) fieldErrors.expense_date = "Use a valid date.";

  if (!CURRENCIES.includes(values.currency)) fieldErrors.currency = "Unsupported currency.";

  if (Object.keys(fieldErrors).length > 0 || !amount.ok) {
    return { ok: false as const, state: { fieldErrors, values } };
  }

  return {
    ok: true as const,
    data: {
      property_id: values.property_id,
      category: values.category,
      description: values.description || null,
      amount: amount.value,
      currency: values.currency,
      expense_date: values.expense_date,
      tenant_chargeable: values.tenant_chargeable === "on",
      notes: values.notes || null,
    },
    values,
  };
}

function friendlyError(error: { code?: string; message: string }) {
  if (error.code === "23503") return "That property no longer exists.";
  return error.message;
}

export async function createExpense(
  _prev: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("expenses")
    .insert({ ...parsed.data, organization_id: organizationId });

  if (error) return { error: friendlyError(error), values: parsed.values };

  revalidatePath("/expenses");
  revalidatePath("/properties");
  redirect("/expenses");
}

export async function updateExpense(
  id: string,
  _prev: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;

  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("expenses")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) return { error: friendlyError(error), values: parsed.values };

  revalidatePath("/expenses");
  revalidatePath("/properties");
  redirect("/expenses");
}

export async function deleteExpense(id: string) {
  const { supabase, organizationId } = await requireOrganization();

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    // A chargeable expense already on a tenant statement is protected by
    // statement_items_expense_fkey (ON DELETE RESTRICT).
    const message =
      error.code === "23503"
        ? "This expense is already on a tenant statement. Remove it from the statement first."
        : error.message;
    redirect(`/expenses/${id}/edit?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/expenses");
  revalidatePath("/properties");
  redirect("/expenses");
}
