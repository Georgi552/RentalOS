import { PrintButton } from "@/components/print-button";
import { addMoney, formatMoney } from "@/lib/money";

// Categorical slots 1 and 6 of the validated order (blue, green).
// Validated on this pair: CVD delta-E 26.5, normal-vision 29.0, both above 3:1.
const CHARGES_COLOR = "#2a78d6";
const PAID_COLOR = "#008300";

// A split lease gets four bars, but on two panels sharing the month axis
// rather than one group. Advance rent is the reason the split exists, and a
// single scale sized to a 1650 EUR advance renders a 70 EUR water bill as
// three pixels - the very stream the landlord opened the split to watch.
//
// Two panels also keep blue and green for due and paid in both streams, which
// one group could not: the validator measures green against orange at CVD
// delta-E 3.2, so "наем платен" and "сметки дължими" would have looked
// identical to a colourblind reader.
const SPLIT_PANELS = [
  {
    title: "Наем",
    series: [
      { key: "rent_due", label: "Наем дължим", color: CHARGES_COLOR },
      { key: "paid_rent", label: "Наем платен", color: PAID_COLOR },
    ],
  },
  {
    title: "Сметки",
    series: [
      { key: "bills_and_expenses_due", label: "Сметки дължими", color: CHARGES_COLOR },
      { key: "paid_bills", label: "Сметки платени", color: PAID_COLOR },
    ],
  },
] as const;

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
  charges_due: string;
  paid_rent: string;
  paid_bills: string;
  bills_and_expenses_due: string;
  rent_balance: string;
  bills_balance: string;
  split_rent_and_bills: boolean;
  due_date: string;
  is_due: boolean;
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
const BAR_GAP = 2; // surface gap between adjacent bars
const GROUP_W = 50;
const GROUP_GAP = 34;
const TOP_PAD = 12;
const PLOT_H = 170;
const LABEL_H = 24;
// Split view: two shorter panels stacked, each with room for its title.
const PANEL_PAD = 26;
const PANEL_H = 104;
const PANEL_GAP = 34;

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
function chargesTooltip(month: ChartMonth, split = false) {
  const lines = [`${month.month.slice(0, 7)} · ${split ? "наем" : "задължение"}`];
  if (split) {
    lines.push(`Наем: ${formatMoney(month.rent_due, month.currency)}`);
    lines.push(`Сметки отделно: ${formatMoney(month.bills_and_expenses_due, month.currency)}`);
    if (!month.is_due) lines.push(`Още не е дължимо · падеж ${month.due_date}`);
    return lines.join("\n");
  }

  for (const part of PARTS) {
    const value = month[part.key];
    if (value && value !== "0.00") {
      lines.push(`${part.label}: ${formatMoney(value, month.currency)}`);
    }
  }

  lines.push(`Общо: ${formatMoney(month.charges, month.currency)}`);
  if (!month.is_due) lines.push(`Още не е дължимо · падеж ${month.due_date}`);
  return lines.join("\n");
}

export function PropertyChart({ months }: { months: ChartMonth[] }) {
  if (months.length === 0) return null;

  return months[0].split_rent_and_bills ? (
    <SplitChart months={months} />
  ) : (
    <CombinedChart months={months} />
  );
}

function Gridlines({
  top,
  plot,
  max,
  width,
}: {
  top: number;
  plot: number;
  max: number;
  width: number;
}) {
  return (
    <>
      {[0, 0.5, 1].map((t) => {
        const y = top + plot - t * plot;
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
    </>
  );
}

function MonthLabels({ months, y, width }: { months: ChartMonth[]; y: number; width: number }) {
  return (
    <>
      {months.map((month, index) => (
        <text
          key={month.month}
          x={AXIS_W + GROUP_GAP / 2 + index * (GROUP_W + GROUP_GAP) + GROUP_W / 2}
          y={y}
          textAnchor="middle"
          fontSize={11}
          fill="#52514e"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {month.month.slice(0, 7)}
        </text>
      ))}
      {width ? null : null}
    </>
  );
}

function Legend({ series }: { series: readonly { key: string; label: string; color: string }[] }) {
  return (
    <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
      {series.map((entry) => (
        <span key={entry.key} className="flex items-center gap-1.5 text-xs text-neutral-600">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: entry.color }}
          />
          {entry.label}
        </span>
      ))}
    </figcaption>
  );
}

function Bars({
  months,
  series,
  top,
  plot,
  max,
  tooltipFor,
}: {
  months: ChartMonth[];
  series: readonly { key: keyof ChartMonth; label: string; color: string }[];
  top: number;
  plot: number;
  max: number;
  // The caller formats the text, since only it knows the currency and which
  // series carries the breakdown.
  tooltipFor: (month: ChartMonth, key: string, label: string) => string;
}) {
  const barW = Math.floor((GROUP_W - (series.length - 1) * BAR_GAP) / series.length);
  const groupInner = series.length * barW + (series.length - 1) * BAR_GAP;

  return (
    <>
      {months.map((month, index) => {
        const groupX =
          AXIS_W + GROUP_GAP / 2 + index * (GROUP_W + GROUP_GAP) + (GROUP_W - groupInner) / 2;

        return series.map((entry, entryIndex) => {
          const x = groupX + entryIndex * (barW + BAR_GAP);
          const barHeight = (Number(month[entry.key]) / max) * plot;

          return (
            <g key={`${month.month}-${entry.key}`}>
              {/* Hit target spans the plot so a small bar stays hoverable. */}
              <rect x={x} y={top} width={barW} height={plot} fill="transparent">
                <title>{tooltipFor(month, entry.key as string, entry.label)}</title>
              </rect>
              {barHeight > 0 && (
                <path
                  d={barPath(x, top + plot - barHeight, barW, barHeight)}
                  fill={entry.color}
                  // Not yet due is drawn faint: the amount is real but is not
                  // owed today. What was paid is never faint.
                  opacity={month.is_due || String(entry.key).startsWith("paid") ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        });
      })}
    </>
  );
}

function CombinedChart({ months }: { months: ChartMonth[] }) {
  const currency = months[0].currency;
  const series = [
    { key: "charges" as const, label: "Задължение (наем + сметки)", color: CHARGES_COLOR },
    { key: "paid" as const, label: "Платено", color: PAID_COLOR },
  ];

  const peak = Math.max(...months.flatMap((m) => series.map((s) => Number(m[s.key]))), 1);
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
          <Gridlines top={TOP_PAD} plot={PLOT_H} max={max} width={width} />
          <Bars
            months={months}
            series={series}
            top={TOP_PAD}
            plot={PLOT_H}
            max={max}
            tooltipFor={(month, key, label) =>
              key === "charges"
                ? chargesTooltip(month)
                : `${month.month.slice(0, 7)} · ${label}: ${formatMoney(month.paid, currency)}`
            }
          />
          <MonthLabels months={months} y={TOP_PAD + PLOT_H + 16} width={width} />
        </svg>
      </div>
      <Legend series={series} />
    </figure>
  );
}

function SplitChart({ months }: { months: ChartMonth[] }) {
  const currency = months[0].currency;
  const width = AXIS_W + months.length * (GROUP_W + GROUP_GAP);
  const secondTop = PANEL_PAD + PANEL_H + PANEL_GAP;
  const height = secondTop + PANEL_H + LABEL_H;

  const tooltipFor = (month: ChartMonth, key: string, label: string) =>
    `${month.month.slice(0, 7)} · ${label}: ${formatMoney(
      month[key as keyof ChartMonth] as string,
      currency,
    )}` + (!month.is_due && !key.startsWith("paid") ? `\nОще не е дължимо · падеж ${month.due_date}` : "");

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="Наем и сметки по месеци, всяко със свой баланс"
          className="max-w-full"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          {SPLIT_PANELS.map((panel, panelIndex) => {
            const top = panelIndex === 0 ? PANEL_PAD : secondTop;
            // Each stream keeps its own scale: an advance rent payment must not
            // flatten the bills panel it sits beside.
            const peak = Math.max(
              ...months.flatMap((m) => panel.series.map((s) => Number(m[s.key]))),
              1,
            );
            const max = niceMax(peak);

            return (
              <g key={panel.title}>
                <text x={0} y={top - 8} fontSize={10} fill="#898781">
                  {panel.title}
                </text>
                <Gridlines top={top} plot={PANEL_H} max={max} width={width} />
                <Bars
                  months={months}
                  series={panel.series}
                  top={top}
                  plot={PANEL_H}
                  max={max}
                  tooltipFor={tooltipFor}
                />
              </g>
            );
          })}
          <MonthLabels months={months} y={secondTop + PANEL_H + 16} width={width} />
        </svg>
      </div>
      <Legend
        series={[
          { key: "due", label: "Дължимо", color: CHARGES_COLOR },
          { key: "paid", label: "Платено", color: PAID_COLOR },
        ]}
      />
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
