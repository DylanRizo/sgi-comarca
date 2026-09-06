'use client';

/**
 * Inline SVG charts. The approved scope forbids a new interface dependency, so
 * these are drawn by hand: they follow the theme tokens, scale with the
 * container and stay readable in light and dark.
 *
 * Every chart is announced as a single image with a written summary, and each
 * datum carries a `<title>` so a pointer reveals the exact value. A chart never
 * carries information that is not also written as text nearby.
 */

type Formatter = (value: number) => string;

/** Nice round steps so an axis reads 0, 25, 50 rather than 0, 23.7, 47.4. */
function axisTicks(maximum: number, count = 4): readonly number[] {
  if (!Number.isFinite(maximum) || maximum <= 0) return [0];
  const raw = maximum / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ??
    magnitude * 10;
  const ticks: number[] = [];
  for (let value = 0; value <= maximum + step / 2; value += step) ticks.push(value);
  return ticks;
}

export function ChartEmpty({ message }: Readonly<{ message: string }>) {
  return <p className="chart-empty">{message}</p>;
}

/**
 * Vertical bars for a period series, with an optional second series drawn as a
 * line on its own right-hand axis. Both axes are labelled, because two scales
 * in one frame are only honest when the reader can see which is which.
 */
export function PeriodChart({
  bars,
  barLabel,
  formatBar,
  formatLine,
  labels,
  line,
  lineLabel,
  summary,
}: Readonly<{
  bars: readonly number[];
  barLabel: string;
  formatBar: Formatter;
  formatLine?: Formatter;
  labels: readonly string[];
  line?: readonly number[];
  lineLabel?: string;
  summary: string;
}>) {
  const width = 720,
    height = 260,
    left = 62,
    right = line ? 54 : 14,
    top = 14,
    bottom = 34;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const barMax = Math.max(...bars, 0);
  const ticks = axisTicks(barMax);
  const scaleMax = ticks[ticks.length - 1] || 1;
  const slot = plotWidth / Math.max(bars.length, 1);
  const barWidth = Math.max(2, Math.min(38, slot * 0.62));
  const lineMax = line ? Math.max(...line, 0) || 1 : 1;
  const x = (index: number) => left + slot * index + slot / 2;
  const y = (value: number) => top + plotHeight - (value / scaleMax) * plotHeight;
  // Labels crowd together beyond a couple of dozen periods, so only every
  // nth is drawn; the tooltip still names each one.
  const labelStep = Math.ceil(bars.length / 12);

  return (
    <svg
      className="chart-figure"
      role="img"
      aria-label={summary}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            className="chart-gridline"
            x1={left}
            x2={left + plotWidth}
            y1={y(tick)}
            y2={y(tick)}
          />
          <text className="chart-axis-text" x={left - 8} y={y(tick) + 4} textAnchor="end">
            {formatBar(tick)}
          </text>
        </g>
      ))}
      {bars.map((value, index) => (
        <rect
          className="chart-bar"
          key={index}
          x={x(index) - barWidth / 2}
          y={y(value)}
          width={barWidth}
          height={Math.max(0, top + plotHeight - y(value))}
          rx="2"
        >
          <title>{`${labels[index] ?? ''} · ${barLabel}: ${formatBar(value)}`}</title>
        </rect>
      ))}
      {line && line.length > 1 ? (
        <polyline
          className="chart-line"
          points={line
            .map(
              (value, index) =>
                `${String(x(index))},${String(top + plotHeight - (value / lineMax) * plotHeight)}`,
            )
            .join(' ')}
        />
      ) : null}
      {line?.map((value, index) => (
        <circle
          className="chart-dot"
          key={index}
          cx={x(index)}
          cy={top + plotHeight - (value / lineMax) * plotHeight}
          r="3"
        >
          <title>{`${labels[index] ?? ''} · ${lineLabel ?? ''}: ${(formatLine ?? String)(value)}`}</title>
        </circle>
      ))}
      {line ? (
        <text
          className="chart-axis-text"
          x={left + plotWidth + 8}
          y={top + 4}
          textAnchor="start"
        >
          {(formatLine ?? String)(lineMax)}
        </text>
      ) : null}
      <line
        className="chart-axis-line"
        x1={left}
        x2={left + plotWidth}
        y1={top + plotHeight}
        y2={top + plotHeight}
      />
      {labels.map((label, index) =>
        index % labelStep === 0 ? (
          <text
            className="chart-axis-text"
            key={label + String(index)}
            x={x(index)}
            y={height - 12}
            textAnchor="middle"
          >
            {label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** A ranked comparison: the shape people read fastest for "who sold most". */
export function RankedBars({
  format,
  items,
  summary,
}: Readonly<{
  format: Formatter;
  items: readonly { label: string; note?: string; value: number }[];
  summary: string;
}>) {
  const rowHeight = 34,
    width = 720,
    labelWidth = 200,
    right = 96;
  const height = Math.max(items.length * rowHeight + 8, rowHeight);
  const maximum = Math.max(...items.map((item) => item.value), 0) || 1;
  const track = width - labelWidth - right;
  return (
    <svg
      className="chart-figure"
      role="img"
      aria-label={summary}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
    >
      {items.map((item, index) => {
        const y = index * rowHeight + 8;
        const length = Math.max(2, (item.value / maximum) * track);
        return (
          <g key={item.label + String(index)}>
            <text className="chart-row-label" x="0" y={y + 15}>
              {item.label.length > 26 ? `${item.label.slice(0, 25)}…` : item.label}
            </text>
            <rect
              className="chart-bar"
              x={labelWidth}
              y={y + 4}
              width={length}
              height={16}
              rx="3"
              style={{ fill: `var(--chart-${String((index % 5) + 1)})` }}
            >
              <title>{`${item.label}: ${format(item.value)}${item.note ? ` · ${item.note}` : ''}`}</title>
            </rect>
            <text className="chart-row-value" x={labelWidth + length + 8} y={y + 17}>
              {format(item.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Composition of a whole: which channels the orders arrived through. */
export function ShareDonut({
  items,
  summary,
}: Readonly<{
  items: readonly { label: string; share: number; value: number }[];
  summary: string;
}>) {
  const size = 190,
    radius = 74,
    thickness = 26,
    centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  // Offsets are derived before drawing rather than accumulated inside the map:
  // mutating during render is what makes a second pass disagree with the first.
  const segments = items.reduce<
    readonly { item: (typeof items)[number]; length: number; offset: number }[]
  >((placed, item) => {
    const previous = placed.at(-1);
    return [
      ...placed,
      {
        item,
        length: item.share * circumference,
        offset: previous ? previous.offset + previous.length : 0,
      },
    ];
  }, []);
  return (
    <div className="chart-donut">
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${String(size)} ${String(size)}`}
      >
        <g transform={`rotate(-90 ${String(centre)} ${String(centre)})`}>
          {segments.map(({ item, length, offset }, index) => (
            <circle
              key={item.label}
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              strokeWidth={thickness}
              stroke={`var(--chart-${String((index % 5) + 1)})`}
              strokeDasharray={`${String(length)} ${String(circumference - length)}`}
              strokeDashoffset={-offset}
            >
              <title>{`${item.label}: ${(item.share * 100).toFixed(1)} % · ${String(item.value)} ventas`}</title>
            </circle>
          ))}
        </g>
      </svg>
      <ul className="chart-legend">
        {items.map((item, index) => (
          <li key={item.label}>
            <span
              aria-hidden="true"
              className="chart-swatch"
              style={{ background: `var(--chart-${String((index % 5) + 1)})` }}
            />
            <span>{item.label}</span>
            <strong>{(item.share * 100).toFixed(1)} %</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * How much of a period a figure actually explains. Margin and inventory value
 * are only honest alongside their coverage, so it gets its own mark.
 */
export function CoverageMeter({
  covered,
  excluded,
  label,
}: Readonly<{ covered: number; excluded: number; label: string }>) {
  const total = covered + excluded;
  const ratio = total === 0 ? 0 : covered / total;
  return (
    <div className="chart-coverage">
      <div
        className="chart-coverage-track"
        role="img"
        aria-label={`${label}: ${(ratio * 100).toFixed(1)} % de ${String(total)} líneas`}
      >
        <span style={{ width: `${String(ratio * 100)}%` }} />
      </div>
      <p>
        <strong>{(ratio * 100).toFixed(1)} %</strong> de {total} líneas.{' '}
        {excluded > 0
          ? `${String(excluded)} sin costo confiable quedan fuera del cálculo.`
          : 'Todas las líneas tienen costo confiable.'}
      </p>
    </div>
  );
}
