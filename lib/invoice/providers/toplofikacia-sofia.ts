import { firstMatch, parseAmount, parseDate, periodMonth } from "../parse";
import type { ProviderAdapter } from "../types";

export const toplofikaciaSofia: ProviderAdapter = {
  id: "toplofikacia-sofia",
  name: "Топлофикация София ЕАД",
  billType: "heating",
  matches: (text) => /ТОПЛОФИКАЦИЯ\s+СОФИЯ/i.test(text),

  extract(text) {
    const period = text.match(/Отчетен период:\s*([\d.]+)\s*г\.\s*-\s*([\d.]+)/);
    const periodStart = parseDate(period?.[1]);
    const periodEnd = parseDate(period?.[2]);

    const invoiceNumber = firstMatch(text, [/ФАКТУРА\s*№\s*(\d+)/]);

    return {
      provider: this.name,
      billType: "heating",
      invoiceNumber,
      // The contract account follows the property; the business partner number
      // follows the person, who may hold several properties.
      customerNumber: firstMatch(text, [
        /ДОГОВОРНА\s+СМЕТКА\s*№\s*(\d+)/i,
        /БИЗНЕС\s+ПАРТНЬОР\s*№\s*(\d+)/i,
      ]),
      issueDate: parseDate(
        firstMatch(text, [/Дата на издаване[^\n]*?-\s*([\d.]+)/]),
      ),
      dueDate: parseDate(
        firstMatch(text, [/Срок за плащане на фактура[^\n]*?-\s*([\d.]+)/]),
      ),
      periodStart,
      periodEnd,
      periodMonth: periodMonth(periodStart, periodEnd),
      // Anchored on the invoice total. The sheet also lists arrears and credits
      // as separate signed figures, and those are not this month's charge.
      amount: parseAmount(firstMatch(text, [/ВСИЧКО по фактура\s*([\d\s.,]+)/])),
      currency: "EUR",
      // The recipient block is: label, then the name, then the address.
      serviceAddress: firstMatch(text, [/ПОЛУЧАТЕЛ:\s*\n[^\n]*\n([^\n]+)/]),
      meterReadings: [],
    };
  },
};
