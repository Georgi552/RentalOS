import { firstMatch, parseAmount, parseDate, periodMonth } from "../parse";
import type { ProviderAdapter } from "../types";

export const sofiyskaVoda: ProviderAdapter = {
  id: "sofiyska-voda",
  name: "Софийска вода АД",
  billType: "water",
  matches: (text) => /Софийска\s+вода/i.test(text),

  extract(text) {
    const period = text.match(/Период на фактуриране\s*от\s*([\d/.]+)\s*до\s*([\d/.]+)/);
    const periodStart = parseDate(period?.[1]);
    const periodEnd = parseDate(period?.[2]);

    // Each водомер is its own line: number, old reading, date, label, new
    // reading, date, label, consumption.
    const meterReadings = [...text.matchAll(
      /^(\d{8})\s+([\d.]+)\s+[\d/]+\s+\S+\s+отчет\s+([\d.]+)\s+/gm,
    )].map((match) => ({
      identifier: match[1],
      previous: match[2],
      current: match[3],
    }));

    return {
      provider: this.name,
      billType: "water",
      invoiceNumber: firstMatch(text, [/ФАКТУРА\s+ОРИГИНАЛ\s*№\s*(\d+)/i]),
      customerNumber: firstMatch(text, [/КЛИЕНТСКИ\s+НОМЕР\s*:?\s*(\d+)/i]),
      issueDate: parseDate(firstMatch(text, [/Дата на издаване\s*([\d/.]+)/])),
      dueDate: parseDate(firstMatch(text, [/Краен срок за плащане\s*([\d/.]+)/])),
      periodStart,
      periodEnd,
      periodMonth: periodMonth(periodStart, periodEnd),
      // "Сума по фактура" excludes any carried balance; the total below it can
      // include one, and that is not this month's bill.
      amount: parseAmount(
        firstMatch(text, [
          /Сума по фактура:\s*([\d\s.,]+)/,
          /ОБЩА ДЪЛЖИМА СУМА\s*([\d\s.,]+)/,
        ]),
      ),
      // The total due adds "Старо салдо", which belongs to earlier periods.
      amountDue: parseAmount(firstMatch(text, [/ОБЩА ДЪЛЖИМА СУМА\s*([\d\s.,-]+)/])),
      providerBalanceNote: oldBalanceNote(text),
      currency: "EUR",
      serviceAddress: firstMatch(text, [/АДРЕС НА КОНСУМАЦИЯ:\s*([^\n]+)/i]),
      meterReadings,
    };
  },
};

function oldBalanceNote(text: string) {
  const balance = parseAmount(firstMatch(text, [/Старо салдо\s*([\d\s.,-]+)/]));
  return balance && balance !== "0.00" ? `Старо салдо при доставчика: ${balance} EUR` : null;
}
