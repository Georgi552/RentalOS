import "server-only";

import { extractText, getDocumentProxy } from "unpdf";
import { findProvider } from "./providers";
import type { ExtractedInvoice } from "./types";

export type ExtractionIssue = { field: string; message: string };

export type ExtractionResult = {
  // Null when no adapter recognised the invoice: the landlord fills the form
  // in by hand, which is still better than nothing.
  invoice: ExtractedInvoice | null;
  // Blocking: the reading cannot be trusted as it stands.
  errors: ExtractionIssue[];
  // Non-blocking: worth a look before confirming.
  warnings: ExtractionIssue[];
};

export async function extractInvoiceText(file: Uint8Array) {
  const pdf = await getDocumentProxy(file);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export async function extractInvoice(file: Uint8Array): Promise<ExtractionResult> {
  let text: string;

  try {
    text = await extractInvoiceText(file);
  } catch (cause) {
    return {
      invoice: null,
      errors: [{ field: "file", message: `Не мога да прочета PDF-а: ${String(cause)}` }],
      warnings: [],
    };
  }

  if (text.trim().length < 40) {
    return {
      invoice: null,
      errors: [
        {
          field: "file",
          message:
            "PDF-ът няма текст — вероятно е сканирано изображение. Въведи сметката ръчно.",
        },
      ],
      warnings: [],
    };
  }

  const provider = findProvider(text);

  if (!provider) {
    return {
      invoice: null,
      errors: [],
      warnings: [
        {
          field: "provider",
          message: "Не разпознавам доставчика. Провери и попълни полетата сам.",
        },
      ],
    };
  }

  const invoice = provider.extract(text);
  const { errors, warnings } = validate(invoice);

  return { invoice, errors, warnings };
}

// Extraction is untrusted input (context doc section 25). Nothing reaches the
// database before passing this, and even then a person confirms it.
export function validate(invoice: ExtractedInvoice) {
  const errors: ExtractionIssue[] = [];
  const warnings: ExtractionIssue[] = [];

  if (!invoice.amount) {
    errors.push({ field: "amount", message: "Не намирам сумата." });
  } else if (invoice.amount.startsWith("-")) {
    errors.push({ field: "amount", message: "Сумата е отрицателна — вероятно е кредитно известие." });
  } else if (invoice.amount === "0.00") {
    warnings.push({ field: "amount", message: "Сумата е нула." });
  }

  if (invoice.periodStart && invoice.periodEnd && invoice.periodEnd < invoice.periodStart) {
    errors.push({ field: "period", message: "Краят на периода е преди началото." });
  }

  if (!invoice.periodMonth) {
    warnings.push({ field: "period", message: "Не намирам период — провери за кой месец е." });
  }

  if (!invoice.invoiceNumber) {
    warnings.push({ field: "invoiceNumber", message: "Не намирам номер на фактурата." });
  }

  if (!invoice.customerNumber) {
    warnings.push({
      field: "customerNumber",
      message: "Не намирам клиентски номер — без него имотът няма да се познава сам следващия път.",
    });
  }

  if (invoice.dueDate && invoice.issueDate && invoice.dueDate < invoice.issueDate) {
    warnings.push({ field: "dueDate", message: "Падежът е преди датата на издаване." });
  }

  // A date years away usually means a misread, not a real invoice.
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  if (invoice.issueDate && invoice.issueDate > nextYear) {
    warnings.push({ field: "issueDate", message: "Датата на издаване изглежда невалидна." });
  }

  return { errors, warnings };
}
