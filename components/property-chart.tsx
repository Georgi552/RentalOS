import { addMoney, formatMoney } from "@/lib/money";

// Categorical slots 1-6 of the validated order (blue, orange, aqua, yellow,
// magenta, green). The order is the colourblind-safety mechanism, so series
// are assigned in slot order rather than by taste.
// Validated: worst adjacent CVD delta-E 9.1, normal-vision 19.6.
// Categorical slots of the validated order. The order is the colourblind-safety
// mechanism, so series take slots rather than hand-picked colours.
// Validated per panel: rent/paid worst adjacent CVD delta-E 26.5; utilities 9.1.
const MONEY_SERIES = [
  { key: "rent_due", label: "Наем", color: "#2a78d6" },
  { key: "paid", label: "Платено", color: "#008300" },
] as const;

const BILL_SERIES = [
  { key: "bills_electricity", label: "Ток", color: "#eb6834" },
  { key: "bills_water", label: "Вода", color: "#1baf7a" },
  { key: "bills_heating", label: "Топлофикация", color: "#eda100" },
  { key: "bills_building_fee", label: "Входна такса", color: "#e87ba4" },
] as const;

const ALL_SERIES = [...MONEY_SERIES, ...BILL_SERIES];

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

const AXIS_W = 52;
const GROUP_W = 58;
const GROUP_GAP = 30;
const BAR_GAP = 2; // surface gap between adjacent bars
const TOP_PAD = 26; // room for the panel title above the plot
const RENT_H = 118;
const BILL_H = 84;
const PANEL_GAP = 36;
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

// Chooses a top of scale whose halves are round numbers, so gridlines read as
// 0 / 400 / 800 rather than 0 / 325 / 650.
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

export function PropertyChart({ months }: { months: ChartMonth[] }) {
  if (months.length === 0) return null;

  const currency = months[0].currency;

  // Only pixel geometry converts to a number; displayed amounts stay exact
  // decimal strings (see lib/money.ts).
  const peak = (keys: readonly { key: keyof ChartMonth }[]) =>
    Math.max(...months.flatMap((m) => keys.map((s) => Number(m[s.key]))), 1);

  // Rent and utilities differ by an order of magnitude, so they get their own
  // panels rather than one scale where a 12 EUR water bill is three pixels.
  // Two panels sharing a month axis, never two scales on one plot.
  const rentMax = niceMax(peak(MONEY_SERIES));
  const billMax = niceMax(peak(BILL_SERIES));

  const width = AXIS_W + months.length * (GROUP_W + GROUP_GAP);
  const billTop = TOP_PAD + RENT_H + PANEL_GAP;
  const height = billTop + BILL_H + LABEL_H;

  const panels = [
    { series: MONEY_SERIES, top: TOP_PAD, plot: RENT_H, max: rentMax, title: "Наем и плащане" },
    { series: BILL_SERIES, top: billTop, plot: BILL_H, max: billMax, title: "Сметки" },
  ] as const;

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="Начислен наем, сметки и платено по месеци"
          className="max-w-full"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          {panels.map((panel) => {
            const barW = Math.floor(
              (GROUP_W - (panel.series.length - 1) * BAR_GAP) / panel.series.length,
            );
            const groupInner = panel.series.length * barW + (panel.series.length - 1) * BAR_GAP;

            return (
              <g key={panel.title}>
                <text x={0} y={panel.top - 8} fontSize={10} fill="#898781">
                  {panel.title}
                </text>

                {[0, 0.5, 1].map((t) => {
                  const y = panel.top + panel.plot - t * panel.plot;
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
                        {Math.round(panel.max * t)}
                      </text>
                    </g>
                  );
                })}

                {months.map((month, index) => {
                  const groupX =
                    AXIS_W +
                    GROUP_GAP / 2 +
                    index * (GROUP_W + GROUP_GAP) +
                    (GROUP_W - groupInner) / 2;

                  return panel.series.map((series, seriesIndex) => {
                    const value = Number(month[series.key]);
                    const barHeight = (value / panel.max) * panel.plot;
                    const x = groupX + seriesIndex * (barW + BAR_GAP);

                    return (
                      <g key={`${month.month}-${series.key}`}>
                        {/* Hit target spans the panel so a small bar stays hoverable. */}
                        <rect x={x} y={panel.top} width={barW} height={panel.plot} fill="transparent">
                          <title>{`${month.month.slice(0, 7)} · ${series.label}: ${formatMoney(
                            month[series.key],
                            currency,
                          )}`}</title>
                        </rect>
                        {barHeight > 0 && (
                          <path
                            d={barPath(x, panel.top + panel.plot - barHeight, barW, barHeight)}
                            fill={series.color}
                            pointerEvents="none"
                          />
                        )}
                      </g>
                    );
                  });
                })}
              </g>
            );
          })}

          {months.map((month, index) => (
            <text
              key={month.month}
              x={AXIS_W + GROUP_GAP / 2 + index * (GROUP_W + GROUP_GAP) + GROUP_W / 2}
              y={billTop + BILL_H + 16}
              textAnchor="middle"
              fontSize={11}
              fill="#52514e"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {month.month.slice(0, 7)}
            </text>
          ))}
        </svg>
      </div>

      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {ALL_SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1.5 text-xs text-neutral-600">
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

// Three of the series sit below 3:1 contrast on a light surface, so the numbers
// must be readable without relying on the colours. This table is that relief,
// and it also carries the charges the chart leaves out.
const CHARGE_COLUMNS = [
  { key: "rent_due", label: "Наем" },
  { key: "bills_electricity", label: "Ток" },
  { key: "bills_water", label: "Вода" },
  { key: "bills_heating", label: "Топлофикация" },
  { key: "bills_building_fee", label: "Входна такса" },
] as const;

export function PropertyChartTable({ months }: { months: ChartMonth[] }) {
  const currency = months[0]?.currency ?? "EUR";

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-900">
        Виж като таблица
      </summary>
      <div className="mt-2 overflow-x-auto rounded-md border border-neutral-200">
        <table className="w-full text-xs">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr>
              <th className="px-3 py-1.5 font-medium">Месец</th>
              {CHARGE_COLUMNS.map((s) => (
                <th key={s.key} className="px-3 py-1.5 text-right font-medium">
                  {s.label}
                </th>
              ))}
              <th className="px-3 py-1.5 text-right font-medium">Друго</th>
              <th className="px-3 py-1.5 text-right font-medium">Начислено</th>
              <th className="px-3 py-1.5 text-right font-medium">Платено</th>
              <th className="px-3 py-1.5 text-right font-medium">Баланс</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {[...months].reverse().map((month) => (
              <tr key={month.month} style={{ fontVariantNumeric: "tabular-nums" }}>
                <td className="px-3 py-1.5 whitespace-nowrap">{month.month.slice(0, 7)}</td>
                {CHARGE_COLUMNS.map((s) => (
                  <td key={s.key} className="px-3 py-1.5 text-right whitespace-nowrap">
                    {formatMoney(month[s.key], currency)}
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
    </details>
  );
}
