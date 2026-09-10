import { BILL_TYPE_LABELS, EXPENSE_CATEGORY_LABELS, label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type { Statement } from "@/lib/statement";

function lineLabel(key: string) {
  return (
    BILL_TYPE_LABELS[key as keyof typeof BILL_TYPE_LABELS] ??
    label(EXPENSE_CATEGORY_LABELS, key)
  );
}

export function statementSubject(statement: Statement) {
  return `Справка за ${statement.month} · ${statement.propertyName}`;
}

// Email clients strip stylesheets and many block external CSS, so the styling
// is inline and the layout is a table.
export function statementHtml(statement: Statement) {
  const row = (name: string, detail: string | null, amount: string, bold = false) => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #e1e0d9;${bold ? "font-weight:600;" : ""}">
        ${escapeHtml(name)}
        ${detail ? `<div style="color:#898781;font-size:12px">${escapeHtml(detail)}</div>` : ""}
      </td>
      <td style="padding:6px 0;border-bottom:1px solid #e1e0d9;text-align:right;white-space:nowrap;${bold ? "font-weight:600;" : ""}">
        ${escapeHtml(formatMoney(amount, statement.currency))}
      </td>
    </tr>`;

  const section = (title: string, body: string) =>
    `<tr><td colspan="2" style="padding:14px 0 4px;font-weight:600;font-size:15px">${escapeHtml(title)}</td></tr>${body}`;

  const carried =
    statement.balanceBefore === "0.00"
      ? ""
      : row(
          statement.balanceBefore.startsWith("-")
            ? "Задължение от предходен месец"
            : "Надплатено от предходен месец",
          null,
          statement.balanceBefore.replace("-", ""),
        );

  return `<!doctype html>
<html lang="bg"><body style="margin:0;background:#f9f9f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0b0b0b">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e1e0d9;border-radius:8px;padding:24px">
      <p style="margin:0;color:#52514e;font-size:13px">${escapeHtml(statement.organizationName)}</p>
      <h1 style="margin:4px 0 0;font-size:20px">Справка за ${escapeHtml(statement.month)}</h1>
      <p style="margin:6px 0 0;color:#52514e;font-size:14px">
        ${escapeHtml(statement.propertyName)}<br>${escapeHtml(statement.propertyAddress)}
      </p>

      <p style="margin:20px 0 0;font-size:14px">Здравейте, ${escapeHtml(statement.tenantName)},</p>
      <p style="margin:6px 0 0;color:#52514e;font-size:14px">
        Това е справката за ${escapeHtml(statement.month)}. Срок за плащане: ${escapeHtml(statement.dueDate)}.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:14px">
        ${
          statement.split
            ? section("Наем", row("Наем за месеца", null, statement.rentDue) +
                carriedRow(statement, statement.rentBalanceBefore) +
                totalRow(statement, statement.rentTotalDue)) +
              section("Сметки",
                statement.lines.map((line) => row(lineLabel(line.label), line.detail, line.amount)).join("") +
                carriedRow(statement, statement.billsBalanceBefore) +
                totalRow(statement, statement.billsTotalDue))
            : row("Наем", null, statement.rentDue) +
              statement.lines.map((line) => row(lineLabel(line.label), line.detail, line.amount)).join("") +
              carried +
              totalRow(statement, statement.totalDue)
        }
      </table>

      <p style="margin:22px 0 0;color:#898781;font-size:12px">
        Ако нещо не съответства, отговорете на този имейл.
      </p>
    </div>
  </div>
</body></html>`;
}

function carriedRow(statement: Statement, balance: string) {
  if (balance === "0.00") return "";
  const label = balance.startsWith("-")
    ? "От предходен месец"
    : "Надплатено от предходен месец";
  return `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #e1e0d9">${label}</td>
      <td style="padding:6px 0;border-bottom:1px solid #e1e0d9;text-align:right;white-space:nowrap">
        ${escapeHtml(formatMoney(balance.replace("-", ""), statement.currency))}
      </td>
    </tr>`;
}

function totalRow(statement: Statement, total: string) {
  return `<tr>
      <td style="padding:10px 0 0;font-weight:600;font-size:16px">За плащане</td>
      <td style="padding:10px 0 0;text-align:right;font-weight:600;font-size:16px;white-space:nowrap">
        ${escapeHtml(formatMoney(total, statement.currency))}
      </td>
    </tr>`;
}

export function statementText(statement: Statement) {
  if (statement.split) {
    const lines = [
      statement.organizationName,
      `Справка за ${statement.month} — ${statement.propertyName}`,
      "",
      `Здравейте, ${statement.tenantName},`,
      `Срок за плащане: ${statement.dueDate}`,
      "",
      "НАЕМ",
      `Наем за месеца: ${formatMoney(statement.rentDue, statement.currency)}`,
    ];
    if (statement.rentBalanceBefore !== "0.00") {
      lines.push(`${statement.rentBalanceBefore.startsWith("-") ? "От предходен месец" : "Надплатено от предходен месец"}: ${formatMoney(statement.rentBalanceBefore.replace("-", ""), statement.currency)}`);
    }
    lines.push(`За плащане по наем: ${formatMoney(statement.rentTotalDue, statement.currency)}`, "", "СМЕТКИ");
    for (const line of statement.lines) {
      lines.push(`${lineLabel(line.label)}${line.detail ? ` (${line.detail})` : ""}: ${formatMoney(line.amount, statement.currency)}`);
    }
    if (statement.billsBalanceBefore !== "0.00") {
      lines.push(`${statement.billsBalanceBefore.startsWith("-") ? "От предходен месец" : "Надплатено от предходен месец"}: ${formatMoney(statement.billsBalanceBefore.replace("-", ""), statement.currency)}`);
    }
    lines.push(`За плащане по сметки: ${formatMoney(statement.billsTotalDue, statement.currency)}`);
    return lines.join("\n");
  }

  const lines = [
    `${statement.organizationName}`,
    `Справка за ${statement.month} — ${statement.propertyName}`,
    "",
    `Здравейте, ${statement.tenantName},`,
    `Срок за плащане: ${statement.dueDate}`,
    "",
    `Наем: ${formatMoney(statement.rentDue, statement.currency)}`,
    ...statement.lines.map(
      (line) =>
        `${lineLabel(line.label)}${line.detail ? ` (${line.detail})` : ""}: ${formatMoney(
          line.amount,
          statement.currency,
        )}`,
    ),
  ];

  if (statement.balanceBefore !== "0.00") {
    lines.push(
      `${
        statement.balanceBefore.startsWith("-")
          ? "Задължение от предходен месец"
          : "Надплатено от предходен месец"
      }: ${formatMoney(statement.balanceBefore.replace("-", ""), statement.currency)}`,
    );
  }

  lines.push("", `За плащане: ${formatMoney(statement.totalDue, statement.currency)}`);
  return lines.join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
