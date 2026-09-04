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
  amount: string | null;
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
