/**
 * Long / Short Position drawing engine.
 *
 * Behaviour and formulas are modelled on TradingView's Long/Short Position
 * drawing tools:
 *  - https://www.tradingview.com/support/solutions/43000517002-long-position-drawing-tool/
 *  - https://www.tradingview.com/support/solutions/43000475660-how-to-use-long-and-short-position-drawing-tools/
 *
 * The pure functions in this file are deliberately free of React / chart
 * dependencies so they can be unit-tested and reused by both the renderer and
 * the settings modal.
 */
import type { DrawingObject, DrawingPoint, OHLCVBar } from '../../shared/types';

export type PositionSide = 'long' | 'short';
export type PositionHandleKind = 'entry' | 'target' | 'stop' | 'duration';
export type PositionRiskMode = 'amount' | 'percent';

export const POSITION_TOOLS = ['long_position', 'short_position'] as const;

export function isPositionTool(tool: string | undefined): boolean {
  return tool === 'long_position' || tool === 'short_position';
}

export function positionSide(tool: string): PositionSide {
  return tool === 'short_position' ? 'short' : 'long';
}

export interface PositionConfig {
  accountSize: number;
  lotSize: number;
  riskMode: PositionRiskMode;
  /** Risk amount in account currency, or percent of account size. */
  riskValue: number;
  leverage: number;
  /** Account currency value of one full point for one unit/contract. */
  pointValue: number;
  /** Decimals used when rounding quantity. */
  qtyPrecision: number;
  tickSize: number;
}

export const DEFAULT_POSITION_CONFIG: PositionConfig = {
  accountSize: 10_000,
  lotSize: 1,
  riskMode: 'percent',
  riskValue: 1,
  leverage: 1,
  pointValue: 1,
  qtyPrecision: 2,
  tickSize: 0.01,
};

export const DEFAULT_TARGET_COLOR = '#089981';
export const DEFAULT_STOP_COLOR = '#f23645';
export const DEFAULT_POSITION_LINE_COLOR = '#787b86';

const MIN_RIGHT_GAP_SECONDS = 60;

function finiteOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  const n = finiteOr(value, fallback);
  return n > 0 ? n : fallback;
}

/**
 * Instruments do not currently ship tick metadata through the market API.
 * Infer a sensible tick from the symbol / reference price; the settings modal
 * still lets the user type exact prices.
 */
export function inferTickSize(symbol: string, referencePrice: number): number {
  const sym = (symbol || '').toUpperCase();
  const price = Math.abs(referencePrice) || 1;

  if (sym.endsWith('JPY')) return 0.001;
  if (/(USDT|USDC|BUSD|FDUSD)$/.test(sym)) {
    if (price >= 10_000) return 1;
    if (price >= 100) return 0.01;
    if (price >= 1) return 0.001;
    return 0.00001;
  }
  if (price >= 1) {
    // Six-letter FX-style pairs (EURUSD, GBPUSD, ...) quote in pips.
    if (/^[A-Z]{6}$/.test(sym)) return 0.0001;
    return 0.01;
  }
  if (price >= 0.01) return 0.0001;
  return 0.000001;
}

export function decimalsForTick(tickSize: number): number {
  if (!Number.isFinite(tickSize) || tickSize <= 0) return 2;
  const text = tickSize.toFixed(10).replace(/0+$/, '');
  const idx = text.indexOf('.');
  return idx === -1 ? 0 : Math.min(8, text.length - idx - 1);
}

export interface PositionGeometry {
  leftTime: number;
  rightTime: number;
  entry: number;
  target: number;
  stop: number;
}

export interface NormalizedPositionGeometry extends PositionGeometry {
  adjusted: boolean;
}

/**
 * Clamp TP/SL to the correct side of the entry and guarantee a non-zero risk,
 * exactly like TradingView does while dragging a position handle.
 */
export function normalizePositionGeometry(
  side: PositionSide,
  input: PositionGeometry,
  tickSize: number,
): NormalizedPositionGeometry {
  const entry = finiteOr(input.entry, 0);
  const tick = positiveOr(tickSize, 0.01);
  const gap = Math.max(tick, Math.abs(entry) * 1e-9);

  let target = finiteOr(input.target, side === 'long' ? entry + gap : entry - gap);
  let stop = finiteOr(input.stop, side === 'long' ? entry - gap : entry + gap);

  if (side === 'long') {
    if (target < entry + gap) target = entry + gap;
    if (stop > entry - gap) stop = entry - gap;
  } else {
    if (target > entry - gap) target = entry - gap;
    if (stop < entry + gap) stop = entry + gap;
  }

  let leftTime = finiteOr(input.leftTime, 0);
  let rightTime = finiteOr(input.rightTime, leftTime + MIN_RIGHT_GAP_SECONDS);
  if (rightTime <= leftTime) {
    rightTime = leftTime + MIN_RIGHT_GAP_SECONDS;
  }
  if (leftTime > rightTime) leftTime = rightTime - MIN_RIGHT_GAP_SECONDS;

  return {
    leftTime,
    rightTime,
    entry,
    target,
    stop,
    adjusted:
      Math.abs(target - input.target) > 1e-9 ||
      Math.abs(stop - input.stop) > 1e-9 ||
      Math.abs(rightTime - input.rightTime) > 1e-9 ||
      Math.abs(leftTime - input.leftTime) > 1e-9,
  };
}

function mirrorStop(side: PositionSide, entry: number, target: number): number {
  const distance = Math.abs(target - entry) || Math.abs(entry) * 0.01 || 1;
  return side === 'long' ? entry - distance : entry + distance;
}

/**
 * Resolve geometry from a drawing. Handles legacy 2-anchor positions that only
 * stored `targetPrice` / `stopPrice` by synthesising the missing third anchor.
 */
export function resolvePositionGeometry(
  drawing: Pick<DrawingObject, 'tool' | 'points'> & {
    targetPrice?: number;
    stopPrice?: number;
  },
  tickSize: number,
): NormalizedPositionGeometry {
  const side = positionSide(drawing.tool);
  const points = Array.isArray(drawing.points) ? drawing.points : [];
  const entryPoint = points[0];
  const entry = finiteOr(entryPoint?.price, 0);
  const rightPoint = points[1];
  const stopPoint = points[2];

  const target = finiteOr(drawing.targetPrice, finiteOr(rightPoint?.price, entry));
  const stop = finiteOr(
    drawing.stopPrice,
    finiteOr(stopPoint?.price, mirrorStop(side, entry, target)),
  );

  const leftTime = finiteOr(entryPoint?.time, 0);
  const rightTime = Math.max(
    finiteOr(rightPoint?.time, leftTime + MIN_RIGHT_GAP_SECONDS),
    finiteOr(stopPoint?.time, leftTime + MIN_RIGHT_GAP_SECONDS),
  );

  return normalizePositionGeometry(side, { leftTime, rightTime, entry, target, stop }, tickSize);
}

export function geometryToPoints(geom: PositionGeometry): DrawingPoint[] {
  return [
    { time: geom.leftTime, price: geom.entry },
    { time: geom.rightTime, price: geom.target },
    { time: geom.rightTime, price: geom.stop },
  ];
}

/**
 * Normalise a stored position drawing: three anchors, clamped TP/SL, and every
 * derived field kept in sync. Used by addDrawing / updateDrawing and by the
 * persistence migration.
 */
export function syncPositionDrawing(
  drawing: DrawingObject,
  tickSize?: number,
): DrawingObject {
  if (!isPositionTool(drawing.tool)) return drawing;
  const side = positionSide(drawing.tool);
  const tick = positiveOr(
    tickSize ?? drawing.tickSize ?? inferTickSize(drawing.symbol, drawing.points?.[0]?.price ?? 1),
    0.01,
  );
  const geom = resolvePositionGeometry(drawing, tick);
  const next: DrawingObject = {
    ...drawing,
    points: geometryToPoints(geom),
    targetPrice: geom.target,
    stopPrice: geom.stop,
    tickSize: drawing.tickSize ?? tick,
    targetColor: drawing.targetColor ?? DEFAULT_TARGET_COLOR,
    stopColor: drawing.stopColor ?? DEFAULT_STOP_COLOR,
    showFill: drawing.showFill ?? true,
    fillOpacity: drawing.fillOpacity ?? 0.18,
    showBorder: drawing.showBorder ?? false,
    showPriceLabels: drawing.showPriceLabels ?? true,
    showStats: drawing.showStats ?? true,
    alwaysShowStats: drawing.alwaysShowStats ?? false,
    compactStats: drawing.compactStats ?? false,
    accountSize: positiveOr(drawing.accountSize, DEFAULT_POSITION_CONFIG.accountSize),
    lotSize: positiveOr(drawing.lotSize, DEFAULT_POSITION_CONFIG.lotSize),
    riskMode: drawing.riskMode ?? (drawing.riskAmountUsd !== undefined ? 'amount' : 'percent'),
    leverage: positiveOr(drawing.leverage, 1),
    pointValue: positiveOr(drawing.pointValue, 1),
    qtyPrecision: Math.max(
      0,
      Math.min(8, Math.floor(finiteOr(drawing.qtyPrecision, DEFAULT_POSITION_CONFIG.qtyPrecision))),
    ),
    riskValue: positiveOr(
      drawing.riskMode === 'amount'
        ? drawing.riskValue ?? drawing.riskAmountUsd
        : drawing.riskValue ?? (drawing.riskAmountUsd !== undefined ? undefined : 1),
      drawing.riskMode === 'amount' ? 100 : 1,
    ),
    color: drawing.color ?? DEFAULT_POSITION_LINE_COLOR,
  };
  if (side === 'long' && next.riskMode === 'amount' && next.riskAmountUsd === undefined) {
    next.riskAmountUsd = next.riskValue;
  }
  return next;
}

export function resolvePositionConfig(
  drawing: Partial<DrawingObject>,
  tickSize: number,
): PositionConfig {
  const riskMode: PositionRiskMode =
    drawing.riskMode ?? (drawing.riskAmountUsd !== undefined ? 'amount' : 'percent');
  const riskValue =
    riskMode === 'amount'
      ? positiveOr(drawing.riskValue ?? drawing.riskAmountUsd, 100)
      : positiveOr(drawing.riskValue, 1);
  return {
    accountSize: positiveOr(drawing.accountSize, DEFAULT_POSITION_CONFIG.accountSize),
    lotSize: positiveOr(drawing.lotSize, DEFAULT_POSITION_CONFIG.lotSize),
    riskMode,
    riskValue,
    leverage: positiveOr(drawing.leverage, DEFAULT_POSITION_CONFIG.leverage),
    pointValue: positiveOr(drawing.pointValue, DEFAULT_POSITION_CONFIG.pointValue),
    qtyPrecision: Math.max(
      0,
      Math.min(8, Math.floor(finiteOr(drawing.qtyPrecision, DEFAULT_POSITION_CONFIG.qtyPrecision))),
    ),
    tickSize: positiveOr(tickSize, DEFAULT_POSITION_CONFIG.tickSize),
  };
}

export interface PositionMetrics {
  side: PositionSide;
  entry: number;
  target: number;
  stop: number;
  targetOffset: number;
  stopOffset: number;
  targetPct: number;
  stopPct: number;
  targetTicks: number;
  stopTicks: number;
  riskPerUnit: number;
  rewardPerUnit: number;
  riskReward: number;
  riskSize: number;
  qty: number;
  targetPnl: number;
  stopPnl: number;
  targetBalance: number;
  stopBalance: number;
  valid: boolean;
  reason?: string;
}

function floorToLot(rawQty: number, lotSize: number, precision: number): number {
  const lot = positiveOr(lotSize, 1);
  const flooredLots = Math.floor(rawQty / lot + 1e-9);
  const qty = flooredLots * lot;
  const factor = 10 ** Math.max(0, Math.min(8, precision));
  return Math.max(0, Math.floor(qty * factor + 1e-9) / factor);
}

/**
 * TradingView formulas:
 *   QtyRisk = (Risk / ((Entry - Stop) * PointValue)) / LotSize
 *   QtyLvg  = (Account * Leverage / Entry) * PointValue / LotSize
 *   Qty     = min(QtyRisk, QtyLvg)
 *   PnL     = priceOffset * Qty * PointValue * LotSize
 */
export function computePositionMetrics(
  side: PositionSide,
  geom: PositionGeometry,
  config: PositionConfig,
): PositionMetrics {
  const entry = positiveOr(geom.entry, 0);
  const target = geom.target;
  const stop = geom.stop;
  const tickSize = positiveOr(config.tickSize, 0.01);
  const pointValue = positiveOr(config.pointValue, 1);
  const lotSize = positiveOr(config.lotSize, 1);
  const accountSize = positiveOr(config.accountSize, 1);
  const leverage = positiveOr(config.leverage, 1);

  const riskPerUnit = Math.abs(entry - stop);
  const rewardPerUnit = Math.abs(target - entry);
  const valid = entry > 0 && riskPerUnit > 0 && rewardPerUnit > 0;
  const riskReward = valid ? rewardPerUnit / riskPerUnit : 0;

  const riskSize =
    config.riskMode === 'percent'
      ? (accountSize * positiveOr(config.riskValue, 0)) / 100
      : positiveOr(config.riskValue, 0);

  let qty = 0;
  if (valid && riskSize > 0) {
    const qtyRisk = riskSize / (riskPerUnit * pointValue) / lotSize;
    const qtyLvg = ((accountSize * leverage) / entry) * pointValue / lotSize;
    qty = floorToLot(Math.min(qtyRisk, qtyLvg), lotSize, config.qtyPrecision);
  }

  const targetOffset = rewardPerUnit;
  const stopOffset = riskPerUnit;
  const targetPnl = rewardPerUnit * qty * pointValue * lotSize;
  const stopPnl = -riskPerUnit * qty * pointValue * lotSize;

  return {
    side,
    entry,
    target,
    stop,
    targetOffset,
    stopOffset,
    targetPct: entry > 0 ? (targetOffset / entry) * 100 : 0,
    stopPct: entry > 0 ? (stopOffset / entry) * 100 : 0,
    targetTicks: Math.round(targetOffset / tickSize),
    stopTicks: Math.round(stopOffset / tickSize),
    riskPerUnit,
    rewardPerUnit,
    riskReward,
    riskSize,
    qty,
    targetPnl,
    stopPnl,
    targetBalance: accountSize + targetPnl,
    stopBalance: accountSize + stopPnl,
    valid,
    reason: !valid
      ? entry <= 0
        ? 'Entry price must be positive'
        : 'Target and stop must be on opposite sides of the entry'
      : undefined,
  };
}

export type PositionOutcomeStatus = 'target' | 'stop' | 'open' | 'not-entered' | 'future';

export interface PositionOutcome {
  status: PositionOutcomeStatus;
  closed: boolean;
  pnl: number;
  balance: number;
  openPnl: number;
  qty: number;
  lastPrice: number;
  hitTime?: number;
  ambiguousSameBar?: boolean;
}

function barTouches(bar: OHLCVBar, price: number): boolean {
  return bar.low <= price && price <= bar.high;
}

function pnlForPrice(
  side: PositionSide,
  entry: number,
  price: number,
  qty: number,
  pointValue: number,
  lotSize: number,
): number {
  const diff = side === 'long' ? price - entry : entry - price;
  return diff * qty * pointValue * lotSize;
}

/**
 * Replays the drawn time range to decide whether TP or SL was reached first,
 * producing TradingView's "Closed P&L" / "Open P&L" stat.
 *
 * This is an approximation of TradingView's internal simulation: when both
 * levels are touched inside the same candle the outcome is inherently
 * ambiguous, so we use candle direction as a deterministic tie-breaker and
 * flag the result.
 */
export function simulatePositionOutcome(
  side: PositionSide,
  geom: PositionGeometry,
  metrics: PositionMetrics,
  bars: readonly OHLCVBar[],
  config: PositionConfig,
): PositionOutcome {
  const qty = metrics.qty;
  const pointValue = positiveOr(config.pointValue, 1);
  const lotSize = positiveOr(config.lotSize, 1);
  const accountSize = positiveOr(config.accountSize, 1);
  const sorted = bars;
  const lastBar = sorted[sorted.length - 1];
  const lastPrice = lastBar?.close ?? metrics.entry;
  const base: PositionOutcome = {
    status: 'future',
    closed: false,
    pnl: 0,
    balance: accountSize,
    openPnl: pnlForPrice(side, metrics.entry, lastPrice, qty, pointValue, lotSize),
    qty,
    lastPrice,
  };
  if (!metrics.valid || qty <= 0 || sorted.length === 0) return base;

  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < sorted.length; i += 1) {
    const t = sorted[i].time;
    if (t >= geom.leftTime && t <= geom.rightTime) {
      if (firstIdx === -1) firstIdx = i;
      lastIdx = i;
    }
    if (t > geom.rightTime) break;
  }

  if (firstIdx === -1) return base;

  const rangeLast = sorted[lastIdx] ?? lastBar;
  const rangeLastPrice = rangeLast?.close ?? lastPrice;

  // Position is still to the right of historical data.
  if (geom.leftTime > (lastBar?.time ?? 0)) {
    return { ...base, status: 'future', lastPrice, openPnl: pnlForPrice(side, metrics.entry, lastPrice, qty, pointValue, lotSize) };
  }

  // Find the first candle that trades through the entry.
  let entryIdx = -1;
  for (let i = firstIdx; i <= lastIdx; i += 1) {
    if (barTouches(sorted[i], metrics.entry)) {
      entryIdx = i;
      break;
    }
  }
  if (entryIdx === -1) {
    return {
      ...base,
      status: 'not-entered',
      lastPrice: rangeLastPrice,
      openPnl: pnlForPrice(side, metrics.entry, rangeLastPrice, qty, pointValue, lotSize),
    };
  }

  const target = metrics.target;
  const stop = metrics.stop;
  for (let i = entryIdx; i <= lastIdx; i += 1) {
    const bar = sorted[i];
    const targetHit = side === 'long' ? bar.high >= target : bar.low <= target;
    const stopHit = side === 'long' ? bar.low <= stop : bar.high >= stop;
    if (!targetHit && !stopHit) continue;

    let hitStop = stopHit && !targetHit;
    if (targetHit && stopHit) {
      const bearish = bar.close < bar.open;
      hitStop = side === 'long' ? bearish : !bearish;
    }
    const price = hitStop ? stop : target;
    const pnl = pnlForPrice(side, metrics.entry, price, qty, pointValue, lotSize);
    return {
      status: hitStop ? 'stop' : 'target',
      closed: true,
      pnl,
      balance: accountSize + pnl,
      openPnl: pnl,
      qty,
      lastPrice: price,
      hitTime: bar.time,
      ambiguousSameBar: targetHit && stopHit,
    };
  }

  const openPnl = pnlForPrice(side, metrics.entry, rangeLastPrice, qty, pointValue, lotSize);
  return {
    ...base,
    status: 'open',
    lastPrice: rangeLastPrice,
    openPnl,
    balance: accountSize + openPnl,
  };
}

export interface PositionTagSet {
  target: string;
  stop: string;
  centerLine1: string;
  centerLine2: string;
  centerTone: 'profit' | 'loss' | 'neutral';
  outcomeTone: 'profit' | 'loss' | 'neutral';
}

export function formatPositionPrice(value: number, tickSize: number): string {
  const decimals = decimalsForTick(tickSize);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPositionMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPositionSignedMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = formatPositionMoney(Math.abs(value));
  if (Math.abs(value) < 0.005) return '0';
  return value > 0 ? `+${abs}` : `-${abs}`;
}

export function formatPositionPercent(value: number): string {
  return `${value.toFixed(3)}%`;
}

export function formatPositionQty(value: number, precision: number): string {
  const decimals = Math.max(0, Math.min(8, Math.floor(precision)));
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPositionRatio(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return Number(value.toFixed(2)).toString();
}

export function buildPositionTags(
  metrics: PositionMetrics,
  outcome: PositionOutcome,
  options: { tickSize: number; qtyPrecision: number; compact?: boolean },
): PositionTagSet {
  const tickSize = positiveOr(options.tickSize, 0.01);
  const decimals = decimalsForTick(tickSize);
  const offset = (value: number) => value.toFixed(decimals);
  const targetPnl = formatPositionSignedMoney(metrics.targetPnl);
  const stopPnl = formatPositionSignedMoney(metrics.stopPnl);
  const compact = Boolean(options.compact);

  const target = compact
    ? `Target: ${offset(metrics.targetOffset)} (${formatPositionPercent(metrics.targetPct)})`
    : `Target: ${offset(metrics.targetOffset)} (${formatPositionPercent(metrics.targetPct)}) ${formatPositionMoney(
        metrics.targetTicks,
      )}, Amount: ${formatPositionMoney(metrics.targetBalance)}, P&L: ${targetPnl}`;
  const stop = compact
    ? `Stop: ${offset(metrics.stopOffset)} (${formatPositionPercent(metrics.stopPct)})`
    : `Stop: ${offset(metrics.stopOffset)} (${formatPositionPercent(metrics.stopPct)}) ${formatPositionMoney(
        metrics.stopTicks,
      )}, Amount: ${formatPositionMoney(metrics.stopBalance)}, P&L: ${stopPnl}`;

  const pnl = outcome.closed ? outcome.pnl : outcome.openPnl;
  const tone: PositionTagSet['centerTone'] = pnl > 0.004 ? 'profit' : pnl < -0.004 ? 'loss' : 'neutral';
  const label = outcome.closed ? 'Closed P&L' : 'Open P&L';
  const qty = formatPositionQty(metrics.qty, options.qtyPrecision);

  return {
    target,
    stop,
    centerLine1: `${label}: ${formatPositionSignedMoney(pnl)}${compact ? '' : `, Qty: ${qty}`}`,
    centerLine2: `Risk/Reward Ratio: ${formatPositionRatio(metrics.riskReward)}`,
    centerTone: tone,
    outcomeTone: tone,
  };
}

export interface PositionBoxPixels {
  leftX: number;
  rightX: number;
  entryY: number;
  targetY: number;
  stopY: number;
}

/** Keep pixel-space labels and handles inside the drawing pane. */
export function clampPositionPixels(
  box: PositionBoxPixels,
  plotWidth: number,
  paneHeight: number,
  padding = 10,
): PositionBoxPixels {
  const minX = Math.min(padding, Math.max(0, plotWidth - padding));
  const maxX = Math.max(minX, plotWidth - padding);
  const minY = Math.min(padding, Math.max(0, paneHeight - padding));
  const maxY = Math.max(minY, paneHeight - padding);
  return {
    leftX: Math.max(minX, Math.min(maxX, box.leftX)),
    rightX: Math.max(minX, Math.min(maxX, box.rightX)),
    entryY: Math.max(minY, Math.min(maxY, box.entryY)),
    targetY: Math.max(minY, Math.min(maxY, box.targetY)),
    stopY: Math.max(minY, Math.min(maxY, box.stopY)),
  };
}

export interface PositionTagLayout {
  x: number;
  y: number;
  /** Estimated tag width in px; used to choose a side / clamp inside the pane. */
  width: number;
  lines: string[];
  tone: 'target' | 'stop' | 'profit' | 'loss' | 'neutral';
}

const TAG_CHAR_RATIO = 0.545;

export function estimateTagWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * TAG_CHAR_RATIO + 16);
}

/**
 * Lay out the three TradingView-style stat tags without letting them spill out
 * of the pane or overlap the target/stop lines.
 */
export function layoutPositionTags(
  box: PositionBoxPixels,
  tags: PositionTagSet,
  plotWidth: number,
  paneHeight: number,
  fontSize: number,
): PositionTagLayout[] {
  const lineHeight = Math.max(11, fontSize + 2);
  const pad = 6;
  const right = Math.max(pad + 20, Math.min(box.rightX, plotWidth - pad));
  const targetLines = [tags.target];
  const stopLines = [tags.stop];
  const centerLines = [tags.centerLine1, tags.centerLine2];

  const targetWidth = estimateTagWidth(tags.target, fontSize);
  const stopWidth = estimateTagWidth(tags.stop, fontSize);
  const centerWidth = Math.max(
    estimateTagWidth(tags.centerLine1, fontSize),
    estimateTagWidth(tags.centerLine2, fontSize),
  );

  const xFor = (width: number) => Math.max(pad, right - width);
  const targetY = Math.min(
    paneHeight - pad - lineHeight,
    Math.max(pad + lineHeight, box.targetY - lineHeight - 3),
  );
  const stopY = Math.min(
    paneHeight - pad,
    Math.max(pad + lineHeight * 1.4, box.stopY + lineHeight + 2),
  );
  const centerHeight = lineHeight * centerLines.length;
  const centerY = Math.min(
    paneHeight - pad - centerHeight,
    Math.max(pad, box.entryY - centerHeight - 4),
  );

  return [
    {
      x: xFor(targetWidth),
      y: targetY,
      width: targetWidth,
      lines: targetLines,
      tone: 'target',
    },
    {
      x: xFor(stopWidth),
      y: stopY,
      width: stopWidth,
      lines: stopLines,
      tone: 'stop',
    },
    {
      x: xFor(centerWidth),
      y: centerY,
      width: centerWidth,
      lines: centerLines,
      tone: tags.centerTone,
    },
  ];
}

export function buildPositionDrawing(
  tool: 'long_position' | 'short_position',
  entryPoint: DrawingPoint,
  targetPoint: DrawingPoint,
  tickSize: number,
): Pick<DrawingObject, 'points' | 'targetPrice' | 'stopPrice' | 'tickSize'> {
  const side = positionSide(tool);
  const gap = Math.max(tickSize, Math.abs(entryPoint.price) * 1e-9);
  const target =
    side === 'long'
      ? Math.max(targetPoint.price, entryPoint.price + gap)
      : Math.min(targetPoint.price, entryPoint.price - gap);
  const distance = Math.abs(target - entryPoint.price) || gap;
  const stop = side === 'long' ? entryPoint.price - distance : entryPoint.price + distance;
  const rightTime = Math.max(targetPoint.time, entryPoint.time + MIN_RIGHT_GAP_SECONDS);
  const geometry = normalizePositionGeometry(
    side,
    {
      leftTime: entryPoint.time,
      rightTime,
      entry: entryPoint.price,
      target,
      stop,
    },
    tickSize,
  );
  return {
    points: geometryToPoints(geometry),
    targetPrice: geometry.target,
    stopPrice: geometry.stop,
    tickSize,
  };
}

/** Move every level of a position by a price/time delta. */
export function translatePositionGeometry(
  geom: PositionGeometry,
  deltaTime: number,
  deltaPrice: number,
): PositionGeometry {
  return {
    leftTime: geom.leftTime + deltaTime,
    rightTime: geom.rightTime + deltaTime,
    entry: geom.entry + deltaPrice,
    target: geom.target + deltaPrice,
    stop: geom.stop + deltaPrice,
  };
}
