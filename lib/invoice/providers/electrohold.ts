import { firstMatch, parseAmount, parseDate, periodMonth } from "../parse";
import type { ProviderAdapter } from "../types";

export const electrohold: ProviderAdapter = {
  id: "electrohold",
  name: "Електрохолд Продажби ЕАД",
  billType: "electricity",
  matches: (text) => /Електрохолд/i.test(text),

  extract(text) {
    // The billing period repeats right under the service address. Anchoring on
    // "За обект" keeps it apart from the payment window further down, which is
    // written in exactly the same shape.
    const period = text.match(/За обект[^\n]*\n\s*от\s*([\d.]+)\s*до\s*([\d.]+)/);
    const periodStart = parseDate(period?.[1]);
    const periodEnd = parseDate(period?.[2]);

    const meterId = firstMatch(text, [/Електромер\s*№\s*(\d+)/]);
    const day = readingRow(text, "Дневна");
    const night = readingRow(text, "Нощна");

    return {
      provider: this.name,
      billType: "electricity",
      invoiceNumber: firstMatch(text, [/ФАКТУРА\s*№\s*(\d+)/]),
      customerNumber: firstMatch(text, [/КЛИЕНТСКИ\s+НОМЕР\s*:?\s*(\d+)/i]),
      issueDate: parseDate(firstMatch(text, [/ФАКТУРА\s*№\s*\d+\s*\/\s*([\d.]+)/])),
      // The payment window is written as a range; the deadline is its end.
      dueDate: parseDate(
        firstMatch(text, [/Срок за плащане на фактурата\s*от\s*[\d.]+\s*до\s*([\d.]+)/]),
      ),
      periodStart,
      periodEnd,
      periodMonth: periodMonth(periodStart, periodEnd),
      amount: parseAmount(firstMatch(text, [/Обща стойност на сделката\s*([\d\s.,]+)/])),
      // The payable figure is printed in a box of its own, on its own line, as
      // "40,07 €". It usually equals the transaction total, but a compensation
      // credited against this invoice makes the two differ:
      //
      //   Обща стойност на сделката                    43,01
      //   Компенсация за месец август 2026г. ... -2,94
      //   40,07 €
      //
      // Two such boxes exist; the first belongs to this invoice and the second
      // to the past period, so the first match is the one wanted. Reading it
      // per line matters: the amount before it carries a space as the
      // thousands separator, so an unanchored pattern can straddle both.
      amountDue: parseAmount(firstMatch(text, [/^\s*([\d\s]*\d,\d{2})\s*€\s*$/m])),
      providerBalanceNote: pastPeriodNote(text),
      currency: "EUR",
      serviceAddress: firstMatch(text, [/За обект\s*([^\n]+)/]),
      meterReadings: [
        ...(day ? [{ identifier: label(meterId, "дневна"), ...day }] : []),
        ...(night ? [{ identifier: label(meterId, "нощна"), ...night }] : []),
      ],
    };
  },
};

function label(meterId: string | null, tariff: string) {
  return meterId ? `${meterId} ${tariff}` : tariff;
}

// A reading row is: tariff, old, new, difference, correction, quantity. The
// readings carry a space as the thousands separator (42 062), so the column
// boundaries cannot be found by whitespace alone. The invoice prints the
// difference too, so the only split where new - old equals it is the right one.
function readingRow(text: string, tariff: string) {
  const line = text.match(new RegExp(`^${tariff}\\s+([\\d\\s]+)$`, "m"))?.[1];
  if (!line) return null;

  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 5) return null;

  // The last three columns are plain integers.
  const difference = Number(tokens[tokens.length - 3]);
  const readingTokens = tokens.slice(0, -3);
  if (!Number.isFinite(difference)) return null;

  for (let split = 1; split < readingTokens.length; split++) {
    const previous = readingTokens.slice(0, split).join("");
    const current = readingTokens.slice(split).join("");
    if (Number(current) - Number(previous) === difference) {
      return { previous, current };
    }
  }

  return null;
}

function pastPeriodNote(text: string) {
  // A compensation credited against this invoice is why the payable figure is
  // lower than the charge for the period. The invoice also prints a purely
  // informational compensation rate ("Компенсация за 07.2026, определена от
  // ... без ДДС"), which carries no amount and must not be reported as one -
  // hence the trailing amount is required.
  const compensation = parseAmount(
    firstMatch(text, [/^Компенсация[^\n]*?(-?\d[\d\s]*,\d{2})\s*$/m]),
  );
  if (compensation && compensation !== "0.00") {
    return `Компенсация по фактурата: ${compensation} EUR`;
  }

  const refund = parseAmount(
    firstMatch(text, [/Възстановена сума от предходен период \(-\)\s*([\d\s.,]+)/]),
  );
  if (refund && refund !== "0.00") return `Възстановена сума от предходен период: ${refund} EUR`;

  const pastDue = parseAmount(
    firstMatch(text, [/Сума за плащане за минал период\s*([\d\s.,]+)/]),
  );
  if (pastDue && pastDue !== "0.00") return `Сума за минал период: ${pastDue} EUR`;

  return null;
}
