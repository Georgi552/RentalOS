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
      // "Оставаща сума за плащане" is the invoice total after the account's own
      // credit or arrears. It is 0.00 when a refund already covers the month.
      amountDue: parseAmount(
        firstMatch(text, [/Оставаща сума за плащане по фактура\s*№?\s*\d+\s*([\d\s.,-]+)/]),
      ),
      providerBalanceNote: creditNote(text),
      currency: "EUR",
      // The recipient block is: label, then the name, then the address.
      serviceAddress: firstMatch(text, [/ПОЛУЧАТЕЛ:\s*\n[^\n]*\n([^\n]+)/]),
      meterReadings: [],
    };
  },
};

// The equalisation account can leave a credit that the invoice reports on its
// own line. Worth carrying through, because it explains a zero to pay.
function creditNote(text: string) {
  const credit = firstMatch(text, [
    /имате сума за получаване на обща стойност\s*([\d\s.,]+)/,
  ]);
  if (credit) {
    const amount = parseAmount(credit);
    if (amount && amount !== "0.00") return `Кредит при доставчика: ${amount} EUR`;
  }

  const arrears = firstMatch(text, [
    /Просрочени суми \(главница\)[^\n]*?([\d\s.,]+)\s*Евро/,
  ]);
  if (arrears) {
    const amount = parseAmount(arrears);
    if (amount && amount !== "0.00") return `Просрочени суми при доставчика: ${amount} EUR`;
  }

  return null;
}
