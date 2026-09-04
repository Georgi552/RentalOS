import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_BUCKET } from "@/lib/documents";
import { extractInvoice, type ExtractionResult } from "./extract";
import { matchProperty, type PropertyMatch } from "./match";

export type DocumentAnalysis = ExtractionResult & {
  documentId: string;
  filename: string;
  match: PropertyMatch;
};

// Reads a stored PDF and turns it into a suggested bill. Nothing is written:
// the landlord confirms on the form (context doc section 25).
export async function analyzeDocument(
  supabase: SupabaseClient,
  organizationId: string,
  documentId: string,
): Promise<DocumentAnalysis | null> {
  const { data: document, error } = await supabase
    .from("documents")
    .select("id, filename, mime_type, storage_path")
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!document) return null;

  const base = {
    documentId: document.id,
    filename: document.filename,
    match: { propertyId: null, confidence: "none", reason: "" } as PropertyMatch,
  };

  if (document.mime_type !== "application/pdf") {
    return {
      ...base,
      invoice: null,
      errors: [],
      warnings: [
        { field: "file", message: "Файлът не е PDF — попълни сметката ръчно." },
      ],
    };
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .download(document.storage_path);

  if (downloadError || !file) {
    return {
      ...base,
      invoice: null,
      errors: [
        {
          field: "file",
          message: `Не мога да сваля файла: ${downloadError?.message ?? "непознат проблем"}`,
        },
      ],
      warnings: [],
    };
  }

  const result = await extractInvoice(new Uint8Array(await file.arrayBuffer()));

  const match = result.invoice
    ? await matchProperty(supabase, organizationId, result.invoice)
    : base.match;

  return { ...base, ...result, match };
}
