import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAddress } from "./parse";
import type { ExtractedInvoice } from "./types";

export type PropertyMatch = {
  propertyId: string | null;
  confidence: "certain" | "likely" | "none";
  reason: string;
};

// Deterministic matching, in the order of context doc section 28. No
// embeddings, no fuzzy distance: a wrong automatic match silently bills the
// wrong tenant, so anything less than solid evidence goes to the landlord.
export async function matchProperty(
  supabase: SupabaseClient,
  organizationId: string,
  invoice: ExtractedInvoice,
): Promise<PropertyMatch> {
  // 1. The same customer number from this provider, already confirmed once.
  //    This is what makes the second invoice from a provider automatic.
  if (invoice.customerNumber) {
    const { data } = await supabase
      .from("bills")
      .select("property_id, created_at")
      .eq("organization_id", organizationId)
      .eq("provider", invoice.provider)
      .eq("customer_number", invoice.customerNumber)
      .not("property_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const previous = data?.[0];
    if (previous?.property_id) {
      return {
        propertyId: previous.property_id,
        confidence: "certain",
        reason: `Клиентски номер ${invoice.customerNumber} съвпада с предишна фактура от ${invoice.provider}.`,
      };
    }
  }

  // 2. The service address, normalised. Providers write addresses very
  //    differently, so this only fires on a genuinely equal string.
  if (invoice.serviceAddress) {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, address")
      .eq("organization_id", organizationId);

    const target = normalizeAddress(invoice.serviceAddress);
    const exact = (properties ?? []).filter(
      (property) => normalizeAddress(property.address) === target,
    );

    if (exact.length === 1) {
      return {
        propertyId: exact[0].id,
        confidence: "certain",
        reason: `Адресът съвпада точно с „${exact[0].name}“.`,
      };
    }

    // 3. Otherwise look for a property whose address words all appear in the
    //    invoice address, compared as whole tokens. A block or apartment number
    //    has to be among them: "ж.к. Белите брези" alone is a neighbourhood,
    //    and matching on that would suggest the wrong flat.
    const invoiceTokens = new Set(target.split(" "));

    const suggestions = (properties ?? []).filter((property) => {
      // Single letters are noise ("ж", "к"), but a single digit is the block
      // or apartment number and is exactly what makes the match specific.
      const tokens = normalizeAddress(property.address)
        .split(" ")
        .filter((token) => token.length > 1 || /\d/.test(token));

      if (tokens.length < 2) return false;
      if (!tokens.some((token) => /\d/.test(token))) return false;

      return tokens.every((token) => invoiceTokens.has(token));
    });

    if (suggestions.length === 1) {
      return {
        propertyId: suggestions[0].id,
        confidence: "likely",
        reason: `Адресът сочи към „${suggestions[0].name}“. Провери, преди да потвърдиш.`,
      };
    }
  }

  return {
    propertyId: null,
    confidence: "none",
    reason: invoice.customerNumber
      ? `Първа фактура от ${invoice.provider} с клиентски номер ${invoice.customerNumber}. Избери имота веднъж и следващия път ще го позная сам.`
      : "Не мога да позная имота. Избери го от списъка.",
  };
}
