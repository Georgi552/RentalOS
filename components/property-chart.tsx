import { PrintButton } from "@/components/print-button";
import { addMoney, formatMoney } from "@/lib/money";

// Categorical slots 1 and 6 of the validated order (blue, green).
// Validated on this pair: CVD delta-E 26.5, normal-vision 29.0, both above 3:1
// on a white surface.
const CHARGES_COLOR = "#2a78d6";
const PAID_COLOR = "#008300";

export type ChartMonth = {
  month: string;
  currency: string;
  rent_due: string;
  bills_electricity: string;
  bills_water: string;
  bills_heating: string;
  bills_building_fee: string;
  bills_internet: string;
  bills_other: string;
  expenses_due: string;
  charges: string;
  paid: string;
  balance: string;
};

// The parts behind a month's charge, in the order they are explained on hover.
const PARTS = [
  { key: "rent_due", label: "Наем" },
  { key: "bills_electricity", label: "Ток" },
  { key: "bills_water", label: "Вода" },
  { key: "bills_heating", label: "Топлофикация" },
  { key: "bills_building_fee", label: "Входна такса" },
  { key: "bills_internet", label: "Интернет" },
  { key: "bills_other", label: "Друга сметка" },
  { key: "expenses_due", label: "Разходи" },
] as const;

const AXIS_W = 52;
const BAR_W = 24;
const BAR_GAP = 2; // surface gap between adjacent bars
const GROUP_W = BAR_W * 2 + BAR_GAP;
const GROUP_GAP = 34;
const TOP_PAD = 12;
const PLOT_H = 170;
const LABEL_H = 24;

// A bar with a rounded data-end: only the top corners round, the bottom stays
// anchored to the baseline.
function barPath(x: number, y: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height);
  return [
    `M ${x} ${y + height}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `H ${x + width - r}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `V ${y + height}`,
    "Z",
  ].join(" ");
}

// Chooses a top of scale whose halves are round numbers, so the gridlines read
// as 0 / 400 / 800 rather than 0 / 325 / 650.
function niceMax(peak: number) {
  if (peak <= 0) return 100;
  const rough = peak / 2;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step =
    (normalised <= 1
      ? 1
      : normalised <= 1.5
        ? 1.5
        : normalised <= 2
          ? 2
          : normalised <= 2.5
            ? 2.5
            : normalised <= 3
              ? 3
              : normalised <= 4
                ? 4
                : normalised <= 5
                  ? 5
                  : 10) * magnitude;
  return step * 2;
}

// The tooltip carries the whole breakdown, so the single charge bar never hides
// what it is made of. Zero parts are left out to keep it short.
function chargesTooltip(month: ChartMonth) {
  const lines = [`${month.month.slice(0, 7)} · задължение`];

  for (const part of PARTS) {
    const value = month[part.key];
    if (value && value !== "0.00") {
      lines.push(`${part.label}: ${formatMoney(value, month.currency)}`);
    }
  }

  lines.push(`Общо: ${formatMoney(month.charges, month.currency)}`);
  return lines.join("\n");
}

export function PropertyChart({ months }: { months: ChartMonth[] }) {
  if (months.length === 0) return null;

  const currency = months[0].currency;

  // Only pixel geometry converts to a number; displayed amounts stay exact
  // decimal strings (see lib/money.ts).
  const peak = Math.max(
    ...months.flatMap((month) => [Number(month.charges), Number(month.paid)]),
    1,
  );
  const max = niceMax(peak);

  const width = AXIS_W + months.length * (GROUP_W + GROUP_GAP);
  const height = TOP_PAD + PLOT_H + LABEL_H;

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="Задължение и платено по месеци"
          className="max-w-full"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          {[0, 0.5, 1].map((t) => {
            const y = TOP_PAD + PLOT_H - t * PLOT_H;
            return (
              <g key={t}>
                <line
                  x1={AXIS_W}
                  x2={width}
                  y1={y}
                  y2={y}
                  stroke={t === 0 ? "#c3c2b7" : "#e1e0d9"}
                  strokeWidth={1}
                />
                <text
                  x={AXIS_W - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize={10}
                  fill="#898781"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {Math.round(max * t)}
                </text>
              </g>
            );
          })}

          {months.map((month, index) => {
            const groupX = AXIS_W + GROUP_GAP / 2 + index * (GROUP_W + GROUP_GAP);

            const bars = [
              {
                key: "charges" as const,
                x: groupX,
                color: CHARGES_COLOR,
                tooltip: chargesTooltip(month),
              },
              {
                key: "paid" as const,
                x: groupX + BAR_W + BAR_GAP,
                color: PAID_COLOR,
                tooltip: `${month.month.slice(0, 7)} · платено: ${formatMoney(
                  month.paid,
                  currency,
                )}`,
              },
            ];

            return (
              <g key={month.month}>
                {bars.map((bar) => {
                  const barHeight = (Number(month[bar.key]) / max) * PLOT_H;
                  return (
                    <g key={bar.key}>
                      {/* Hit target spans the plot so a small bar stays hoverable. */}
                      <rect
                        x={bar.x}
                        y={TOP_PAD}
                        width={BAR_W}
                        height={PLOT_H}
                        fill="transparent"
                      >
                        <title>{bar.tooltip}</title>
                      </rect>
                      {barHeight > 0 && (
                        <path
                          d={barPath(bar.x, TOP_PAD + PLOT_H - barHeight, BAR_W, barHeight)}
                          fill={bar.color}
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  );
                })}

                <text
                  x={groupX + GROUP_W / 2}
                  y={TOP_PAD + PLOT_H + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#52514e"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {month.month.slice(0, 7)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {[
          { label: "Задължение (наем + сметки)", color: CHARGES_COLOR },
          { label: "Платено", color: PAID_COLOR },
        ].map((series) => (
          <span key={series.label} className="flex items-center gap-1.5 text-xs text-neutral-600">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: series.color }}
            />
            {series.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

const CHARGE_COLUMNS = [
  { key: "rent_due", label: "Наем" },
  { key: "bills_electricity", label: "Ток" },
  { key: "bills_water", label: "Вода" },
  { key: "bills_heating", label: "Топлофикация" },
  { key: "bills_building_fee", label: "Входна такса" },
] as const;

function BreakdownTable({ months }: { months: ChartMonth[] }) {
  const currency = months[0]?.currency ?? "EUR";

  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200">
      <table className="w-full text-xs">
        <thead className="border-b border-neutral-200 text-left text-neutral-500">
          <tr>
            <th className="px-3 py-1.5 font-medium">Месец</th>
            {CHARGE_COLUMNS.map((column) => (
              <th key={column.key} className="px-3 py-1.5 text-right font-medium">
                {column.label}
              </th>
            ))}
            <th className="px-3 py-1.5 text-right font-medium">Друго</th>
            <th className="px-3 py-1.5 text-right font-medium">Задължение</th>
            <th className="px-3 py-1.5 text-right font-medium">Платено</th>
            <th className="px-3 py-1.5 text-right font-medium">Баланс</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {[...months].reverse().map((month) => (
            <tr key={month.month} style={{ fontVariantNumeric: "tabular-nums" }}>
              <td className="px-3 py-1.5 whitespace-nowrap">{month.month.slice(0, 7)}</td>
              {CHARGE_COLUMNS.map((column) => (
                <td key={column.key} className="px-3 py-1.5 text-right whitespace-nowrap">
                  {formatMoney(month[column.key], currency)}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                {formatMoney(
                  addMoney(month.bills_internet, month.bills_other, month.expenses_due),
                  currency,
                )}
              </td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                {formatMoney(month.charges, currency)}
              </td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                {formatMoney(month.paid, currency)}
              </td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                {formatMoney(month.balance.replace("-", ""), currency)}
                {month.balance.startsWith("-") ? " дълг" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PropertyChartTable({
  months,
  propertyId,
}: {
  months: ChartMonth[];
  propertyId: string;
}) {
  if (months.length === 0) return null;

  return (
    <>
      <details className="no-print mt-3">
        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-900">
          Виж като таблица
        </summary>
        <div className="mt-2">
          <BreakdownTable months={months} />
          <p className="mt-2 flex items-center gap-4 text-xs">
            <a
              href={`/properties/${propertyId}/export?table=breakdown`}
              className="font-medium text-neutral-900 hover:underline"
            >
              Свали CSV
            </a>
            <PrintButton label="PDF" />
          </p>
        </div>
      </details>

      {/* On paper the table is always shown, whether or not it was opened. */}
      <div className="mt-3 hidden print:block">
        <BreakdownTable months={months} />
      </div>
    </>
  );
}
