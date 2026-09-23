import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeLeaseTerms,
  chargeableFromTerm,
  paidByLandlordFromTerm,
  termKey,
} from "@/app/(dashboard)/bills/lease-terms-lookup";
import { analyzeDocument } from "./from-document";

// The rules that decide whether a read invoice may become a bill without anyone
// looking at it. Lifted out of the server action so the inbound-email route can
// apply the SAME rules: a second copy is how the statement and the ledger came
// to disagree about the charge month (migration 0021).
//
// This module takes its Supabase client as an argument because it has two
// callers with different identities - a signed-in landlord uploading a file, and
// the service role handling mail.

export type AutoResult =
  // Read, matched and written. Nothing left to do.
  | { outcome: "created"; billId: string }
  // Already entered. The landlord decides whether to replace it.
  | { outcome: "duplicate"; billId: string; message: string }
  // Something needs a person: unknown provider, unknown property, or a
  // reading that did not pass validation.
  | { outcome: "review"; reason: string };

type Client = SupabaseClient;

export async function autoCreateBill(
  supabase: Client,
  organizationId: string,
  documentId: string,
): Promise<AutoResult> {
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

  // The charge and the payable amount differ, so a person decides which one
  // this bill is. Writing either silently would be a guess about money.
  if (invoice.amountDue && invoice.amountDue !== invoice.amount) {
    await setStatus(supabase, organizationId, documentId, "needs_review");
    return {
      outcome: "review",
      reason: `Начислено ${invoice.amount}, но за плащане ${invoice.amountDue}.` +
        (invoice.providerBalanceNote ? ` ${invoice.providerBalanceNote}.` : ""),
    };
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
      // Says no person saw this. The database refuses it outright when the
      // document arrived by mail from a sender who is not on the list
      // (migration 0022).
      written_automatically: true,
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

    if (error.message.includes("bills_auto_needs_known_sender")) {
      return {
        outcome: "review",
        reason:
          "Фактурата е дошла от подател, който не е в списъка с разрешените, затова иска преглед.",
      };
    }

    if (error.message.includes("bills_overlapping_period")) {
      return {
        outcome: "review",
        reason:
          "Периодът се застъпва с друга сметка от същия вид за същия имот. Провери датите.",
      };
    }

    return { outcome: "review", reason: error.message };
  }

  await setStatus(supabase, organizationId, documentId, "processed");

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
  supabase: Client,
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

export async function setStatus(
  supabase: Client,
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
