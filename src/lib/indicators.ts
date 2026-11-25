import type { IndicatorConfig, IndicatorType, OHLCVBar } from '../../shared/types';
import { computeOperandSeries } from '../../shared/strategyEngine';

export interface TimeValuePoint {
  time: number;
  value: number;
}

export interface HistogramPoint {
  time: number;
  value: number;
  color: string;
}

export interface BollingerResult {
  upper: TimeValuePoint[];
  middle: TimeValuePoint[];
  lower: TimeValuePoint[];
}

export interface MacdResult {
  macd: TimeValuePoint[];
  signal: TimeValuePoint[];
  histogram: HistogramPoint[];
}

export interface IndicatorCatalogItem {
  id: IndicatorType;
  name: string;
  shortName: string;
  pane: 'main' | 'sub';
  category: 'Overlays' | 'Oscillators' | 'Volatility';
  defaultParams: Record<string, number>;
  defaultColor: string;
  secondaryColor?: string;
  tertiaryColor?: string;
  description: string;
}

export const INDICATOR_CATALOG: readonly IndicatorCatalogItem[] = [
  {
    id: 'sma',
    name: 'Simple Moving Average',
    shortName: 'SMA',
    pane: 'main',
    category: 'Overlays',
    defaultParams: { period: 20 },
    defaultColor: '#2962ff',
    description: 'Arithmetic mean of closing prices over N bars.',
  },
  {
    id: 'ema',
    name: 'Exponential Moving Average',
    shortName: 'EMA',
    pane: 'main',
    category: 'Overlays',
    defaultParams: { period: 20 },
    defaultColor: '#f59e0b',
    description: 'Exponentially weighted moving average favoring recent closes.',
  },
  {
    id: 'bb',
    name: 'Bollinger Bands',
    shortName: 'BB',
    pane: 'main',
    category: 'Overlays',
    defaultParams: { period: 20, stdDev: 2 },
    defaultColor: '#2962ff',
    secondaryColor: '#f59e0b',
    tertiaryColor: '#2962ff',
    description: 'SMA basis surrounded by upper/lower standard deviation bands.',
  },
  {
    id: 'vwap',
    name: 'Volume Weighted Average Price',
    shortName: 'VWAP',
    pane: 'main',
    category: 'Overlays',
    defaultParams: {},
    defaultColor: '#a855f7',
    description: 'Cumulative volume-weighted typical price across visible bars.',
  },
  {
    id: 'supertrend',
    name: 'Supertrend (ATR Trend)',
    shortName: 'Supertrend',
    pane: 'main',
    category: 'Overlays',
    defaultParams: { period: 10, multiplier: 3 },
    defaultColor: '#089981',
    description: 'Dynamic ATR trailing trend line flipping between bullish support and bearish resistance.',
  },
  {
    id: 'rsi',
    name: 'Relative Strength Index',
    shortName: 'RSI',
    pane: 'sub',
    category: 'Oscillators',
    defaultParams: { period: 14 },
    defaultColor: '#a855f7',
    description: 'Wilder momentum oscillator bounded between 0 and 100.',
  },
  {
    id: 'macd',
    name: 'MACD',
    shortName: 'MACD',
    pane: 'sub',
    category: 'Oscillators',
    defaultParams: { fast: 12, slow: 26, signal: 9 },
    defaultColor: '#2962ff',
    secondaryColor: '#f59e0b',
    tertiaryColor: '#089981',
    description: 'Moving Average Convergence Divergence with signal line & histogram.',
  },
  {
    id: 'stoch',
    name: 'Stochastic Oscillator (%K / %D)',
    shortName: 'Stoch',
    pane: 'sub',
    category: 'Oscillators',
    defaultParams: { period: 14 },
    defaultColor: '#2962ff',
    secondaryColor: '#f59e0b',
    description: 'Momentum oscillator comparing closing price to N-bar high-low range.',
  },
  {
    id: 'adx',
    name: 'Average Directional Index (ADX)',
    shortName: 'ADX',
    pane: 'sub',
    category: 'Oscillators',
    defaultParams: { period: 14 },
    defaultColor: '#089981',
    description: 'Wilder ADX measuring non-directional trend strength (>25 trending).',
  },
  {
    id: 'atr',
    name: 'Average True Range',
    shortName: 'ATR',
    pane: 'sub',
    category: 'Volatility',
    defaultParams: { period: 14 },
    defaultColor: '#f23645',
    description: 'Wilder smoothed true range measuring bar-to-bar volatility.',
  },
  {
    id: 'obv',
    name: 'On-Balance Volume (OBV)',
    shortName: 'OBV',
    pane: 'sub',
    category: 'Oscillators',
    defaultParams: {},
    defaultColor: '#38bdf8',
    description: 'Cumulative signed volume flow confirming breakouts and divergences.',
  },
];

export function calcSMA(bars: OHLCVBar[], rawPeriod: number): TimeValuePoint[] {
  const period = Math.max(1, Math.floor(rawPeriod));
  if (bars.length < period) return [];

  const result: TimeValuePoint[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i += 1) {
    sum += bars[i].close;
    if (i >= period) {
      sum -= bars[i - period].close;
    }
    if (i >= period - 1) {
      result.push({
        time: bars[i].time,
        value: sum / period,
      });
    }
  }
  return result;
}

export function calcEMAFromValues(
  items: Array<{ time: number; value: number }>,
  rawPeriod: number,
): TimeValuePoint[] {
  const period = Math.max(1, Math.floor(rawPeriod));
  if (items.length < period) return [];

  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i += 1) {
    seed += items[i].value;
  }
  let ema = seed / period;

  const result: TimeValuePoint[] = [{ time: items[period - 1].time, value: ema }];
  for (let i = period; i < items.length; i += 1) {
    ema = items[i].value * k + ema * (1 - k);
    result.push({
      time: items[i].time,
      value: ema,
    });
  }
  return result;
}

export function calcEMA(bars: OHLCVBar[], rawPeriod: number): TimeValuePoint[] {
  return calcEMAFromValues(
    bars.map((b) => ({ time: b.time, value: b.close })),
    rawPeriod,
  );
}

export function calcBollingerBands(
  bars: OHLCVBar[],
  rawPeriod = 20,
  rawStdDev = 2,
): BollingerResult {
  const period = Math.max(2, Math.floor(rawPeriod));
  const mult = Math.max(0.1, rawStdDev);
  if (bars.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

  const upper: TimeValuePoint[] = [];
  const middle: TimeValuePoint[] = [];
  const lower: TimeValuePoint[] = [];

  for (let i = period - 1; i < bars.length; i += 1) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      sum += bars[j].close;
    }
    const mean = sum / period;
    let sqDiff = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const d = bars[j].close - mean;
      sqDiff += d * d;
    }
    const sd = Math.sqrt(sqDiff / period);
    const time = bars[i].time;
    middle.push({ time, value: mean });
    upper.push({ time, value: mean + mult * sd });
    lower.push({ time, value: mean - mult * sd });
  }

  return { upper, middle, lower };
}

export function calcVWAP(bars: OHLCVBar[]): TimeValuePoint[] {
  if (bars.length === 0) return [];
  const result: TimeValuePoint[] = [];
  let cumPV = 0;
  let cumV = 0;

  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const vol = Math.max(1, bar.volume);
    cumPV += typical * vol;
    cumV += vol;
    result.push({
      time: bar.time,
      value: cumV > 0 ? cumPV / cumV : typical,
    });
  }
  return result;
}

export function calcRSI(bars: OHLCVBar[], rawPeriod = 14): TimeValuePoint[] {
  const period = Math.max(2, Math.floor(rawPeriod));
  if (bars.length <= period) return [];

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = bars[i].close - bars[i - 1].close;
    if (change >= 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const toRsi = (g: number, l: number): number => {
    if (l === 0 && g === 0) return 50;
    if (l === 0) return 100;
    if (g === 0) return 0;
    const rs = g / l;
    return Math.max(0, Math.min(100, 100 - 100 / (1 + rs)));
  };

  const result: TimeValuePoint[] = [
    {
      time: bars[period].time,
      value: toRsi(avgGain, avgLoss),
    },
  ];

  for (let i = period + 1; i < bars.length; i += 1) {
    const change = bars[i].close - bars[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push({
      time: bars[i].time,
      value: toRsi(avgGain, avgLoss),
    });
  }

  return result;
}

export function calcMACD(
  bars: OHLCVBar[],
  rawFast = 12,
  rawSlow = 26,
  rawSignal = 9,
): MacdResult {
  const fastPeriod = Math.max(2, Math.floor(rawFast));
  const slowPeriod = Math.max(fastPeriod + 1, Math.floor(rawSlow));
  const signalPeriod = Math.max(2, Math.floor(rawSignal));

  const fastEma = calcEMA(bars, fastPeriod);
  const slowEma = calcEMA(bars, slowPeriod);
  if (fastEma.length === 0 || slowEma.length === 0) {
    return { macd: [], signal: [], histogram: [] };
  }

  const fastByTime = new Map<number, number>();
  for (const pt of fastEma) fastByTime.set(pt.time, pt.value);

  const macdLine: TimeValuePoint[] = [];
  for (const pt of slowEma) {
    const fastVal = fastByTime.get(pt.time);
    if (fastVal !== undefined) {
      macdLine.push({
        time: pt.time,
        value: fastVal - pt.value,
      });
    }
  }

  const signalLine = calcEMAFromValues(macdLine, signalPeriod);
  const signalByTime = new Map<number, number>();
  for (const pt of signalLine) signalByTime.set(pt.time, pt.value);

  const histogram: HistogramPoint[] = [];
  for (const pt of macdLine) {
    const sigVal = signalByTime.get(pt.time);
    if (sigVal !== undefined) {
      const diff = pt.value - sigVal;
      histogram.push({
        time: pt.time,
        value: diff,
        color: diff >= 0 ? 'rgba(8, 153, 129, 0.7)' : 'rgba(242, 54, 69, 0.7)',
      });
    }
  }

  return {
    macd: macdLine,
    signal: signalLine,
    histogram,
  };
}

export function calcATR(bars: OHLCVBar[], rawPeriod = 14): TimeValuePoint[] {
  const period = Math.max(2, Math.floor(rawPeriod));
  if (bars.length <= period) return [];

  const trueRanges: number[] = new Array(bars.length).fill(0);
  trueRanges[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < bars.length; i += 1) {
    const prevClose = bars[i - 1].close;
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - prevClose);
    const lc = Math.abs(bars[i].low - prevClose);
    trueRanges[i] = Math.max(hl, hc, lc);
  }

  let atr = 0;
  for (let i = 1; i <= period; i += 1) {
    atr += trueRanges[i];
  }
  atr /= period;

  const result: TimeValuePoint[] = [{ time: bars[period].time, value: atr }];
  for (let i = period + 1; i < bars.length; i += 1) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push({
      time: bars[i].time,
      value: atr,
    });
  }

  return result;
}

export function calcSupertrend(
  bars: OHLCVBar[],
  period = 10,
  multiplier = 3,
): TimeValuePoint[] {
  const vals = computeOperandSeries(bars, {
    kind: 'indicator',
    indicator: 'supertrend',
    period,
    multiplier,
  });
  const out: TimeValuePoint[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (vals[i] !== null) out.push({ time: bars[i].time, value: vals[i] as number });
  }
  return out;
}

export function calcStochastic(
  bars: OHLCVBar[],
  period = 14,
): { k: TimeValuePoint[]; d: TimeValuePoint[] } {
  const kVals = computeOperandSeries(bars, { kind: 'indicator', indicator: 'stoch_k', period });
  const dVals = computeOperandSeries(bars, { kind: 'indicator', indicator: 'stoch_d', period });
  const k: TimeValuePoint[] = [];
  const d: TimeValuePoint[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (kVals[i] !== null) k.push({ time: bars[i].time, value: kVals[i] as number });
    if (dVals[i] !== null) d.push({ time: bars[i].time, value: dVals[i] as number });
  }
  return { k, d };
}

export function calcADX(bars: OHLCVBar[], period = 14): TimeValuePoint[] {
  const vals = computeOperandSeries(bars, { kind: 'indicator', indicator: 'adx', period });
  const out: TimeValuePoint[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (vals[i] !== null) out.push({ time: bars[i].time, value: vals[i] as number });
  }
  return out;
}

export function calcOBV(bars: OHLCVBar[]): TimeValuePoint[] {
  if (bars.length === 0) return [];
  const out: TimeValuePoint[] = [{ time: bars[0].time, value: 0 }];
  let obv = 0;
  for (let i = 1; i < bars.length; i += 1) {
    if (bars[i].close > bars[i - 1].close) obv += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume;
    out.push({ time: bars[i].time, value: obv });
  }
  return out;
}

export function formatIndicatorValuesForTime(
  ind: IndicatorConfig,
  bars: OHLCVBar[],
  targetTime?: number,
): string[] {
  if (bars.length === 0) return [];
  const pickVal = (pts: TimeValuePoint[]): string | null => {
    if (pts.length === 0) return null;
    let found = pts[pts.length - 1];
    if (targetTime !== undefined) {
      const exact = pts.find((p) => p.time === targetTime);
      if (exact) found = exact;
      else if (targetTime < pts[0].time) return null;
    }
    return Math.abs(found.value) < 10 ? found.value.toFixed(4) : found.value.toFixed(2);
  };

  switch (ind.id) {
    case 'sma': {
      const v = pickVal(calcSMA(bars, ind.params.period ?? 20));
      return v ? [v] : [];
    }
    case 'ema': {
      const v = pickVal(calcEMA(bars, ind.params.period ?? 20));
      return v ? [v] : [];
    }
    case 'vwap': {
      const v = pickVal(calcVWAP(bars));
      return v ? [v] : [];
    }
    case 'bb': {
      const bb = calcBollingerBands(
        bars,
        ind.params.period ?? 20,
        ind.params.stdDev ?? 2,
      );
      const u = pickVal(bb.upper);
      const m = pickVal(bb.middle);
      const l = pickVal(bb.lower);
      return [u, m, l].filter((x): x is string => x !== null);
    }
    case 'rsi': {
      const v = pickVal(calcRSI(bars, ind.params.period ?? 14));
      return v ? [v] : [];
    }
    case 'macd': {
      const m = calcMACD(
        bars,
        ind.params.fast ?? 12,
        ind.params.slow ?? 26,
        ind.params.signal ?? 9,
      );
      const mv = pickVal(m.macd);
      const sv = pickVal(m.signal);
      return [mv, sv].filter((x): x is string => x !== null);
    }
    case 'atr': {
      const v = pickVal(calcATR(bars, ind.params.period ?? 14));
      return v ? [v] : [];
    }
    case 'supertrend': {
      const v = pickVal(calcSupertrend(bars, ind.params.period ?? 10, ind.params.multiplier ?? 3));
      return v ? [v] : [];
    }
    case 'stoch': {
      const st = calcStochastic(bars, ind.params.period ?? 14);
      const kv = pickVal(st.k);
      const dv = pickVal(st.d);
      return [kv, dv].filter((x): x is string => x !== null);
    }
    case 'adx': {
      const v = pickVal(calcADX(bars, ind.params.period ?? 14));
      return v ? [v] : [];
    }
    case 'obv': {
      const v = pickVal(calcOBV(bars));
      return v ? [v] : [];
    }
    default:
      return [];
  }
}
