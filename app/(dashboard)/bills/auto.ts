"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/auth";
import { analyzeDocument } from "@/lib/invoice/from-document";
import {
  chargeableFromTerm,
  paidByLandlordFromTerm,
  termKey,
  activeLeaseTerms,
} from "./lease-terms-lookup";

export type AutoResult =
  // Read, matched and written. Nothing left to do.
  | { outcome: "created"; billId: string }
  // Already entered. The landlord decides whether to replace it.
  | { outcome: "duplicate"; billId: string; message: string }
  // Something needs a person: unknown provider, unknown property, or a
  // reading that did not pass validation.
  | { outcome: "review"; reason: string };

// Called right after a PDF is uploaded. A bill is written without asking only
// when the invoice was read cleanly AND the property is certain — which, in
// practice, means the second and every later invoice from a provider.
export async function autoCreateBillFromDocument(documentId: string): Promise<AutoResult> {
  const { supabase, organizationId } = await requireOrganization();

  const analysis = await analyzeDocument(supabase, organizationId, documentId);

  if (!analysis) return { outcome: "review", reason: "Документът не е намерен." };

  const { invoice, match } = analysis;

  if (!invoice) {
    await setStatus(supabase, organizationId, documentId, "needs_review");
    return { outcome: "review", reason: analysis.errors[0]?.message ?? "Не разпознах фактурата." };
  }

  if (analysis.errors.length > 0) {
    await setStatus(supabase, organizationId, documentId, "needs_review");
    return { outcome: "review", reason: analysis.errors[0].message };
  }

  // The date decides the charge month and the amount is the whole point, so
  // neither may be guessed.
  if (!invoice.amount || !invoice.issueDate) {
    await setStatus(supabase, organizationId, documentId, "needs_review");
    return { outcome: "review", reason: "Липсва сума или дата на издаване." };
  }

  if (match.confidence !== "certain" || !match.propertyId) {
    await setStatus(supabase, organizationId, documentId, "needs_review");
    return { outcome: "review", reason: match.reason };
  }

  const existing = await findDuplicate(supabase, organizationId, {
    provider: invoice.provider,
    invoiceNumber: invoice.invoiceNumber,
    propertyId: match.propertyId,
    billType: invoice.billType,
    periodStart: invoice.periodStart,
  });

  if (existing) {
    await setStatus(supabase, organizationId, documentId, "processed");
    return {
      outcome: "duplicate",
      billId: existing.id,
      message: "Тази сметка вече е въведена.",
    };
  }

  // Who pays and whether it is charged on comes from the lease, exactly as on
  // the form.
  const terms = await activeLeaseTerms(supabase, organizationId);
  const term = terms[termKey(match.propertyId, invoice.billType)];

  const { data, error } = await supabase
    .from("bills")
    .insert({
      organization_id: organizationId,
      property_id: match.propertyId,
      document_id: documentId,
      provider: invoice.provider,
      bill_type: invoice.billType,
      invoice_number: invoice.invoiceNumber,
      customer_number: invoice.customerNumber,
      issue_date: invoice.issueDate,
      period_start: invoice.periodStart,
      period_end: invoice.periodEnd,
      due_date: invoice.dueDate,
      amount: invoice.amount,
      currency: invoice.currency,
      status: "confirmed",
      paid_by_landlord: paidByLandlordFromTerm(term),
      tenant_chargeable: paidByLandlordFromTerm(term) && chargeableFromTerm(term),
      match_reason: match.reason,
    })
    .select("id")
    .single();

  if (error) {
    await setStatus(supabase, organizationId, documentId, "needs_review");

    // The unique indexes are the real guard; this is the race the pre-check
    // cannot cover.
    if (error.code === "23505") {
      const duplicate = await findDuplicate(supabase, organizationId, {
        provider: invoice.provider,
        invoiceNumber: invoice.invoiceNumber,
        propertyId: match.propertyId,
        billType: invoice.billType,
        periodStart: invoice.periodStart,
      });

      if (duplicate) {
        return {
          outcome: "duplicate",
          billId: duplicate.id,
          message: "Тази сметка вече е въведена.",
        };
      }
    }

    return { outcome: "review", reason: error.message };
  }

  await setStatus(supabase, organizationId, documentId, "processed");

  revalidatePath("/bills");
  revalidatePath("/dashboard");
  revalidatePath("/properties");

  return { outcome: "created", billId: data.id };
}

type DuplicateQuery = {
  provider: string;
  invoiceNumber: string | null;
  propertyId: string;
  billType: string;
  periodStart: string | null;
};

// Mirrors the two unique indexes from migration 0012.
export async function findDuplicate(
  supabase: Awaited<ReturnType<typeof requireOrganization>>["supabase"],
  organizationId: string,
  query: DuplicateQuery,
) {
  if (query.invoiceNumber) {
    const { data } = await supabase
      .from("bills")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("provider", query.provider)
      .eq("invoice_number", query.invoiceNumber)
      .neq("status", "rejected")
      .maybeSingle();

    if (data) return data;
  }

  if (query.periodStart) {
    const { data } = await supabase
      .from("bills")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("property_id", query.propertyId)
      .eq("bill_type", query.billType)
      .eq("period_start", query.periodStart)
      .neq("status", "rejected")
      .maybeSingle();

    if (data) return data;
  }

  return null;
}

async function setStatus(
  supabase: Awaited<ReturnType<typeof requireOrganization>>["supabase"],
  organizationId: string,
  documentId: string,
  status: "processed" | "needs_review",
) {
  await supabase
    .from("documents")
    .update({ processing_status: status })
    .eq("id", documentId)
    .eq("organization_id", organizationId);
}
