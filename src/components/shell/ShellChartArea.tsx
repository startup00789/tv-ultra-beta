import { useEffect, useMemo, useState } from 'react';
import { Calendar, Terminal } from 'lucide-react';
import {
  useWorkspaceStore,
  type DateRangePreset,
  type ScaleMode,
} from '../../state/workspaceStore';
import type { WorkspaceSlots } from './slots';

const DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  '1D',
  '5D',
  '1M',
  '3M',
  '6M',
  'YTD',
  '1Y',
  '5Y',
  'All',
];

function formatUtcClock(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss} UTC`;
}

function formatPrice(val: number, precisionHint?: number): string {
  const ref = precisionHint ?? val;
  if (Math.abs(ref) < 10) return val.toFixed(4);
  return val.toFixed(2);
}

interface ShellChartAreaProps {
  slots?: WorkspaceSlots;
}

export function ShellChartArea({ slots }: ShellChartAreaProps) {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const symbolInfo = useWorkspaceStore((s) => s.symbolInfo);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bars = useWorkspaceStore((s) => s.bars);
  const hoveredBar = useWorkspaceStore((s) => s.hoveredBar);
  const loadingBars = useWorkspaceStore((s) => s.loadingBars);
  const marketError = useWorkspaceStore((s) => s.marketError);
  const dateRange = useWorkspaceStore((s) => s.dateRange);
  const scaleMode = useWorkspaceStore((s) => s.scaleMode);
  const autoScale = useWorkspaceStore((s) => s.autoScale);
  const bottomDrawerOpen = useWorkspaceStore((s) => s.bottomDrawerOpen);
  const indicators = useWorkspaceStore((s) => s.indicators);
  const chartOverlay = useWorkspaceStore((s) => s.chartOverlay);

  const setDateRange = useWorkspaceStore((s) => s.setDateRange);
  const setScaleMode = useWorkspaceStore((s) => s.setScaleMode);
  const toggleAutoScale = useWorkspaceStore((s) => s.toggleAutoScale);
  const toggleBottomDrawer = useWorkspaceStore((s) => s.toggleBottomDrawer);
  const setGoToDateTimestamp = useWorkspaceStore((s) => s.setGoToDateTimestamp);
  const loadingMoreHistory = useWorkspaceStore((s) => s.loadingMoreHistory);
  const loadDeepHistory = useWorkspaceStore((s) => s.loadDeepHistory);

  const [clockText, setClockText] = useState(() => formatUtcClock(new Date()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateInputVal, setDateInputVal] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setClockText(formatUtcClock(new Date()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const displayBar = hoveredBar ?? bars[bars.length - 1] ?? null;
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : displayBar;
  const delta = displayBar && prevBar ? displayBar.close - prevBar.close : 0;
  const deltaPct =
    displayBar && prevBar && prevBar.close > 0 ? (delta / prevBar.close) * 100 : 0;
  const isBull = displayBar ? displayBar.close >= displayBar.open : true;

  const svgBars = useMemo(() => {
    const slice = bars.slice(-80);
    if (slice.length === 0) return null;
    let minLow = Infinity;
    let maxHigh = -Infinity;
    for (const b of slice) {
      if (b.low < minLow) minLow = b.low;
      if (b.high > maxHigh) maxHigh = b.high;
    }
    const span = Math.max(1e-6, maxHigh - minLow);
    return { slice, minLow, maxHigh, span };
  }, [bars]);

  const toggleScale = (mode: Exclude<ScaleMode, 'regular'>) => {
    setScaleMode(scaleMode === mode ? 'regular' : mode);
  };

  return (
    <section
      data-testid="main-chart-area"
      className="flex-1 min-w-[320px] min-h-0 flex flex-col tv-panel overflow-hidden"
    >
      {/* Main Canvas Pane */}
      <div
        data-testid="chart-canvas-pane"
        className="flex-1 min-h-0 relative bg-[var(--tv-bg-canvas)] overflow-hidden"
      >
        {/* Top-Left Floating Legend HUD */}
        {slots?.chartLegend ? (
          slots.chartLegend
        ) : (
          <div
            data-testid="chart-legend"
            className="absolute top-2.5 left-3 z-10 flex flex-col gap-1 pointer-events-none select-none"
          >
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--tv-accent)]/20 text-[var(--tv-accent)] text-[10px] font-bold">
                {symbol.slice(0, 2)}
              </span>
              <span className="font-semibold text-[var(--tv-text-primary)]">
                {symbolInfo?.name ?? symbol} · {timeframe} ·{' '}
                {symbolInfo?.exchange ?? 'NASDAQ'}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-[#089981] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#089981]" />
                Open
              </span>
              {displayBar && (
                <div className="flex items-center gap-2 text-[12px] tabular-nums">
                  <span>
                    <span className="text-[var(--tv-text-muted)]">O</span>
                    <span className={isBull ? 'text-[#089981]' : 'text-[#f23645]'}>
                      {formatPrice(displayBar.open)}
                    </span>
                  </span>
                  <span>
                    <span className="text-[var(--tv-text-muted)]">H</span>
                    <span className={isBull ? 'text-[#089981]' : 'text-[#f23645]'}>
                      {formatPrice(displayBar.high)}
                    </span>
                  </span>
                  <span>
                    <span className="text-[var(--tv-text-muted)]">L</span>
                    <span className={isBull ? 'text-[#089981]' : 'text-[#f23645]'}>
                      {formatPrice(displayBar.low)}
                    </span>
                  </span>
                  <span>
                    <span className="text-[var(--tv-text-muted)]">C</span>
                    <span className={isBull ? 'text-[#089981]' : 'text-[#f23645]'}>
                      {formatPrice(displayBar.close)}
                    </span>
                  </span>
                  <span className={delta >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                    {delta >= 0 ? '+' : ''}
                    {formatPrice(delta, displayBar.close)} ({delta >= 0 ? '+' : ''}
                    {deltaPct.toFixed(2)}%)
                  </span>
                </div>
              )}
            </div>

            {indicators.length > 0 && (
              <div className="flex flex-col gap-0.5 text-[11px] text-[var(--tv-text-secondary)]">
                {indicators.map((ind) => (
                  <div key={ind.instanceId} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: ind.color }}
                    />
                    <span>
                      {ind.name} (
                      {Object.values(ind.params).join(', ') || 'default'})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chart Canvas (M2 Slot or M1 SVG Candlestick Preview Fallback) */}
        {slots?.chartCanvas ? (
          slots.chartCanvas
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            {/* Background Watermark */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center select-none">
              <div
                className="text-[48px] font-bold tracking-wider"
                style={{ color: 'var(--tv-watermark)' }}
              >
                {symbol}, {timeframe}
              </div>
              <div
                className="text-[13px] font-medium mt-1"
                style={{ color: 'var(--tv-watermark)' }}
              >
                {symbolInfo?.name ?? 'Market Data Shell'}
              </div>
            </div>

            {marketError && (
              <div className="absolute top-12 right-4 z-20 px-3 py-1.5 rounded-[4px] border border-[#f23645]/40 bg-[#f23645]/10 text-[#f23645] text-[12px]">
                {marketError}
              </div>
            )}

            {loadingBars && bars.length === 0 ? (
              <div className="text-[12px] text-[var(--tv-text-muted)]">
                Loading {symbol} ({timeframe})...
              </div>
            ) : svgBars ? (
              <div className="w-full h-full flex">
                {/* Candlestick SVG Preview */}
                <svg
                  viewBox="0 0 800 400"
                  preserveAspectRatio="none"
                  className="flex-1 h-full"
                  aria-label={`${symbol} ${timeframe} chart preview`}
                >
                  {/* Subtle grid lines */}
                  {[80, 160, 240, 320].map((y) => (
                    <line
                      key={y}
                      x1={0}
                      y1={y}
                      x2={800}
                      y2={y}
                      stroke="var(--tv-grid-line)"
                      strokeWidth={1}
                    />
                  ))}
                  {[160, 320, 480, 640].map((x) => (
                    <line
                      key={x}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={400}
                      stroke="var(--tv-grid-line)"
                      strokeWidth={1}
                    />
                  ))}

                  {svgBars.slice.map((bar, idx) => {
                    const stepW = 800 / svgBars.slice.length;
                    const cx = idx * stepW + stepW / 2;
                    const yHigh =
                      24 + (1 - (bar.high - svgBars.minLow) / svgBars.span) * 352;
                    const yLow =
                      24 + (1 - (bar.low - svgBars.minLow) / svgBars.span) * 352;
                    const yOpen =
                      24 + (1 - (bar.open - svgBars.minLow) / svgBars.span) * 352;
                    const yClose =
                      24 + (1 - (bar.close - svgBars.minLow) / svgBars.span) * 352;
                    const bull = bar.close >= bar.open;
                    const color = bull ? '#089981' : '#f23645';
                    const bodyTop = Math.min(yOpen, yClose);
                    const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
                    const bodyW = Math.max(2, stepW * 0.62);
                    return (
                      <g key={bar.time}>
                        <line
                          x1={cx}
                          y1={yHigh}
                          x2={cx}
                          y2={yLow}
                          stroke={color}
                          strokeWidth={1.2}
                        />
                        <rect
                          x={cx - bodyW / 2}
                          y={bodyTop}
                          width={bodyW}
                          height={bodyH}
                          fill={color}
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Right Price Scale Placeholder */}
                <div className="w-[66px] shrink-0 border-l border-[var(--tv-border)] flex flex-col justify-between py-4 px-1.5 text-[11px] tabular-nums text-[var(--tv-text-muted)] select-none">
                  <span>{formatPrice(svgBars.maxHigh)}</span>
                  <span>
                    {formatPrice(svgBars.minLow + svgBars.span * 0.66)}
                  </span>
                  {displayBar && (
                    <span
                      className={`px-1 py-0.5 rounded-[2px] text-[11px] font-semibold text-white text-center ${
                        isBull ? 'bg-[#089981]' : 'bg-[#f23645]'
                      }`}
                    >
                      {formatPrice(displayBar.close)}
                    </span>
                  )}
                  <span>
                    {formatPrice(svgBars.minLow + svgBars.span * 0.33)}
                  </span>
                  <span>{formatPrice(svgBars.minLow)}</span>
                </div>
              </div>
            ) : null}

            {chartOverlay?.forecast && (
              <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-accent)]">
                Forecast overlay ready: {chartOverlay.forecast.label}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Range & Scale Controls Bar (39px height) */}
      {slots?.bottomRangeBar ? (
        slots.bottomRangeBar
      ) : (
        <div
          data-testid="bottom-range-bar"
          className="h-[39px] shrink-0 border-t border-[var(--tv-border)] px-3 flex items-center justify-between gap-2 bg-[var(--tv-bg-panel)]"
        >
          {/* Left: Range Presets + Console Drawer Trigger */}
          <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
            {DATE_RANGE_PRESETS.map((preset) => {
              const active = dateRange === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDateRange(preset)}
                  className={`h-[24px] px-2 rounded-[4px] text-[12px] font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)] font-semibold'
                      : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                  }`}
                >
                  {preset}
                </button>
              );
            })}

            <button
              type="button"
              data-testid="go-to-date-btn"
              aria-label="Go to date"
              title="Go to date"
              onClick={() => setDatePickerOpen((v) => !v)}
              className={`w-[26px] h-[24px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
                datePickerOpen
                  ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)]'
                  : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
            </button>
            {datePickerOpen && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const ms = Date.parse(dateInputVal);
                  if (Number.isFinite(ms)) {
                    setGoToDateTimestamp(Math.floor(ms / 1000));
                    setDatePickerOpen(false);
                  }
                }}
                className="flex items-center gap-1 ml-1"
              >
                <input
                  type="date"
                  aria-label="Target chart date"
                  value={dateInputVal}
                  onChange={(e) => setDateInputVal(e.target.value)}
                  className="h-[24px] px-1.5 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)]"
                />
                <button
                  type="submit"
                  className="h-[24px] px-2 rounded bg-[var(--tv-accent)] text-white text-[10px] font-semibold cursor-pointer"
                >
                  Go
                </button>
              </form>
            )}

            <div className="tv-divider-v mx-1.5" />

            <button
              type="button"
              aria-label="Toggle Strategy & Forward Demo"
              onClick={toggleBottomDrawer}
              className={`h-[24px] px-2 rounded-[4px] flex items-center gap-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
                bottomDrawerOpen
                  ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)]'
                  : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Strategy &amp; Forward Demo</span>
            </button>

            <div className="hidden md:flex items-center gap-1 ml-1">
              <span
                data-testid="ultra-bars-badge"
                className="px-1.5 py-0.5 rounded bg-[#2962ff]/12 border border-[#2962ff]/35 text-[10px] font-mono font-semibold text-[var(--tv-accent)]"
                title="TradingView Ultra Historical Depth (scroll left or click 15k / 40k Max)"
              >
                {loadingMoreHistory
                  ? 'LOADING ULTRA...'
                  : `ULTRA · ${bars.length.toLocaleString()} BARS`}
              </span>
              {bars.length < 15000 && (
                <button
                  type="button"
                  data-testid="load-15k-bars-btn"
                  disabled={loadingMoreHistory}
                  onClick={() => void loadDeepHistory(15000)}
                  className="h-[20px] px-1.5 rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[10px] font-mono text-[var(--tv-text-secondary)] cursor-pointer disabled:opacity-45"
                >
                  +15k
                </button>
              )}
              {bars.length < 40000 && (
                <button
                  type="button"
                  data-testid="load-40k-bars-btn"
                  disabled={loadingMoreHistory}
                  onClick={() => void loadDeepHistory(40000)}
                  className="h-[20px] px-1.5 rounded bg-[#f59e0b]/15 hover:bg-[#f59e0b]/25 border border-[#f59e0b]/40 text-[10px] font-mono font-semibold text-[#f59e0b] cursor-pointer disabled:opacity-45"
                >
                  40k Max
                </button>
              )}
            </div>
          </div>

          {/* Right: UTC Clock & Scale Mode Toggles */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[12px] tabular-nums text-[var(--tv-text-secondary)]">
              {clockText}
            </span>

            <div className="tv-divider-v" />

            <button
              type="button"
              aria-label="Percent scale"
              aria-pressed={scaleMode === 'percent'}
              onClick={() => toggleScale('percent')}
              className={`h-[24px] px-1.5 rounded-[4px] text-[12px] font-medium transition-colors cursor-pointer ${
                scaleMode === 'percent'
                  ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)] font-semibold'
                  : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)]'
              }`}
            >
              %
            </button>

            <button
              type="button"
              aria-label="Logarithmic scale"
              aria-pressed={scaleMode === 'log'}
              onClick={() => toggleScale('log')}
              className={`h-[24px] px-1.5 rounded-[4px] text-[12px] font-medium transition-colors cursor-pointer ${
                scaleMode === 'log'
                  ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)] font-semibold'
                  : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)]'
              }`}
            >
              log
            </button>

            <button
              type="button"
              aria-label="Auto scale"
              aria-pressed={autoScale}
              onClick={toggleAutoScale}
              className={`h-[24px] px-1.5 rounded-[4px] text-[12px] font-medium transition-colors cursor-pointer ${
                autoScale
                  ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)] font-semibold'
                  : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)]'
              }`}
            >
              auto
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
