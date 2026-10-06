import { BILL_TYPE_LABELS, EXPENSE_CATEGORY_LABELS, label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type { Statement } from "@/lib/statement";

function lineLabel(key: string) {
  return (
    BILL_TYPE_LABELS[key as keyof typeof BILL_TYPE_LABELS] ??
    label(EXPENSE_CATEGORY_LABELS, key)
  );
}

// A carried balance is negative when the tenant owes. Shown even at zero, so
// "nothing was brought forward" is stated rather than left to be assumed.
function balanceLabel(balance: string) {
  if (balance === "0.00") return "От предходен месец";
  return balance.startsWith("-")
    ? "Задължение от предходен месец"
    : "Надплатено от предходен месец";
}

// The statement itself, with no buttons around it. The landlord's page wraps it
// in send and print; the tenant's portal shows the same sheet and reads it.
//
// It is one component rather than two so that the two of them cannot come to
// disagree about what is owed - which is the whole reason the tenant was given
// a login instead of a second report.
export function StatementView({ statement }: { statement: Statement }) {
  const billLines = statement.lines.map((line) => ({
    label: lineLabel(line.label),
    detail: line.detail,
    amount: line.amount,
  }));

  const rows = [
    { label: "Наем", detail: null as string | null, amount: statement.rentDue },
    ...billLines,
  ];

  return (
    <article className="mt-4 rounded-lg border border-neutral-200 bg-white px-6 py-5">
      {/* Empty for a tenant: organizations is deliberately unreadable to them,
          because inbox_address lives there (migration 0024). */}
      {statement.organizationName && (
        <p className="text-sm text-neutral-500">{statement.organizationName}</p>
      )}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Справка за {statement.month}
      </h1>
      <p className="mt-1 text-sm text-neutral-600">
        {statement.propertyName}
        <span className="block text-neutral-500">{statement.propertyAddress}</span>
      </p>
      <p className="mt-3 text-sm">
        Наемател: <span className="font-medium">{statement.tenantName}</span>
        <span className="block text-neutral-500">Срок за плащане: {statement.dueDate}</span>
      </p>

      {statement.split ? (
        <SplitTotals statement={statement} lines={billLines} />
      ) : (
        <table className="mt-5 w-full text-sm">
          <tbody className="divide-y divide-neutral-200">
            {rows.map((row, index) => (
              <tr key={`${row.label}-${index}`}>
                <td className="py-2">
                  {row.label}
                  {row.detail && (
                    <span className="block text-xs text-neutral-500">{row.detail}</span>
                  )}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {formatMoney(row.amount, statement.currency)}
                </td>
              </tr>
            ))}

            {/* The lines above add up to exactly this, because they come from the
                same views the ledger totals (migration 0021). */}
            <tr className="border-t border-neutral-400">
              <td className="py-2 font-medium">Начислено за месеца</td>
              <td className="py-2 text-right font-medium whitespace-nowrap">
                {formatMoney(statement.charges, statement.currency)}
              </td>
            </tr>

            <tr>
              <td className="py-2">{balanceLabel(statement.balanceBefore)}</td>
              <td className="py-2 text-right whitespace-nowrap">
                {formatMoney(statement.balanceBefore.replace("-", ""), statement.currency)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-900">
              <td className="py-3 text-base font-semibold">За плащане</td>
              <td className="py-3 text-right text-base font-semibold whitespace-nowrap">
                {formatMoney(statement.totalDue, statement.currency)}
              </td>
            </tr>
            {statement.creditRemaining !== "0.00" && (
              <tr>
                <td className="py-2 text-sm text-neutral-500">
                  Оставащ кредит за следващия месец
                </td>
                <td className="py-2 text-right text-sm whitespace-nowrap text-neutral-500">
                  {formatMoney(statement.creditRemaining, statement.currency)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      )}

      {statement.paid !== "0.00" && (
        <p className="mt-3 text-sm text-neutral-500">
          Отбелязано като платено за този месец:{" "}
          {formatMoney(statement.paid, statement.currency)}
        </p>
      )}
    </article>
  );
}

// A lease settled as two streams gets two sections and two totals, so the
// tenant sees that being ahead on rent does not clear an unpaid bill.
function SplitTotals({
  statement,
  lines,
}: {
  statement: Statement;
  lines: { label: string; detail: string | null; amount: string }[];
}) {
  const section = (
    title: string,
    rows: { label: string; detail: string | null; amount: string }[],
    subtotal: string,
    balanceBefore: string,
    total: string,
    credit: string,
  ) => (
    <div className="mt-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <table className="mt-1 w-full text-sm">
        <tbody className="divide-y divide-neutral-200">
          {rows.map((row, index) => (
            <tr key={`${row.label}-${index}`}>
              <td className="py-2">
                {row.label}
                {row.detail && <span className="block text-xs text-neutral-500">{row.detail}</span>}
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                {formatMoney(row.amount, statement.currency)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-neutral-400">
            <td className="py-2 font-medium">Начислено за месеца</td>
            <td className="py-2 text-right font-medium whitespace-nowrap">
              {formatMoney(subtotal, statement.currency)}
            </td>
          </tr>
          <tr>
            <td className="py-2">{balanceLabel(balanceBefore)}</td>
            <td className="py-2 text-right whitespace-nowrap">
              {formatMoney(balanceBefore.replace("-", ""), statement.currency)}
            </td>
          </tr>
          <tr className="border-t-2 border-neutral-900">
            <td className="py-2 font-semibold">За плащане</td>
            <td className="py-2 text-right font-semibold whitespace-nowrap">
              {formatMoney(total, statement.currency)}
            </td>
          </tr>
          {credit !== "0.00" && (
            <tr>
              <td className="py-2 text-neutral-500">Оставащ кредит за следващия месец</td>
              <td className="py-2 text-right whitespace-nowrap text-neutral-500">
                {formatMoney(credit, statement.currency)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {section(
        "Наем",
        [{ label: "Наем за месеца", detail: null, amount: statement.rentDue }],
        statement.rentDue,
        statement.rentBalanceBefore,
        statement.rentTotalDue,
        statement.rentCreditRemaining,
      )}
      {section(
        "Сметки",
        lines,
        statement.billsAndExpensesDue,
        statement.billsBalanceBefore,
        statement.billsTotalDue,
        statement.billsCreditRemaining,
      )}
    </>
  );
}
