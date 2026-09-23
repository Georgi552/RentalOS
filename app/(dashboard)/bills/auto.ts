"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/auth";
import { autoCreateBill, type AutoResult } from "@/lib/invoice/auto-create";

export type { AutoResult };

// Called right after a PDF is uploaded. A bill is written without asking only
// when the invoice was read cleanly AND the property is certain — which, in
// practice, means the second and every later invoice from a provider.
//
// The rules themselves live in lib/invoice/auto-create.ts, because the
// inbound-email route applies the same ones without a signed-in user.
export async function autoCreateBillFromDocument(documentId: string): Promise<AutoResult> {
  const { supabase, organizationId } = await requireOrganization();

  const result = await autoCreateBill(supabase, organizationId, documentId);

  if (result.outcome === "created") {
    revalidatePath("/bills");
    revalidatePath("/dashboard");
    revalidatePath("/properties");
  }

  return result;
}
