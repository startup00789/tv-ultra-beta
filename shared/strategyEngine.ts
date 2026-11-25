import type {
  BacktestPerformanceBlock,
  BacktestReport,
  BacktestTrade,
  BarDecisionTrace,
  ConditionEvalTrace,
  CostStressSummary,
  MonteCarloSummary,
  OHLCVBar,
  PatternType,
  QuantScorecard,
  RegimePerfBlock,
  RuleCondition,
  RuleGroup,
  RuleOperand,
  RuleOperator,
  StrategyRuleSpec,
  StrategySweepItem,
  StrategySweepResponse,
  WalkForwardSummary,
} from './types.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function operandCacheKey(operand: RuleOperand): string {
  if (operand.kind === 'price') return `price:${operand.field}`;
  if (operand.kind === 'number') return `num:${operand.value}`;
  if (operand.kind === 'pattern') return `pat:${operand.pattern}:${operand.lookback ?? 20}`;
  return `ind:${operand.indicator}:${operand.period ?? ''}:${operand.fast ?? ''}:${operand.slow ?? ''}:${operand.signal ?? ''}:${operand.stdDev ?? ''}:${operand.multiplier ?? ''}`;
}

function computeSmaValues(values: Array<number | null>, period: number): Array<number | null> {
  const p = Math.max(1, Math.floor(period));
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  let validRun = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) {
      sum = 0;
      validRun = 0;
      continue;
    }
    sum += v;
    validRun += 1;
    if (validRun > p) {
      const old = values[i - p];
      if (old !== null && Number.isFinite(old)) sum -= old;
    }
    if (validRun >= p) {
      out[i] = sum / p;
    }
  }
  return out;
}

function computeEmaValues(values: Array<number | null>, period: number): Array<number | null> {
  const p = Math.max(1, Math.floor(period));
  const out: Array<number | null> = new Array(values.length).fill(null);
  const k = 2 / (p + 1);
  let seedSum = 0;
  let seedCount = 0;
  let ema: number | null = null;

  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) continue;
    if (ema === null) {
      seedSum += v;
      seedCount += 1;
      if (seedCount === p) {
        ema = seedSum / p;
        out[i] = ema;
      }
    } else {
      ema = v * k + ema * (1 - k);
      out[i] = ema;
    }
  }
  return out;
}

function computeRsiSeries(bars: OHLCVBar[], period: number): Array<number | null> {
  const p = Math.max(2, Math.floor(period));
  const out: Array<number | null> = new Array(bars.length).fill(null);
  if (bars.length <= p) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= p; i += 1) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }
  let avgGain = gainSum / p;
  let avgLoss = lossSum / p;

  const toRsi = (g: number, l: number): number => {
    if (l === 0 && g === 0) return 50;
    if (l === 0) return 100;
    if (g === 0) return 0;
    return Math.max(0, Math.min(100, 100 - 100 / (1 + g / l)));
  };

  out[p] = toRsi(avgGain, avgLoss);
  for (let i = p + 1; i < bars.length; i += 1) {
    const diff = bars[i].close - bars[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (p - 1) + gain) / p;
    avgLoss = (avgLoss * (p - 1) + loss) / p;
    out[i] = toRsi(avgGain, avgLoss);
  }
  return out;
}

function computeMacdComponent(
  bars: OHLCVBar[],
  component: 'macd_line' | 'macd_signal' | 'macd_hist',
  fast = 12,
  slow = 26,
  signal = 9,
): Array<number | null> {
  const closes = bars.map((b) => b.close);
  const fastPeriod = Math.max(2, Math.floor(fast));
  const slowPeriod = Math.max(fastPeriod + 1, Math.floor(slow));
  const signalPeriod = Math.max(2, Math.floor(signal));

  const fastEma = computeEmaValues(closes, fastPeriod);
  const slowEma = computeEmaValues(closes, slowPeriod);
  const macdLine = bars.map((_, i) =>
    fastEma[i] !== null && slowEma[i] !== null ? (fastEma[i] as number) - (slowEma[i] as number) : null,
  );
  if (component === 'macd_line') return macdLine;
  const sigLine = computeEmaValues(macdLine, signalPeriod);
  if (component === 'macd_signal') return sigLine;
  return bars.map((_, i) =>
    macdLine[i] !== null && sigLine[i] !== null ? (macdLine[i] as number) - (sigLine[i] as number) : null,
  );
}

function computeBollingerComponent(
  bars: OHLCVBar[],
  component: 'bb_upper' | 'bb_middle' | 'bb_lower',
  period = 20,
  stdDev = 2,
): Array<number | null> {
  const p = Math.max(2, Math.floor(period));
  const mult = Math.max(0.1, stdDev);
  const out: Array<number | null> = new Array(bars.length).fill(null);
  if (bars.length < p) return out;

  for (let i = p - 1; i < bars.length; i += 1) {
    let sum = 0;
    for (let j = i - p + 1; j <= i; j += 1) sum += bars[j].close;
    const mean = sum / p;
    if (component === 'bb_middle') {
      out[i] = mean;
      continue;
    }
    let sq = 0;
    for (let j = i - p + 1; j <= i; j += 1) {
      const d = bars[j].close - mean;
      sq += d * d;
    }
    const sd = Math.sqrt(sq / p);
    out[i] = component === 'bb_upper' ? mean + mult * sd : mean - mult * sd;
  }
  return out;
}

function computeAtrSeries(bars: OHLCVBar[], period = 14): Array<number | null> {
  const p = Math.max(2, Math.floor(period));
  const out: Array<number | null> = new Array(bars.length).fill(null);
  if (bars.length <= p) return out;

  const tr: number[] = new Array(bars.length).fill(0);
  tr[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < bars.length; i += 1) {
    const prevClose = bars[i - 1].close;
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose),
    );
  }
  let atr = 0;
  for (let i = 1; i <= p; i += 1) atr += tr[i];
  atr /= p;
  out[p] = atr;
  for (let i = p + 1; i < bars.length; i += 1) {
    atr = (atr * (p - 1) + tr[i]) / p;
    out[i] = atr;
  }
  return out;
}

function computeVwapSeries(bars: OHLCVBar[]): Array<number | null> {
  const out: Array<number | null> = new Array(bars.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const typical = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const vol = Math.max(1, bars[i].volume);
    cumPV += typical * vol;
    cumV += vol;
    out[i] = cumV > 0 ? cumPV / cumV : typical;
  }
  return out;
}

function computeRollingExtreme(
  bars: OHLCVBar[],
  kind: 'highest_high' | 'lowest_low',
  period = 20,
): Array<number | null> {
  const p = Math.max(2, Math.floor(period));
  const out: Array<number | null> = new Array(bars.length).fill(null);
  // Look back across the prior p closed bars [i - p, i - 1] to prevent same-bar self-breakout impossibility
  for (let i = p; i < bars.length; i += 1) {
    let ext = kind === 'highest_high' ? -Infinity : Infinity;
    for (let j = i - p; j < i; j += 1) {
      ext = kind === 'highest_high' ? Math.max(ext, bars[j].high) : Math.min(ext, bars[j].low);
    }
    out[i] = ext;
  }
  return out;
}

function computeAdxComponents(
  bars: OHLCVBar[],
  period = 14,
): {
  adx: Array<number | null>;
  diPlus: Array<number | null>;
  diMinus: Array<number | null>;
} {
  const p = Math.max(2, Math.floor(period));
  const len = bars.length;
  const adx: Array<number | null> = new Array(len).fill(null);
  const diPlus: Array<number | null> = new Array(len).fill(null);
  const diMinus: Array<number | null> = new Array(len).fill(null);
  if (len <= p * 2) return { adx, diPlus, diMinus };

  const tr = new Array<number>(len).fill(0);
  const plusDm = new Array<number>(len).fill(0);
  const minusDm = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i += 1) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
  }

  let smTr = 0;
  let smPlus = 0;
  let smMinus = 0;
  for (let i = 1; i <= p; i += 1) {
    smTr += tr[i];
    smPlus += plusDm[i];
    smMinus += minusDm[i];
  }
  const dx = new Array<number | null>(len).fill(null);
  for (let i = p; i < len; i += 1) {
    if (i > p) {
      smTr = smTr - smTr / p + tr[i];
      smPlus = smPlus - smPlus / p + plusDm[i];
      smMinus = smMinus - smMinus / p + minusDm[i];
    }
    const pdi = smTr > 0 ? (100 * smPlus) / smTr : 0;
    const mdi = smTr > 0 ? (100 * smMinus) / smTr : 0;
    diPlus[i] = pdi;
    diMinus[i] = mdi;
    const sum = pdi + mdi;
    dx[i] = sum > 0 ? (100 * Math.abs(pdi - mdi)) / sum : 0;
  }

  let seed = 0;
  let count = 0;
  for (let i = p; i < len; i += 1) {
    const d = dx[i];
    if (d === null) continue;
    seed += d;
    count += 1;
    if (count === p) {
      let curAdx = seed / p;
      adx[i] = curAdx;
      for (let j = i + 1; j < len; j += 1) {
        const dj = dx[j] ?? curAdx;
        curAdx = (curAdx * (p - 1) + dj) / p;
        adx[j] = curAdx;
      }
      break;
    }
  }
  return { adx, diPlus, diMinus };
}

function computeSupertrendSeries(
  bars: OHLCVBar[],
  period = 10,
  multiplier = 3,
): { line: Array<number | null>; dir: Array<number | null> } {
  const atr = computeAtrSeries(bars, period);
  const mult = Math.max(0.5, multiplier);
  const line: Array<number | null> = new Array(bars.length).fill(null);
  const dir: Array<number | null> = new Array(bars.length).fill(null);
  let upperBand = 0;
  let lowerBand = 0;
  let curDir = 1;

  for (let i = 0; i < bars.length; i += 1) {
    const a = atr[i];
    if (a === null) continue;
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const basicUpper = hl2 + mult * a;
    const basicLower = hl2 - mult * a;

    if (line[i - 1] === null) {
      upperBand = basicUpper;
      lowerBand = basicLower;
      curDir = bars[i].close >= hl2 ? 1 : -1;
    } else {
      upperBand =
        basicUpper < upperBand || bars[i - 1].close > upperBand ? basicUpper : upperBand;
      lowerBand =
        basicLower > lowerBand || bars[i - 1].close < lowerBand ? basicLower : lowerBand;
      if (curDir === 1 && bars[i].close < lowerBand) curDir = -1;
      else if (curDir === -1 && bars[i].close > upperBand) curDir = 1;
    }
    dir[i] = curDir;
    line[i] = curDir === 1 ? lowerBand : upperBand;
  }
  return { line, dir };
}

function computeStochasticSeries(
  bars: OHLCVBar[],
  period = 14,
  smooth = 3,
): { k: Array<number | null>; d: Array<number | null> } {
  const p = Math.max(2, Math.floor(period));
  const rawK: Array<number | null> = new Array(bars.length).fill(null);
  for (let i = p - 1; i < bars.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - p + 1; j <= i; j += 1) {
      hi = Math.max(hi, bars[j].high);
      lo = Math.min(lo, bars[j].low);
    }
    rawK[i] = hi > lo ? ((bars[i].close - lo) / (hi - lo)) * 100 : 50;
  }
  const k = computeSmaValues(rawK, Math.max(1, smooth));
  const d = computeSmaValues(k, Math.max(1, smooth));
  return { k, d };
}

function computeVolumeRatio(
  bars: OHLCVBar[],
  mode: 'volume_sma' | 'volume_ratio',
  period = 20,
): Array<number | null> {
  const sma = computeSmaValues(
    bars.map((b) => b.volume),
    period,
  );
  if (mode === 'volume_sma') return sma;
  return bars.map((b, i) =>
    sma[i] !== null && (sma[i] as number) > 0 ? b.volume / (sma[i] as number) : null,
  );
}

function computePatternSeries(
  bars: OHLCVBar[],
  pattern: PatternType,
  lookback = 20,
): Array<number | null> {
  const out: Array<number | null> = new Array(bars.length).fill(0);
  const lb = Math.max(3, Math.floor(lookback));
  for (let i = 1; i < bars.length; i += 1) {
    const c = bars[i];
    const p = bars[i - 1];
    const body = Math.abs(c.close - c.open);
    const range = Math.max(1e-9, c.high - c.low);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    let hit = false;
    switch (pattern) {
      case 'bullish_engulfing':
        hit = p.close < p.open && c.close > c.open && c.close >= p.open && c.open <= p.close;
        break;
      case 'bearish_engulfing':
        hit = p.close > p.open && c.close < c.open && c.open >= p.close && c.close <= p.open;
        break;
      case 'hammer':
        hit = body > 0 && lowerWick >= body * 2 && upperWick <= body * 0.6;
        break;
      case 'shooting_star':
        hit = body > 0 && upperWick >= body * 2 && lowerWick <= body * 0.6;
        break;
      case 'doji':
        hit = body <= range * 0.12;
        break;
      case 'inside_bar':
        hit = c.high <= p.high && c.low >= p.low;
        break;
      case 'breakout_high':
        if (i >= lb) {
          let maxH = -Infinity;
          for (let j = i - lb; j < i; j += 1) maxH = Math.max(maxH, bars[j].high);
          hit = c.close > maxH;
        }
        break;
      case 'breakdown_low':
        if (i >= lb) {
          let minL = Infinity;
          for (let j = i - lb; j < i; j += 1) minL = Math.min(minL, bars[j].low);
          hit = c.close < minL;
        }
        break;
    }
    out[i] = hit ? 1 : 0;
  }
  return out;
}

/** Precomputes a bar-aligned series for any RuleOperand without lookahead bias. */
export function computeOperandSeries(
  bars: OHLCVBar[],
  operand: RuleOperand,
): Array<number | null> {
  if (operand.kind === 'number') {
    return new Array(bars.length).fill(operand.value);
  }
  if (operand.kind === 'price') {
    return bars.map((b) => b[operand.field]);
  }
  if (operand.kind === 'pattern') {
    return computePatternSeries(bars, operand.pattern, operand.lookback ?? 20);
  }
  switch (operand.indicator) {
    case 'sma':
      return computeSmaValues(
        bars.map((b) => b.close),
        operand.period ?? 20,
      );
    case 'ema':
      return computeEmaValues(
        bars.map((b) => b.close),
        operand.period ?? 20,
      );
    case 'rsi':
      return computeRsiSeries(bars, operand.period ?? 14);
    case 'macd_line':
    case 'macd_signal':
    case 'macd_hist':
      return computeMacdComponent(
        bars,
        operand.indicator,
        operand.fast ?? 12,
        operand.slow ?? 26,
        operand.signal ?? 9,
      );
    case 'bb_upper':
    case 'bb_middle':
    case 'bb_lower':
      return computeBollingerComponent(
        bars,
        operand.indicator,
        operand.period ?? 20,
        operand.stdDev ?? 2,
      );
    case 'vwap':
      return computeVwapSeries(bars);
    case 'atr':
      return computeAtrSeries(bars, operand.period ?? 14);
    case 'highest_high':
    case 'lowest_low':
      return computeRollingExtreme(bars, operand.indicator, operand.period ?? 20);
    case 'adx':
      return computeAdxComponents(bars, operand.period ?? 14).adx;
    case 'di_plus':
      return computeAdxComponents(bars, operand.period ?? 14).diPlus;
    case 'di_minus':
      return computeAdxComponents(bars, operand.period ?? 14).diMinus;
    case 'supertrend':
      return computeSupertrendSeries(bars, operand.period ?? 10, operand.multiplier ?? 3).line;
    case 'supertrend_dir':
      return computeSupertrendSeries(bars, operand.period ?? 10, operand.multiplier ?? 3).dir;
    case 'stoch_k':
      return computeStochasticSeries(bars, operand.period ?? 14).k;
    case 'stoch_d':
      return computeStochasticSeries(bars, operand.period ?? 14).d;
    case 'volume_sma':
    case 'volume_ratio':
      return computeVolumeRatio(bars, operand.indicator, operand.period ?? 20);
    case 'prev_high':
      return bars.map((_, i) => (i > 0 ? bars[i - 1].high : null));
    case 'prev_low':
      return bars.map((_, i) => (i > 0 ? bars[i - 1].low : null));
    case 'prev_close':
      return bars.map((_, i) => (i > 0 ? bars[i - 1].close : null));
  }
}

function getCachedSeries(
  bars: OHLCVBar[],
  operand: RuleOperand,
  cache: Map<string, Array<number | null>>,
): Array<number | null> {
  const key = operandCacheKey(operand);
  const hit = cache.get(key);
  if (hit) return hit;
  const computed = computeOperandSeries(bars, operand);
  cache.set(key, computed);
  return computed;
}

function compareValues(
  operator: RuleOperator,
  left: number | null,
  right: number | null,
  prevLeft: number | null,
  prevRight: number | null,
): boolean {
  if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right)) {
    return false;
  }
  switch (operator) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
      return Math.abs(left - right) <= 1e-6;
    case 'crosses_above':
      return (
        prevLeft !== null &&
        prevRight !== null &&
        Number.isFinite(prevLeft) &&
        Number.isFinite(prevRight) &&
        prevLeft <= prevRight &&
        left > right
      );
    case 'crosses_below':
      return (
        prevLeft !== null &&
        prevRight !== null &&
        Number.isFinite(prevLeft) &&
        Number.isFinite(prevRight) &&
        prevLeft >= prevRight &&
        left < right
      );
  }
}

function evalCondition(
  bars: OHLCVBar[],
  cond: RuleCondition,
  barIndex: number,
  cache: Map<string, Array<number | null>>,
): ConditionEvalTrace {
  const leftSeries = getCachedSeries(bars, cond.left, cache);
  const rightSeries = getCachedSeries(bars, cond.right, cache);
  const curLeft = leftSeries[barIndex] ?? null;
  const curRight = rightSeries[barIndex] ?? null;
  const prevLeft = barIndex > 0 ? (leftSeries[barIndex - 1] ?? null) : null;
  const prevRight = barIndex > 0 ? (rightSeries[barIndex - 1] ?? null) : null;
  const passed = compareValues(cond.operator, curLeft, curRight, prevLeft, prevRight);
  return {
    conditionId: cond.id,
    label: cond.label,
    leftValue: curLeft !== null ? round4(curLeft) : null,
    operator: cond.operator,
    rightValue: curRight !== null ? round4(curRight) : null,
    passed,
  };
}

/** Evaluates a RuleGroup on a single bar index with per-condition numeric audit trace. */
export function evaluateRuleGroupAtBar(
  bars: OHLCVBar[],
  group: RuleGroup | undefined,
  barIndex: number,
  cache: Map<string, Array<number | null>>,
): { passed: boolean; checks: ConditionEvalTrace[] } {
  if (!group || group.conditions.length === 0 || barIndex < 0 || barIndex >= bars.length) {
    return { passed: false, checks: [] };
  }
  const checks = group.conditions.map((c) => evalCondition(bars, c, barIndex, cache));
  const passed =
    group.combinator === 'OR'
      ? checks.some((c) => c.passed)
      : checks.every((c) => c.passed);
  return { passed, checks };
}

/** Produces a complete boolean decision snapshot for every rule in a strategy at a specific bar. */
export function evaluateBarDecision(
  bars: OHLCVBar[],
  spec: StrategyRuleSpec,
  barIndex: number,
  cache: Map<string, Array<number | null>> = new Map(),
): BarDecisionTrace {
  const bar = bars[barIndex] ?? {
    time: 0,
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
  };
  const allowLong = spec.direction === 'long' || spec.direction === 'both';
  const allowShort =
    spec.execution.allowShort &&
    (spec.direction === 'short' || spec.direction === 'both');

  const elMain = allowLong
    ? evaluateRuleGroupAtBar(bars, spec.entryLong, barIndex, cache)
    : { passed: false, checks: [] };
  const elAlt =
    allowLong && spec.entryLongAlt && spec.entryLongAlt.conditions.length > 0
      ? evaluateRuleGroupAtBar(bars, spec.entryLongAlt, barIndex, cache)
      : { passed: false, checks: [] };
  let elPassed = elMain.passed || elAlt.passed;
  const elChecks = [...elMain.checks, ...elAlt.checks];

  const xl = allowLong
    ? evaluateRuleGroupAtBar(bars, spec.exitLong, barIndex, cache)
    : { passed: false, checks: [] };
  const es = allowShort
    ? evaluateRuleGroupAtBar(bars, spec.entryShort, barIndex, cache)
    : { passed: false, checks: [] };
  let esPassed = es.passed;
  const xs = allowShort
    ? evaluateRuleGroupAtBar(bars, spec.exitShort, barIndex, cache)
    : { passed: false, checks: [] };

  // Session UTC hour filter check when configured
  if (spec.risk.allowedHoursUtc && bar.time > 0) {
    const [startH, endH] = spec.risk.allowedHoursUtc;
    const hr = new Date(bar.time * 1000).getUTCHours();
    const inSession = startH <= endH ? hr >= startH && hr <= endH : hr >= startH || hr <= endH;
    const sessionCheck: ConditionEvalTrace = {
      conditionId: 'session-utc-filter',
      label: `Session UTC [${startH}..${endH}]`,
      leftValue: hr,
      operator: '>=',
      rightValue: startH,
      passed: inSession,
    };
    if (allowLong) {
      elChecks.push(sessionCheck);
      elPassed = elPassed && inSession;
    }
    if (allowShort) {
      es.checks.push(sessionCheck);
      esPassed = esPassed && inSession;
    }
  }

  const el = { passed: elPassed, checks: elChecks };

  let actionTaken = 'HOLD';
  let reason = 'No entry or exit trigger fired on this bar.';
  if (el.passed) {
    actionTaken = 'ENTRY_LONG_SIGNAL';
    reason = `All long entry rules passed (${el.checks.filter((c) => c.passed).length}/${el.checks.length}).`;
  } else if (xl.passed) {
    actionTaken = 'EXIT_LONG_SIGNAL';
    reason = `Long exit condition passed.`;
  } else if (esPassed) {
    actionTaken = 'ENTRY_SHORT_SIGNAL';
    reason = `All short entry rules passed (${es.checks.filter((c) => c.passed).length}/${es.checks.length}).`;
  } else if (xs.passed) {
    actionTaken = 'EXIT_SHORT_SIGNAL';
    reason = `Short exit condition passed.`;
  } else if (el.checks.length > 0) {
    const failed = el.checks.filter((c) => !c.passed).map((c) => c.label);
    reason = failed.length > 0 ? `Blocked by failed long entry rule(s): ${failed.join('; ')}` : reason;
  }

  return {
    barIndex,
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    entryLongPassed: el.passed,
    exitLongPassed: xl.passed,
    entryShortPassed: esPassed,
    exitShortPassed: xs.passed,
    entryLongChecks: el.checks,
    exitLongChecks: xl.checks,
    entryShortChecks: es.checks,
    exitShortChecks: xs.checks,
    actionTaken,
    reason,
  };
}

function summarizePerformanceBlock(
  trades: BacktestTrade[],
  initialCapital: number,
): BacktestPerformanceBlock {
  let netProfit = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let commissionPaid = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let evenTrades = 0;
  let largestWinTrade = 0;
  let largestLossTrade = 0;
  let totalBars = 0;
  let curWinStreak = 0;
  let curLossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let outliersCount = 0;
  let mfeSum = 0;
  let maeSum = 0;

  for (const t of trades) {
    netProfit += t.netProfit;
    commissionPaid += t.commission;
    totalBars += t.barsHeld;
    mfeSum += t.maxFavorableExcursionPct;
    maeSum += t.maxAdverseExcursionPct;
    if (t.isOutlier) outliersCount += 1;

    if (t.netProfit > 1e-8) {
      winningTrades += 1;
      grossProfit += t.netProfit;
      largestWinTrade = Math.max(largestWinTrade, t.netProfit);
      curWinStreak += 1;
      curLossStreak = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, curWinStreak);
    } else if (t.netProfit < -1e-8) {
      losingTrades += 1;
      grossLoss += Math.abs(t.netProfit);
      largestLossTrade = Math.min(largestLossTrade, t.netProfit);
      curLossStreak += 1;
      curWinStreak = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, curLossStreak);
    } else {
      evenTrades += 1;
      curWinStreak = 0;
      curLossStreak = 0;
    }
  }

  const totalTrades = trades.length;
  const avgTrade = totalTrades > 0 ? netProfit / totalTrades : 0;
  const avgWinTrade = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLossTrade = losingTrades > 0 ? grossLoss / losingTrades : 0;
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.99 : 0;
  const ratioAvgWinAvgLoss =
    avgLossTrade > 0 ? avgWinTrade / avgLossTrade : avgWinTrade > 0 ? 99.99 : 0;

  return {
    netProfit: round2(netProfit),
    netProfitPercent: initialCapital > 0 ? round2((netProfit / initialCapital) * 100) : 0,
    grossProfit: round2(grossProfit),
    grossLoss: round2(grossLoss),
    commissionPaid: round2(commissionPaid),
    totalTrades,
    winningTrades,
    losingTrades,
    evenTrades,
    percentProfitable: totalTrades > 0 ? round2((winningTrades / totalTrades) * 100) : 0,
    profitFactor: round2(profitFactor),
    avgTrade: round2(avgTrade),
    avgWinTrade: round2(avgWinTrade),
    avgLossTrade: round2(-avgLossTrade),
    ratioAvgWinAvgLoss: round2(ratioAvgWinAvgLoss),
    largestWinTrade: round2(largestWinTrade),
    largestLossTrade: round2(largestLossTrade),
    avgBarsInTrade: totalTrades > 0 ? round2(totalBars / totalTrades) : 0,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    outliersCount,
    avgMfePct: totalTrades > 0 ? round2(mfeSum / totalTrades) : 0,
    avgMaePct: totalTrades > 0 ? round2(maeSum / totalTrades) : 0,
  };
}

function emptyReport(spec: StrategyRuleSpec): BacktestReport {
  const zeroBlock = summarizePerformanceBlock([], spec.execution.initialCapital);
  return {
    strategyId: spec.id,
    strategyName: spec.name,
    symbol: spec.symbol,
    timeframe: spec.timeframe,
    barCount: 0,
    startTime: 0,
    endTime: 0,
    initialCapital: spec.execution.initialCapital,
    finalEquity: spec.execution.initialCapital,
    buyHoldReturn: 0,
    buyHoldReturnPercent: 0,
    strategyOutperformancePercent: 0,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    maxRunup: 0,
    maxRunupPercent: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    cagrPercent: 0,
    strategyBuyHoldCorrelation: 0,
    returnOnMaxDrawdown: 0,
    bestEntryHourUtc: null,
    bestEntryDayUtc: null,
    all: zeroBlock,
    long: zeroBlock,
    short: zeroBlock,
    equityCurve: [],
    trades: [],
    recentTraces: [],
    spec,
  };
}

/**
 * Deterministic, zero-lookahead historical backtesting engine modeled after
 * TradingView's Strategy Tester architecture and derived metrics.
 */
export function runStrategyBacktest(
  bars: OHLCVBar[],
  spec: StrategyRuleSpec,
  options?: { includeStress?: boolean },
): BacktestReport {
  if (bars.length < 3) {
    return emptyReport(spec);
  }

  const includeStress = options?.includeStress !== false;
  const cache = new Map<string, Array<number | null>>();
  const initialCapital = Math.max(100, spec.execution.initialCapital || 100_000);
  const commissionRate = Math.max(0, spec.execution.commissionPct) / 100;
  const slippageRate = Math.max(0, spec.execution.slippageBps) / 10_000;
  const slPct = Math.max(0, spec.risk.stopLossPct) / 100;
  const tpPct = Math.max(0, spec.risk.takeProfitPct) / 100;
  const slAtrMult = spec.risk.stopLossAtrMult && spec.risk.stopLossAtrMult > 0 ? spec.risk.stopLossAtrMult : 0;
  const tpAtrMult = spec.risk.takeProfitAtrMult && spec.risk.takeProfitAtrMult > 0 ? spec.risk.takeProfitAtrMult : 0;
  const breakevenR = spec.risk.breakevenTriggerR && spec.risk.breakevenTriggerR > 0 ? spec.risk.breakevenTriggerR : 0;
  const cooldownBars = Math.max(0, Math.floor(spec.risk.cooldownBarsAfterLoss ?? 0));
  const atrSeries =
    slAtrMult > 0 || tpAtrMult > 0 || includeStress ? computeAtrSeries(bars, 14) : [];
  const trailPct =
    spec.risk.trailingStopPct && spec.risk.trailingStopPct > 0
      ? spec.risk.trailingStopPct / 100
      : 0;

  let cash = initialCapital;
  let equityPeak = initialCapital;
  let equityTrough = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let maxRunup = 0;
  let maxRunupPct = 0;
  let cumulativeProfit = 0;
  let lastLossExitBar = -999999;

  interface OpenPos {
    side: 'long' | 'short';
    entryBarIndex: number;
    entryTime: number;
    entryPrice: number;
    quantity: number;
    entryCommission: number;
    peakFavorablePrice: number;
    maxFavorablePct: number;
    maxAdversePct: number;
    entryTrace: ConditionEvalTrace[];
    stopPrice: number;
    targetPrice: number;
    initialRiskPerUnit: number;
    breakevenArmed: boolean;
  }

  let openPos: OpenPos | null = null;
  let pendingAction: {
    action: 'open_long' | 'open_short' | 'close';
    trace: ConditionEvalTrace[];
  } | null = null;

  const trades: BacktestTrade[] = [];
  const traces: BarDecisionTrace[] = [];
  const equityCurve: BacktestReport['equityCurve'] = [];
  const barReturns: number[] = [];
  const buyHoldDeltasAtTrades: number[] = [];

  const firstClose = bars[0].close || 1;
  const buyHoldQty = initialCapital / firstClose;

  const computeQty = (fillPrice: number): number => {
    const curEq = Math.max(100, prevEquity);
    const lev = Math.max(1, Math.min(20, spec.execution.leverage ?? 1));
    const maxAllowedCash =
      curEq * lev * (Math.min(100, Math.max(1, spec.risk.maxPositionPct)) / 100);
    let targetCash = maxAllowedCash;
    if (spec.execution.orderSizeType === 'percent_of_equity') {
      targetCash =
        curEq * lev * (Math.min(100, Math.max(1, spec.execution.orderSizeValue)) / 100);
    } else if (spec.execution.orderSizeType === 'fixed_cash') {
      targetCash = spec.execution.orderSizeValue * lev;
    } else if (spec.execution.orderSizeType === 'fixed_qty') {
      targetCash = spec.execution.orderSizeValue * fillPrice;
    }
    // Risk-based cap using stop-loss distance when configured
    if (slPct > 0 && spec.risk.riskPerTradePct > 0) {
      const riskBudget = curEq * (spec.risk.riskPerTradePct / 100);
      const riskCapNotional = (riskBudget / slPct) * (lev > 1 ? Math.min(lev, 3) : 1);
      targetCash = Math.min(targetCash, riskCapNotional);
    }
    const buyingPower = Math.max(0, curEq * 0.995 * lev);
    const clampedCash = Math.max(0, Math.min(targetCash, maxAllowedCash, buyingPower));
    return fillPrice > 0 ? clampedCash / fillPrice : 0;
  };

  const closePosition = (
    pos: OpenPos,
    exitBarIndex: number,
    exitTime: number,
    rawExitPrice: number,
    exitReason: BacktestTrade['exitReason'],
    exitTrace: ConditionEvalTrace[],
  ) => {
    const slippedExit =
      pos.side === 'long'
        ? rawExitPrice * (1 - slippageRate)
        : rawExitPrice * (1 + slippageRate);
    const exitCommission = Math.abs(slippedExit * pos.quantity) * commissionRate;
    const grossProfit =
      pos.side === 'long'
        ? (slippedExit - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - slippedExit) * pos.quantity;
    const totalCommission = pos.entryCommission + exitCommission;
    const netProfit = grossProfit - totalCommission;
    if (netProfit < 0) {
      lastLossExitBar = exitBarIndex;
    }
    const notional = Math.max(1e-6, pos.entryPrice * pos.quantity);
    const netProfitPercent = (netProfit / notional) * 100;
    cumulativeProfit += netProfit;

    cash +=
      pos.side === 'long'
        ? slippedExit * pos.quantity - exitCommission
        : pos.entryPrice * pos.quantity + grossProfit - exitCommission;

    const bhAtEntry = buyHoldQty * (bars[pos.entryBarIndex]?.close ?? pos.entryPrice);
    const bhAtExit = buyHoldQty * (bars[exitBarIndex]?.close ?? rawExitPrice);
    buyHoldDeltasAtTrades.push(bhAtExit - bhAtEntry);

    trades.push({
      tradeNumber: trades.length + 1,
      side: pos.side,
      entryBarIndex: pos.entryBarIndex,
      entryTime: pos.entryTime,
      entryPrice: round4(pos.entryPrice),
      exitBarIndex,
      exitTime,
      exitPrice: round4(slippedExit),
      quantity: round4(pos.quantity),
      grossProfit: round2(grossProfit),
      commission: round2(totalCommission),
      netProfit: round2(netProfit),
      netProfitPercent: round2(netProfitPercent),
      cumulativeProfit: round2(cumulativeProfit),
      cumulativeProfitPercent: round2((cumulativeProfit / initialCapital) * 100),
      maxFavorableExcursionPct: round2(pos.maxFavorablePct),
      maxAdverseExcursionPct: round2(pos.maxAdversePct),
      barsHeld: Math.max(1, exitBarIndex - pos.entryBarIndex),
      exitReason,
      isOutlier: false,
      entryTrace: pos.entryTrace,
      exitTrace,
    });
  };

  let prevEquity = initialCapital;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];

    // 1. Execute any next-bar open orders scheduled by the previous closed bar (zero lookahead)
    if (pendingAction) {
      if (pendingAction.action === 'close' && openPos) {
        closePosition(openPos, i, bar.time, bar.open, 'signal', pendingAction.trace);
        openPos = null;
      } else if (
        (pendingAction.action === 'open_long' || pendingAction.action === 'open_short') &&
        !openPos
      ) {
        const side: 'long' | 'short' =
          pendingAction.action === 'open_long' ? 'long' : 'short';
        const slippedEntry =
          side === 'long'
            ? bar.open * (1 + slippageRate)
            : bar.open * (1 - slippageRate);
        const qty = computeQty(slippedEntry);
        if (qty > 0) {
          const entryNotional = slippedEntry * qty;
          const entryComm = entryNotional * commissionRate;
          cash -= entryNotional + entryComm;
          const sigAtr = atrSeries[Math.max(0, i - 1)] ?? slippedEntry * 0.02;
          const distStop =
            slAtrMult > 0
              ? sigAtr * slAtrMult
              : slPct > 0
                ? slippedEntry * slPct
                : slippedEntry * 0.02;
          const distTp =
            tpAtrMult > 0
              ? sigAtr * tpAtrMult
              : tpPct > 0
                ? slippedEntry * tpPct
                : Infinity;
          openPos = {
            side,
            entryBarIndex: i,
            entryTime: bar.time,
            entryPrice: slippedEntry,
            quantity: qty,
            entryCommission: entryComm,
            peakFavorablePrice: slippedEntry,
            maxFavorablePct: 0,
            maxAdversePct: 0,
            entryTrace: pendingAction.trace,
            stopPrice:
              side === 'long'
                ? slippedEntry - distStop
                : slippedEntry + distStop,
            targetPrice:
              Number.isFinite(distTp)
                ? side === 'long'
                  ? slippedEntry + distTp
                  : slippedEntry - distTp
                : side === 'long'
                  ? Infinity
                  : -Infinity,
            initialRiskPerUnit: Math.max(1e-6, distStop),
            breakevenArmed: false,
          };
        }
      }
      pendingAction = null;
    }

    // 2. Conservative intrabar Stop-Loss / Breakeven / Trailing-Stop / Take-Profit check (SL BEFORE TP!)
    if (openPos) {
      if (openPos.side === 'long') {
        openPos.peakFavorablePrice = Math.max(openPos.peakFavorablePrice, bar.high);
        if (
          breakevenR > 0 &&
          !openPos.breakevenArmed &&
          openPos.peakFavorablePrice - openPos.entryPrice >= openPos.initialRiskPerUnit * breakevenR
        ) {
          openPos.breakevenArmed = true;
          openPos.stopPrice = Math.max(openPos.stopPrice, openPos.entryPrice * 1.0005);
        }
        const mfe = ((bar.high - openPos.entryPrice) / openPos.entryPrice) * 100;
        const mae = ((openPos.entryPrice - bar.low) / openPos.entryPrice) * 100;
        openPos.maxFavorablePct = Math.max(openPos.maxFavorablePct, mfe);
        openPos.maxAdversePct = Math.max(openPos.maxAdversePct, mae);

        const slPrice = openPos.stopPrice;
        const trailPrice =
          trailPct > 0 ? openPos.peakFavorablePrice * (1 - trailPct) : -Infinity;
        const effectiveStop = Math.max(slPrice, trailPrice);
        const tpPrice = openPos.targetPrice;

        const hitSl = bar.low <= effectiveStop && Number.isFinite(effectiveStop);
        const hitTp = bar.high >= tpPrice && Number.isFinite(tpPrice);
        // TradingView Bar Magnifier: if both SL & TP touched on same bar, infer sub-bar wick sequence from open proximity
        const tpBeforeSl =
          Boolean(spec.execution.intrabarMagnifier) &&
          hitSl &&
          hitTp &&
          Math.abs(tpPrice - bar.open) < Math.abs(bar.open - effectiveStop);

        if (tpBeforeSl) {
          const exitPx = Math.max(bar.open, tpPrice);
          closePosition(openPos, i, bar.time, exitPx, 'take_profit', []);
          openPos = null;
        } else if (hitSl) {
          const exitPx = Math.min(bar.open, effectiveStop);
          closePosition(
            openPos,
            i,
            bar.time,
            exitPx,
            trailPrice > slPrice ? 'trailing_stop' : 'stop_loss',
            [],
          );
          openPos = null;
        } else if (hitTp) {
          const exitPx = Math.max(bar.open, tpPrice);
          closePosition(openPos, i, bar.time, exitPx, 'take_profit', []);
          openPos = null;
        }
      } else {
        openPos.peakFavorablePrice = Math.min(openPos.peakFavorablePrice, bar.low);
        if (
          breakevenR > 0 &&
          !openPos.breakevenArmed &&
          openPos.entryPrice - openPos.peakFavorablePrice >= openPos.initialRiskPerUnit * breakevenR
        ) {
          openPos.breakevenArmed = true;
          openPos.stopPrice = Math.min(openPos.stopPrice, openPos.entryPrice * 0.9995);
        }
        const mfe = ((openPos.entryPrice - bar.low) / openPos.entryPrice) * 100;
        const mae = ((bar.high - openPos.entryPrice) / openPos.entryPrice) * 100;
        openPos.maxFavorablePct = Math.max(openPos.maxFavorablePct, mfe);
        openPos.maxAdversePct = Math.max(openPos.maxAdversePct, mae);

        const slPrice = openPos.stopPrice;
        const trailPrice =
          trailPct > 0 ? openPos.peakFavorablePrice * (1 + trailPct) : Infinity;
        const effectiveStop = Math.min(slPrice, trailPrice);
        const tpPrice = openPos.targetPrice;

        if (bar.high >= effectiveStop && Number.isFinite(effectiveStop)) {
          const exitPx = Math.max(bar.open, effectiveStop);
          closePosition(
            openPos,
            i,
            bar.time,
            exitPx,
            trailPrice < slPrice ? 'trailing_stop' : 'stop_loss',
            [],
          );
          openPos = null;
        } else if (bar.low <= tpPrice && Number.isFinite(tpPrice)) {
          const exitPx = Math.min(bar.open, tpPrice);
          closePosition(openPos, i, bar.time, exitPx, 'take_profit', []);
          openPos = null;
        }
      }
    }

    // 3. Evaluate strategy rules at closed bar i
    const decision = evaluateBarDecision(bars, spec, i, cache);
    traces.push(decision);

    if (openPos) {
      const shouldExitLong: boolean =
        openPos.side === 'long' && (decision.exitLongPassed || decision.entryShortPassed);
      const shouldExitShort: boolean =
        openPos.side === 'short' && (decision.exitShortPassed || decision.entryLongPassed);
      if (shouldExitLong || shouldExitShort) {
        const trace: ConditionEvalTrace[] = shouldExitLong
          ? decision.exitLongChecks
          : decision.exitShortChecks;
        if (spec.execution.processOnClose) {
          closePosition(openPos, i, bar.time, bar.close, 'signal', trace);
          openPos = null;
        } else if (i < bars.length - 1) {
          pendingAction = { action: 'close', trace };
        }
      }
    } else {
      const inCooldown = cooldownBars > 0 && i - lastLossExitBar <= cooldownBars;
      if (decision.entryLongPassed && !inCooldown) {
        if (spec.execution.processOnClose) {
          const slippedEntry = bar.close * (1 + slippageRate);
          const qty = computeQty(slippedEntry);
          if (qty > 0) {
            const comm = slippedEntry * qty * commissionRate;
            cash -= slippedEntry * qty + comm;
            const curAtr = atrSeries[i] ?? slippedEntry * 0.02;
            const dStop = slAtrMult > 0 ? curAtr * slAtrMult : slPct > 0 ? slippedEntry * slPct : slippedEntry * 0.02;
            const dTp = tpAtrMult > 0 ? curAtr * tpAtrMult : tpPct > 0 ? slippedEntry * tpPct : Infinity;
            openPos = {
              side: 'long',
              entryBarIndex: i,
              entryTime: bar.time,
              entryPrice: slippedEntry,
              quantity: qty,
              entryCommission: comm,
              peakFavorablePrice: slippedEntry,
              maxFavorablePct: 0,
              maxAdversePct: 0,
              entryTrace: decision.entryLongChecks,
              stopPrice: slippedEntry - dStop,
              targetPrice: Number.isFinite(dTp) ? slippedEntry + dTp : Infinity,
              initialRiskPerUnit: Math.max(1e-6, dStop),
              breakevenArmed: false,
            };
          }
        } else if (i < bars.length - 1) {
          pendingAction = { action: 'open_long', trace: decision.entryLongChecks };
        }
      } else if (decision.entryShortPassed && !inCooldown) {
        if (spec.execution.processOnClose) {
          const slippedEntry = bar.close * (1 - slippageRate);
          const qty = computeQty(slippedEntry);
          if (qty > 0) {
            const comm = slippedEntry * qty * commissionRate;
            cash -= slippedEntry * qty + comm;
            const curAtr = atrSeries[i] ?? slippedEntry * 0.02;
            const dStop = slAtrMult > 0 ? curAtr * slAtrMult : slPct > 0 ? slippedEntry * slPct : slippedEntry * 0.02;
            const dTp = tpAtrMult > 0 ? curAtr * tpAtrMult : tpPct > 0 ? slippedEntry * tpPct : Infinity;
            openPos = {
              side: 'short',
              entryBarIndex: i,
              entryTime: bar.time,
              entryPrice: slippedEntry,
              quantity: qty,
              entryCommission: comm,
              peakFavorablePrice: slippedEntry,
              maxFavorablePct: 0,
              maxAdversePct: 0,
              entryTrace: decision.entryShortChecks,
              stopPrice: slippedEntry + dStop,
              targetPrice: Number.isFinite(dTp) ? slippedEntry - dTp : -Infinity,
              initialRiskPerUnit: Math.max(1e-6, dStop),
              breakevenArmed: false,
            };
          }
        } else if (i < bars.length - 1) {
          pendingAction = { action: 'open_short', trace: decision.entryShortChecks };
        }
      }
    }

    // 4. Mark-to-market equity & drawdown
    let posMarketVal = 0;
    if (openPos) {
      posMarketVal =
        openPos.side === 'long'
          ? bar.close * openPos.quantity
          : openPos.entryPrice * openPos.quantity +
            (openPos.entryPrice - bar.close) * openPos.quantity;
    }
    const equity = cash + posMarketVal;
    if (prevEquity > 0) {
      barReturns.push((equity - prevEquity) / prevEquity);
    }
    prevEquity = equity;

    equityPeak = Math.max(equityPeak, equity);
    equityTrough = Math.min(equityTrough, equity);
    const dd = equityPeak - equity;
    const ddPct = equityPeak > 0 ? (dd / equityPeak) * 100 : 0;
    const ru = equity - equityTrough;
    const ruPct = equityTrough > 0 ? (ru / equityTrough) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    maxRunup = Math.max(maxRunup, ru);
    maxRunupPct = Math.max(maxRunupPct, ruPct);

    equityCurve.push({
      time: bar.time,
      equity: round2(equity),
      drawdownPct: round2(-ddPct),
      buyHoldEquity: round2(buyHoldQty * bar.close),
    });
  }

  // Close any open position on the final bar so ledger reconciles cleanly
  if (openPos) {
    const lastBar = bars[bars.length - 1];
    closePosition(openPos, bars.length - 1, lastBar.time, lastBar.close, 'end_of_data', []);
    openPos = null;
  }

  // Single-pass Welford 2-sigma outlier tagging (matching TradingView 84595.js)
  if (trades.length >= 2) {
    let n = 0;
    let mean = 0;
    let m2 = 0;
    for (const t of trades) {
      n += 1;
      const d = t.netProfitPercent - mean;
      mean += d / n;
      m2 += d * (t.netProfitPercent - mean);
    }
    const sd = Math.sqrt(m2 / (n - 1));
    if (sd > 0) {
      for (const t of trades) {
        if (Math.abs(t.netProfitPercent - mean) > 2 * sd) {
          t.isOutlier = true;
        }
      }
    }
  }

  const longTrades = trades.filter((t) => t.side === 'long');
  const shortTrades = trades.filter((t) => t.side === 'short');
  const allBlock = summarizePerformanceBlock(trades, initialCapital);
  const longBlock = summarizePerformanceBlock(longTrades, initialCapital);
  const shortBlock = summarizePerformanceBlock(shortTrades, initialCapital);

  const finalEquity =
    equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialCapital;
  const lastClose = bars[bars.length - 1].close;
  const buyHoldReturn = buyHoldQty * lastClose - initialCapital;
  const buyHoldReturnPercent = (buyHoldReturn / initialCapital) * 100;
  const strategyOutperformancePercent = allBlock.netProfitPercent - buyHoldReturnPercent;

  // Sharpe & Sortino (annualized by timeframe bar count)
  const stepSec = Math.max(60, bars.length > 1 ? bars[1].time - bars[0].time : 86400);
  const barsPerYear = (365 * 86400) / stepSec;
  const nRet = barReturns.length;
  const meanRet = nRet > 0 ? barReturns.reduce((a, b) => a + b, 0) / nRet : 0;
  const varRet =
    nRet > 1
      ? barReturns.reduce((a, r) => a + (r - meanRet) * (r - meanRet), 0) / (nRet - 1)
      : 0;
  const stdRet = Math.sqrt(varRet);
  const downsideSq =
    nRet > 1
      ? barReturns.reduce((a, r) => a + (r < 0 ? r * r : 0), 0) / (nRet - 1)
      : 0;
  const downStd = Math.sqrt(downsideSq);

  const sharpeRatio = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(barsPerYear) : 0;
  const sortinoRatio = downStd > 0 ? (meanRet / downStd) * Math.sqrt(barsPerYear) : 0;

  const spanDays = Math.max(0, (bars[bars.length - 1].time - bars[0].time) / 86400);
  const cagrPercent =
    spanDays >= 30 && finalEquity > 0
      ? (Math.pow(finalEquity / initialCapital, 365 / spanDays) - 1) * 100
      : 0;
  const calmarRatio = maxDrawdownPct > 0 ? cagrPercent / maxDrawdownPct : 0;
  const returnOnMaxDrawdown =
    maxDrawdown > 0 ? (allBlock.netProfit / maxDrawdown) * 100 : 0;

  // Pearson correlation between trade profits and buy & hold deltas (matching 84595.js)
  let strategyBuyHoldCorrelation = 0;
  if (trades.length >= 2 && buyHoldDeltasAtTrades.length === trades.length) {
    const meanP = trades.reduce((a, t) => a + t.netProfit, 0) / trades.length;
    const meanB =
      buyHoldDeltasAtTrades.reduce((a, v) => a + v, 0) / buyHoldDeltasAtTrades.length;
    let num = 0;
    let denP = 0;
    let denB = 0;
    for (let i = 0; i < trades.length; i += 1) {
      const dp = trades[i].netProfit - meanP;
      const db = buyHoldDeltasAtTrades[i] - meanB;
      num += dp * db;
      denP += dp * dp;
      denB += db * db;
    }
    const corr = num / Math.sqrt(denP * denB);
    if (Number.isFinite(corr)) strategyBuyHoldCorrelation = round2(corr);
  }

  // Best entry UTC hour & day
  const hourBuckets = new Map<number, { wins: number; total: number }>();
  const dayBuckets = new Map<number, { wins: number; total: number }>();
  for (const t of trades) {
    const d = new Date(t.entryTime * 1000);
    const hr = d.getUTCHours();
    const dy = d.getUTCDay();
    const hb = hourBuckets.get(hr) ?? { wins: 0, total: 0 };
    hb.total += 1;
    if (t.netProfit > 0) hb.wins += 1;
    hourBuckets.set(hr, hb);

    const db = dayBuckets.get(dy) ?? { wins: 0, total: 0 };
    db.total += 1;
    if (t.netProfit > 0) db.wins += 1;
    dayBuckets.set(dy, db);
  }
  const pickBestBucket = (map: Map<number, { wins: number; total: number }>): number | null => {
    let bestKey: number | null = null;
    let bestRate = -1;
    for (const [k, v] of map.entries()) {
      const rate = v.wins / v.total;
      if (rate > bestRate) {
        bestRate = rate;
        bestKey = k;
      }
    }
    return bestKey;
  };

  const report: BacktestReport = {
    strategyId: spec.id,
    strategyName: spec.name,
    symbol: spec.symbol,
    timeframe: spec.timeframe,
    barCount: bars.length,
    startTime: bars[0].time,
    endTime: bars[bars.length - 1].time,
    initialCapital: round2(initialCapital),
    finalEquity: round2(finalEquity),
    buyHoldReturn: round2(buyHoldReturn),
    buyHoldReturnPercent: round2(buyHoldReturnPercent),
    strategyOutperformancePercent: round2(strategyOutperformancePercent),
    maxDrawdown: round2(maxDrawdown),
    maxDrawdownPercent: round2(maxDrawdownPct),
    maxRunup: round2(maxRunup),
    maxRunupPercent: round2(maxRunupPct),
    sharpeRatio: round2(sharpeRatio),
    sortinoRatio: round2(sortinoRatio),
    calmarRatio: round2(calmarRatio),
    cagrPercent: round2(cagrPercent),
    strategyBuyHoldCorrelation,
    returnOnMaxDrawdown: round2(returnOnMaxDrawdown),
    bestEntryHourUtc: pickBestBucket(hourBuckets),
    bestEntryDayUtc: pickBestBucket(dayBuckets),
    all: allBlock,
    long: longBlock,
    short: shortBlock,
    equityCurve,
    trades,
    recentTraces: traces.slice(-60),
    spec,
  };

  if (includeStress) {
    // 1. Walk-Forward Out-of-Sample Split (70% IS / 30% OOS)
    let walkForward: WalkForwardSummary | undefined;
    if (bars.length >= 60) {
      const splitIdx = Math.floor(bars.length * 0.7);
      const isRep = runStrategyBacktest(bars.slice(0, splitIdx), spec, { includeStress: false });
      const oosRep = runStrategyBacktest(bars.slice(splitIdx), spec, { includeStress: false });
      const overfitRatio =
        isRep.sharpeRatio > 0.05 ? round2(oosRep.sharpeRatio / isRep.sharpeRatio) : oosRep.sharpeRatio > 0 ? 1 : 0;
      const verdict: WalkForwardSummary['verdict'] =
        oosRep.all.netProfitPercent > 0 && oosRep.sharpeRatio >= 0.4
          ? 'ROBUST'
          : isRep.all.netProfitPercent > 1 && oosRep.all.netProfitPercent < -0.5
            ? 'OVERFIT'
            : 'FRAGILE';
      walkForward = {
        splitIndex: splitIdx,
        inSampleBars: splitIdx,
        outOfSampleBars: bars.length - splitIdx,
        inSampleReturnPct: isRep.all.netProfitPercent,
        outOfSampleReturnPct: oosRep.all.netProfitPercent,
        inSampleSharpe: isRep.sharpeRatio,
        outOfSampleSharpe: oosRep.sharpeRatio,
        overfitRatio,
        verdict,
      };
    }

    // 2. Deterministic Seeded Monte Carlo Bootstrap (500 paths)
    let monteCarlo: MonteCarloSummary | undefined;
    if (trades.length >= 3) {
      const iterations = 500;
      const tradePcts = trades.map((t) => Math.max(-0.95, t.netProfit / initialCapital));
      let seed = 133791;
      const nextRand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const pathReturns: number[] = [];
      const pathDDs: number[] = [];
      let ruinCount = 0;
      for (let iter = 0; iter < iterations; iter += 1) {
        let eq = 1.0;
        let peak = 1.0;
        let maxDd = 0;
        for (let k = 0; k < tradePcts.length; k += 1) {
          const idx = Math.floor(nextRand() * tradePcts.length);
          eq *= 1 + tradePcts[idx];
          if (eq > peak) peak = eq;
          const dd = peak > 0 ? (peak - eq) / peak : 0;
          if (dd > maxDd) maxDd = dd;
        }
        const retPct = (eq - 1) * 100;
        if (retPct <= -30) ruinCount += 1;
        pathReturns.push(retPct);
        pathDDs.push(maxDd * 100);
      }
      pathReturns.sort((a, b) => a - b);
      pathDDs.sort((a, b) => a - b);
      const q = (arr: number[], p: number) =>
        round2(arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))] ?? 0);
      monteCarlo = {
        iterations,
        medianReturnPct: q(pathReturns, 0.5),
        p5ReturnPct: q(pathReturns, 0.05),
        p95ReturnPct: q(pathReturns, 0.95),
        medianMaxDrawdownPct: q(pathDDs, 0.5),
        p95MaxDrawdownPct: q(pathDDs, 0.95),
        ruinProbabilityPct: round2((ruinCount / iterations) * 100),
      };
    }

    // 3. 2x Commission + Slippage Cost Stress Test
    const stressedSpec: StrategyRuleSpec = {
      ...spec,
      execution: {
        ...spec.execution,
        commissionPct: (spec.execution.commissionPct || 0.05) * 2,
        slippageBps: (spec.execution.slippageBps || 5) * 2,
      },
    };
    const stressedRep = runStrategyBacktest(bars, stressedSpec, { includeStress: false });
    const costStress: CostStressSummary = {
      commissionMultiplier: 2,
      slippageMultiplier: 2,
      stressedNetProfitPercent: stressedRep.all.netProfitPercent,
      stressedProfitFactor: stressedRep.all.profitFactor,
      survivesDoubleCost: stressedRep.all.netProfit > 0,
    };

    // 4. Regime Breakdown (Bull / Bear / Chop via SMA50 slope + price)
    const sma50 = computeSmaValues(bars.map((b) => b.close), 50);
    const regimeAcc: Record<'bull' | 'bear' | 'chop', { trades: number; wins: number; net: number; pctSum: number }> = {
      bull: { trades: 0, wins: 0, net: 0, pctSum: 0 },
      bear: { trades: 0, wins: 0, net: 0, pctSum: 0 },
      chop: { trades: 0, wins: 0, net: 0, pctSum: 0 },
    };
    for (const t of trades) {
      const idx = t.entryBarIndex;
      const sNow = sma50[idx];
      const sPrev = sma50[Math.max(0, idx - 5)];
      let reg: 'bull' | 'bear' | 'chop' = 'chop';
      if (sNow !== null && sPrev !== null) {
        if (bars[idx].close > sNow && sNow >= sPrev) reg = 'bull';
        else if (bars[idx].close < sNow && sNow <= sPrev) reg = 'bear';
      }
      regimeAcc[reg].trades += 1;
      if (t.netProfit > 0) regimeAcc[reg].wins += 1;
      regimeAcc[reg].net += t.netProfit;
      regimeAcc[reg].pctSum += t.netProfitPercent;
    }
    const regimes: RegimePerfBlock[] = (['bull', 'bear', 'chop'] as const).map((r) => ({
      regime: r,
      trades: regimeAcc[r].trades,
      winRatePct: regimeAcc[r].trades > 0 ? round2((regimeAcc[r].wins / regimeAcc[r].trades) * 100) : 0,
      netProfit: round2(regimeAcc[r].net),
      avgTradePct: regimeAcc[r].trades > 0 ? round2(regimeAcc[r].pctSum / regimeAcc[r].trades) : 0,
    }));

    // 5. Strict Statistical Quant Scorecard (t-stat + normal p-value + A-F Grade)
    const tradePcts = trades.map((t) => t.netProfitPercent);
    const nTr = tradePcts.length;
    const meanPct = nTr > 0 ? tradePcts.reduce((a, b) => a + b, 0) / nTr : 0;
    const sdPct =
      nTr > 1
        ? Math.sqrt(tradePcts.reduce((a, v) => a + (v - meanPct) ** 2, 0) / (nTr - 1))
        : 0;
    const tStat = nTr >= 2 && sdPct > 0 ? round2(meanPct / (sdPct / Math.sqrt(nTr))) : 0;
    // Abramowitz & Stegun two-tailed normal p-value approximation
    const z = Math.abs(tStat);
    const erfApprox = 1 - 1 / Math.pow(1 + 0.278393 * z + 0.230389 * z * z + 0.000972 * z ** 3 + 0.078108 * z ** 4, 4);
    const pValue = nTr >= 2 ? round4(Math.max(0.0001, 1 - erfApprox)) : 1;

    const flags: string[] = [];
    let score = 45;
    if (nTr >= 30) score += 15;
    else flags.push(`Small sample size (${nTr} trades < 30 statistical threshold).`);
    if (allBlock.profitFactor >= 1.5) score += 15;
    else if (allBlock.profitFactor >= 1.1) score += 5;
    else flags.push(`Thin/negative Profit Factor (${allBlock.profitFactor}).`);
    if (sharpeRatio >= 1.2) score += 10;
    else if (sharpeRatio < 0.3) {
      score -= 10;
      flags.push(`Weak risk-adjusted Sharpe (${sharpeRatio}).`);
    }
    if (costStress.survivesDoubleCost) score += 10;
    else {
      score -= 15;
      flags.push('Strategy turns negative under 2x commission + slippage stress.');
    }
    if (walkForward) {
      if (walkForward.verdict === 'ROBUST') score += 10;
      else if (walkForward.verdict === 'OVERFIT') {
        score -= 20;
        flags.push(`Walk-Forward OOS degradation: IS ${walkForward.inSampleReturnPct}% vs OOS ${walkForward.outOfSampleReturnPct}%.`);
      } else {
        flags.push(`Walk-Forward fragile (${walkForward.verdict}).`);
      }
    }
    if (monteCarlo && monteCarlo.p5ReturnPct < -15) {
      score -= 5;
      flags.push(`95th-percentile tail loss risk: P5 return=${monteCarlo.p5ReturnPct}%.`);
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    const grade: QuantScorecard['grade'] =
      score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';

    report.walkForward = walkForward;
    report.monteCarlo = monteCarlo;
    report.costStress = costStress;
    report.regimes = regimes;
    report.scorecard = {
      score,
      grade,
      tStat,
      pValue,
      sampleSizeAdequate: nTr >= 30,
      flags,
    };

    // Monthly Returns Heatmap Aggregation (YYYY-MM)
    const monthMap = new Map<string, { netProfit: number; trades: number }>();
    for (const tr of trades) {
      const ym = new Date(tr.exitTime * 1000).toISOString().slice(0, 7);
      const cur = monthMap.get(ym) ?? { netProfit: 0, trades: 0 };
      cur.netProfit += tr.netProfit;
      cur.trades += 1;
      monthMap.set(ym, cur);
    }
    report.monthlyReturns = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([yearMonth, v]) => ({
        yearMonth,
        netProfit: round2(v.netProfit),
        returnPct: round2((v.netProfit / initialCapital) * 100),
        trades: v.trades,
      }));
  }

  return report;
}

/**
 * Automated multi-parameter optimizer equivalent to TradingView Copilot's `tvapi_strategy_sweep`.
 */
export function runParameterSweep(
  bars: OHLCVBar[],
  baseSpec: StrategyRuleSpec,
  metric: 'sharpeRatio' | 'netProfitPercent' | 'profitFactor' | 'maxDrawdownPercent' = 'sharpeRatio',
): StrategySweepResponse {
  const startedAt = Date.now();
  const baseSl = baseSpec.risk.stopLossPct > 0 ? baseSpec.risk.stopLossPct : 2;
  const baseTp = baseSpec.risk.takeProfitPct > 0 ? baseSpec.risk.takeProfitPct : 4;

  const slCandidates = Array.from(
    new Set([round2(Math.max(0.5, baseSl * 0.6)), round2(baseSl), round2(baseSl * 1.5), round2(baseSl * 2)]),
  );
  const tpCandidates = Array.from(
    new Set([round2(Math.max(1, baseTp * 0.6)), round2(baseTp), round2(baseTp * 1.5), round2(baseTp * 2)]),
  );

  // Also test primary indicator period scaling if present
  const firstInd = baseSpec.entryLong?.conditions.find((c) => c.left.kind === 'indicator');
  const basePeriod =
    firstInd && firstInd.left.kind === 'indicator' ? firstInd.left.period : undefined;

  const results: StrategySweepItem[] = [];
  for (const sl of slCandidates) {
    for (const tp of tpCandidates) {
      const cloned: StrategyRuleSpec = {
        ...baseSpec,
        risk: {
          ...baseSpec.risk,
          stopLossPct: sl,
          takeProfitPct: tp,
        },
      };
      const rep = runStrategyBacktest(bars, cloned, { includeStress: false });
      results.push({
        label: `SL ${sl}% / TP ${tp}%${basePeriod ? ` (P=${basePeriod})` : ''}`,
        params: {
          stopLossPct: sl,
          takeProfitPct: tp,
          ...(basePeriod ? { period: basePeriod } : {}),
        },
        netProfitPercent: rep.all.netProfitPercent,
        profitFactor: rep.all.profitFactor,
        maxDrawdownPercent: rep.maxDrawdownPercent,
        sharpeRatio: rep.sharpeRatio,
        totalTrades: rep.all.totalTrades,
        winRatePercent: rep.all.percentProfitable,
      });
    }
  }

  results.sort((a, b) => {
    if (metric === 'maxDrawdownPercent') {
      return a.maxDrawdownPercent - b.maxDrawdownPercent;
    }
    return b[metric] - a[metric];
  });

  return {
    ok: true,
    metric,
    results: results.slice(0, 16),
    best: results[0],
    durationMs: Date.now() - startedAt,
  };
}
