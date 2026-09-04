import type { BillType } from "@/lib/labels";

// What a provider adapter produces. Everything is optional except the fields
// no invoice can be missing, because a half-read invoice is still useful to a
// landlord who can fill the rest in.
export type ExtractedInvoice = {
  provider: string;
  billType: BillType;
  invoiceNumber: string | null;
  customerNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  // The month the bill belongs to, from the middle of its period.
  periodMonth: string | null;
  // What the invoice charges for the period. This is the consumption.
  amount: string | null;
  // What is actually payable now, when the invoice states it separately -
  // a credit or an arrears balance at the provider makes the two differ.
  amountDue: string | null;
  // The provider-side balance in words, when the invoice reports one.
  providerBalanceNote: string | null;
  currency: "EUR" | "BGN";
  // Address as printed on the invoice, used for property matching.
  serviceAddress: string | null;
  meterReadings: {
    identifier: string | null;
    previous: string | null;
    current: string | null;
  }[];
};

export type ProviderAdapter = {
  id: string;
  name: string;
  billType: BillType;
  // Cheap test on the raw text: does this invoice belong to this provider?
  matches: (text: string) => boolean;
  extract: (text: string) => ExtractedInvoice;
};
