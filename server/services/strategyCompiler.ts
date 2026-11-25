import type {
  BacktestTrade,
  BarDecisionTrace,
  ConditionEvalTrace,
  MasterPromptDraft,
  MasterPromptRequest,
  MasterPromptResponse,
  OHLCVBar,
  RuleCondition,
  RuleGroup,
  RuleOperand,
  RuleOperator,
  StrategyAIProvider,
  StrategyAuditIssue,
  StrategyExplainRequest,
  StrategyExplainResponse,
  StrategyRefineRequest,
  StrategyRuleSpec,
  Timeframe,
} from '../../shared/types.js';
import {
  evaluateBarDecision,
  runStrategyBacktest,
} from '../../shared/strategyEngine.js';
import { getRawConnectionsConfig } from './connectionsStore.js';
import { invokeGemini } from './geminiClient.js';
import { invokeOpenAICompat } from './openaiCompatClient.js';
import { invokeOpenCode } from './opencodeClient.js';

function formatOperand(op: RuleOperand): string {
  if (op.kind === 'number') return String(op.value);
  if (op.kind === 'price') return `bar.${op.field}`;
  if (op.kind === 'pattern') {
    return `Pattern(${op.pattern}${op.lookback ? `,${op.lookback}` : ''})`;
  }
  switch (op.indicator) {
    case 'sma':
      return `SMA(${op.period ?? 20})`;
    case 'ema':
      return `EMA(${op.period ?? 20})`;
    case 'rsi':
      return `RSI(${op.period ?? 14})`;
    case 'macd_line':
      return `MACD(${op.fast ?? 12},${op.slow ?? 26})`;
    case 'macd_signal':
      return `MACD_Signal(${op.fast ?? 12},${op.slow ?? 26},${op.signal ?? 9})`;
    case 'macd_hist':
      return `MACD_Hist(${op.fast ?? 12},${op.slow ?? 26},${op.signal ?? 9})`;
    case 'bb_upper':
      return `BB_Upper(${op.period ?? 20},${op.stdDev ?? 2})`;
    case 'bb_middle':
      return `BB_Mid(${op.period ?? 20})`;
    case 'bb_lower':
      return `BB_Lower(${op.period ?? 20},${op.stdDev ?? 2})`;
    case 'vwap':
      return 'VWAP';
    case 'atr':
      return `ATR(${op.period ?? 14})`;
    case 'highest_high':
      return `HighestHigh(${op.period ?? 20})`;
    case 'lowest_low':
      return `LowestLow(${op.period ?? 20})`;
    case 'adx':
      return `ADX(${op.period ?? 14})`;
    case 'di_plus':
      return `+DI(${op.period ?? 14})`;
    case 'di_minus':
      return `-DI(${op.period ?? 14})`;
    case 'supertrend':
      return `Supertrend(${op.period ?? 10},${op.multiplier ?? 3})`;
    case 'supertrend_dir':
      return `SupertrendDir(${op.period ?? 10},${op.multiplier ?? 3})`;
    case 'stoch_k':
      return `StochK(${op.period ?? 14})`;
    case 'stoch_d':
      return `StochD(${op.period ?? 14})`;
    case 'volume_sma':
      return `VolSMA(${op.period ?? 20})`;
    case 'volume_ratio':
      return `VolRatio(${op.period ?? 20})`;
    case 'prev_high':
      return 'PrevHigh';
    case 'prev_low':
      return 'PrevLow';
    case 'prev_close':
      return 'PrevClose';
  }
}

function formatRuleGroup(group: RuleGroup | undefined): string {
  if (!group || group.conditions.length === 0) return 'None';
  return group.conditions
    .map(
      (c, idx) =>
        `${idx + 1}. [${c.label}] (${formatOperand(c.left)} ${c.operator} ${formatOperand(c.right)})`,
    )
    .join(`\n   ${group.combinator} `);
}

function isConstantBoundContradiction(group: RuleGroup | undefined): string | null {
  if (!group || group.combinator !== 'AND' || group.conditions.length < 2) {
    return null;
  }
  const byInd = new Map<string, { min: number; max: number }>();
  for (const cond of group.conditions) {
    if (cond.left.kind !== 'indicator' || cond.right.kind !== 'number') continue;
    const key = formatOperand(cond.left);
    const val = cond.right.value;
    const cur = byInd.get(key) ?? { min: -Infinity, max: Infinity };
    if (cond.operator === '>' || cond.operator === '>=') {
      cur.min = Math.max(cur.min, val);
    } else if (cond.operator === '<' || cond.operator === '<=') {
      cur.max = Math.min(cur.max, val);
    }
    byInd.set(key, cur);
    if (cur.min >= cur.max) {
      return `${key} cannot simultaneously satisfy >= ${cur.min} and <= ${cur.max}`;
    }
  }
  return null;
}

/**
 * Strictly audits natural-language strategy text and compiled rules for
 * lookahead bias, contradictions, missing risk guards, and vague phrases.
 */
export function auditStrategyDescriptionAndSpec(
  description: string,
  spec: StrategyRuleSpec,
): StrategyAuditIssue[] {
  const issues: StrategyAuditIssue[] = [];
  const textToAudit = description.startsWith('# MASTER STRATEGY PROMPT')
    ? description.split(/\r?\n## 5\./)[0]
    : description;
  const lower = textToAudit.toLowerCase();
  const sanitizedForLookahead = lower.replace(
    /\b(?:anti|zero|no|non|without)[\s-]+look[\s-]*ahead\b/gi,
    '',
  );

  // 1. Critical: Future/lookahead bias
  const lookaheadMatch = sanitizedForLookahead.match(
    /\b(next\s+bar|tomorrow'?s|future\s+high|future\s+low|future\s+close|look\s*-?\s*ahead|peek\s+ahead|after\s+tomorrow)\b/i,
  );
  if (lookaheadMatch) {
    issues.push({
      id: 'audit-lookahead',
      severity: 'critical',
      code: 'LOOKAHEAD_BIAS',
      rule: 'Zero-Lookahead Execution Contract',
      explanation: `Detected future-bar reference ("${lookaheadMatch[0]}"). Strategies may only read closed bar[i] and historical lookbacks; fills occur on bar[i+1] open or confirmed bar[i] close.`,
      suggestedFix:
        'Rewrite entry/exit conditions using confirmed close[i] or prior bar[i-1] data (no future bar values).',
    });
  }

  // 2. Critical: No executable entry rules
  const hasLongEntry = (spec.entryLong?.conditions.length ?? 0) > 0;
  const hasShortEntry = (spec.entryShort?.conditions.length ?? 0) > 0;
  if (!hasLongEntry && !hasShortEntry) {
    issues.push({
      id: 'audit-no-entry',
      severity: 'critical',
      code: 'NO_ENTRY_RULES',
      rule: 'Mandatory Quantitative Entry Trigger',
      explanation:
        'Could not compile any deterministic entry condition from the strategy description.',
      suggestedFix:
        'Specify explicit indicator or price conditions such as "EMA 9 crosses above EMA 21 and RSI < 65".',
    });
  }

  // 3. Critical: Contradictory constant bounds
  const longContra = isConstantBoundContradiction(spec.entryLong);
  if (longContra) {
    issues.push({
      id: 'audit-contra-long',
      severity: 'critical',
      code: 'CONTRADICTORY_CONDITIONS',
      rule: 'Logical Consistency Check',
      explanation: `Impossible long entry constraint: ${longContra}.`,
      suggestedFix: 'Relax or separate mutually exclusive bounds using OR logic.',
    });
  }
  const shortContra = isConstantBoundContradiction(spec.entryShort);
  if (shortContra) {
    issues.push({
      id: 'audit-contra-short',
      severity: 'critical',
      code: 'CONTRADICTORY_CONDITIONS',
      rule: 'Logical Consistency Check',
      explanation: `Impossible short entry constraint: ${shortContra}.`,
      suggestedFix: 'Separate mutually exclusive bounds on short entry conditions.',
    });
  }

  // 4. Critical: Missing or non-positive SL/TP when strict execution is active
  if (spec.risk.stopLossPct <= 0) {
    issues.push({
      id: 'audit-invalid-sl',
      severity: 'critical',
      code: 'INVALID_STOP_LOSS',
      rule: 'Mandatory Capital Preservation Stop',
      explanation: 'Stop-Loss percentage must be strictly > 0% for automated execution.',
      suggestedFix: 'Set Stop-Loss between 0.5% and 10% (e.g., 2.0%).',
    });
  }

  // 5. Warnings: Vague/subjective wording
  const vagueMatches = [
    ...lower.matchAll(
      /\b(looks?\s+bullish|looks?\s+bearish|feels?|strong\s+momentum|good\s+support|good\s+resistance|maybe|kind\s+of|sort\s+of|vibes?|gut|trust\s+me|whenever\s+good|high\s+volume)\b/gi,
    ),
  ].map((m) => m[0]);

  if (vagueMatches.length > 0) {
    issues.push({
      id: 'audit-vague',
      severity: 'warning',
      code: 'VAGUE_LANGUAGE',
      rule: 'No Ambiguous or Subjective Phrases',
      explanation: `Ambiguous phrasing detected (${Array.from(new Set(vagueMatches)).join(', ')}). Subjective discretion cannot be reproducibly backtested or auto-traded.`,
      suggestedFix:
        'Verify that the compiled numeric thresholds in the Master Prompt accurately represent what you mean before approving.',
    });
  }

  // 6. Warnings: Missing explicit SL/TP/Exit in plain English prompt
  const hasSlMention = /\b(stop\s*-?\s*loss|sl\b|trailing\s+stop|stop\s+at)\b/i.test(lower);
  const hasTpMention = /\b(take\s*-?\s*profit|tp\b|target\s+profit|profit\s+target)\b/i.test(lower);
  if (!hasSlMention && spec.risk.stopLossPct > 0) {
    issues.push({
      id: 'audit-default-sl',
      severity: 'warning',
      code: 'MISSING_STOP_LOSS',
      rule: 'Explicit Stop-Loss Disclosure',
      explanation: `Your prompt did not state a stop-loss. The strict compiler injected a protective ${spec.risk.stopLossPct}% hard stop-loss.`,
      suggestedFix: 'Confirm this stop-loss % in the Master Prompt or specify your own in the prompt.',
    });
  }
  if (!hasTpMention && spec.risk.takeProfitPct > 0) {
    issues.push({
      id: 'audit-default-tp',
      severity: 'warning',
      code: 'MISSING_TAKE_PROFIT',
      rule: 'Explicit Take-Profit Disclosure',
      explanation: `Your prompt did not state a take-profit target. The strict compiler injected a ${spec.risk.takeProfitPct}% take-profit target.`,
      suggestedFix: 'Confirm or adjust the take-profit % before running.',
    });
  }

  const hasLongExit = (spec.exitLong?.conditions.length ?? 0) > 0;
  if (hasLongEntry && !hasLongExit) {
    issues.push({
      id: 'audit-no-exit-signal',
      severity: 'info',
      code: 'MISSING_EXIT_RULE',
      rule: 'Signal Exit vs Risk Bracket',
      explanation:
        'No indicator-based exit signal was defined; positions will close via hard Stop-Loss / Take-Profit brackets.',
      suggestedFix: 'Optionally add an exit condition like "RSI > 70" or "EMA 9 crosses below EMA 21".',
    });
  }

  if (spec.risk.takeProfitPct > 0 && spec.risk.takeProfitPct < spec.risk.stopLossPct) {
    issues.push({
      id: 'audit-rr',
      severity: 'warning',
      code: 'UNFAVORABLE_RR',
      rule: 'Risk-Reward Asymmetry Warning',
      explanation: `Take-Profit (${spec.risk.takeProfitPct}%) is smaller than Stop-Loss (${spec.risk.stopLossPct}%), requiring > ${Math.round((spec.risk.stopLossPct / (spec.risk.stopLossPct + spec.risk.takeProfitPct)) * 100)}% win rate just to break even before fees.`,
      suggestedFix: 'Target Take-Profit >= 1.5x Stop-Loss for resilient expectancy.',
    });
  }

  if (spec.risk.riskPerTradePct > 3 || spec.risk.maxDailyLossPct > 5) {
    issues.push({
      id: 'audit-high-risk',
      severity: 'warning',
      code: 'HIGH_RISK_PER_TRADE',
      rule: 'Position Sizing & Daily Drawdown Guardrail',
      explanation: `Aggressive risk settings detected (Risk/Trade: ${spec.risk.riskPerTradePct}%, Max Daily Loss: ${spec.risk.maxDailyLossPct}%).`,
      suggestedFix: 'Keep risk per trade <= 2% and daily circuit breaker <= 5%.',
    });
  }

  return issues;
}

/**
 * Deterministic natural-language -> StrategyRuleSpec compiler.
 * Always yields valid, zero-lookahead quantitative rules.
 */
export function parseNaturalLanguageToRuleSpec(
  description: string,
  symbol: string,
  timeframe: Timeframe,
): StrategyRuleSpec {
  const lower = description.toLowerCase();
  const entryLongConds: RuleCondition[] = [];
  const exitLongConds: RuleCondition[] = [];
  const entryShortConds: RuleCondition[] = [];
  const exitShortConds: RuleCondition[] = [];
  let cSeq = 0;
  const nextId = () => `cond-${++cSeq}`;

  // Detect Moving Average Crossover: e.g. "EMA 9 crosses above EMA 21" / "SMA 50 200"
  const maCrossMatch = lower.match(
    /\b(ema|sma)\s*\(?\s*(\d{1,3})\s*\)?\s*(?:and|\/|x|cross(?:es|ing)?\s*(?:above|over)?)\s*(?:(ema|sma)\s*\(?\s*)?(\d{1,3})\b/i,
  );
  if (maCrossMatch) {
    const fastType = maCrossMatch[1].toLowerCase() === 'sma' ? 'sma' : 'ema';
    const slowType = (maCrossMatch[3] || maCrossMatch[1]).toLowerCase() === 'sma' ? 'sma' : 'ema';
    const p1 = Math.max(2, Number(maCrossMatch[2]));
    const p2 = Math.max(p1 + 1, Number(maCrossMatch[4]));
    const fLabel = `${fastType.toUpperCase()}(${p1})`;
    const sLabel = `${slowType.toUpperCase()}(${p2})`;

    entryLongConds.push({
      id: nextId(),
      label: `${fLabel} crosses above ${sLabel}`,
      left: { kind: 'indicator', indicator: fastType, period: p1 },
      operator: 'crosses_above',
      right: { kind: 'indicator', indicator: slowType, period: p2 },
    });
    exitLongConds.push({
      id: nextId(),
      label: `${fLabel} crosses below ${sLabel}`,
      left: { kind: 'indicator', indicator: fastType, period: p1 },
      operator: 'crosses_below',
      right: { kind: 'indicator', indicator: slowType, period: p2 },
    });
    entryShortConds.push({
      id: nextId(),
      label: `${fLabel} crosses below ${sLabel}`,
      left: { kind: 'indicator', indicator: fastType, period: p1 },
      operator: 'crosses_below',
      right: { kind: 'indicator', indicator: slowType, period: p2 },
    });
    exitShortConds.push({
      id: nextId(),
      label: `${fLabel} crosses above ${sLabel}`,
      left: { kind: 'indicator', indicator: fastType, period: p1 },
      operator: 'crosses_above',
      right: { kind: 'indicator', indicator: slowType, period: p2 },
    });
  } else if (/\bgolden\s+cross\b/i.test(lower)) {
    entryLongConds.push({
      id: nextId(),
      label: 'SMA(50) crosses above SMA(200)',
      left: { kind: 'indicator', indicator: 'sma', period: 50 },
      operator: 'crosses_above',
      right: { kind: 'indicator', indicator: 'sma', period: 200 },
    });
    exitLongConds.push({
      id: nextId(),
      label: 'SMA(50) crosses below SMA(200)',
      left: { kind: 'indicator', indicator: 'sma', period: 50 },
      operator: 'crosses_below',
      right: { kind: 'indicator', indicator: 'sma', period: 200 },
    });
  } else {
    // Single MA trend filter: "above EMA 20" / "crosses above SMA 50"
    const singleMa = lower.match(/\b(close|price)?\s*(?:cross(?:es)?\s*)?(above|>|below|<)?\s*(ema|sma)\s*\(?\s*(\d{1,3})\b/i);
    if (singleMa) {
      const maType = singleMa[3].toLowerCase() === 'sma' ? 'sma' : 'ema';
      const period = Math.max(2, Number(singleMa[4]));
      const dirWord = (singleMa[2] || '>').toLowerCase();
      const op =
        lower.includes('crosses above')
          ? 'crosses_above'
          : lower.includes('crosses below')
            ? 'crosses_below'
            : dirWord === 'below' || dirWord === '<'
              ? '<'
              : '>';
      entryLongConds.push({
        id: nextId(),
        label: `Close ${op} ${maType.toUpperCase()}(${period})`,
        left: { kind: 'price', field: 'close' },
        operator: op,
        right: { kind: 'indicator', indicator: maType, period },
      });
    }
  }

  // RSI rules: e.g. "RSI < 30", "RSI below 65", "RSI > 70"
  const rsiMatches = [
    ...lower.matchAll(
      /\brsi(?:\s*\(?\s*(\d{1,2})\s*\)?)?\s*(?:is\s*)?(crosses\s+above|crosses\s+below|below|under|less\s+than|<|<=|above|over|greater\s+than|>|>=)\s*(\d{1,2}(?:\.\d+)?)/gi,
    ),
  ];
  for (const m of rsiMatches) {
    const period = m[1] ? Math.max(2, Number(m[1])) : 14;
    const rawOp = m[2].toLowerCase();
    const thresh = Number(m[3]);
    const op: RuleOperator = rawOp.includes('crosses above')
      ? 'crosses_above'
      : rawOp.includes('crosses below')
        ? 'crosses_below'
        : rawOp.includes('<=')
          ? '<='
          : rawOp.includes('>=')
            ? '>='
            : rawOp.includes('below') || rawOp.includes('under') || rawOp.includes('less') || rawOp.includes('<')
              ? '<'
              : '>';
    const cond: RuleCondition = {
      id: nextId(),
      label: `RSI(${period}) ${op} ${thresh}`,
      left: { kind: 'indicator', indicator: 'rsi', period },
      operator: op,
      right: { kind: 'number', value: thresh },
    };
    if ((op === '>' || op === '>=') && thresh >= 65 && entryLongConds.length > 0 && /exit|take\s*profit|overbought|sell/i.test(lower)) {
      exitLongConds.push(cond);
    } else {
      entryLongConds.push(cond);
    }
  }
  if (rsiMatches.length === 0 && /\boversold\b/i.test(lower)) {
    entryLongConds.push({
      id: nextId(),
      label: 'RSI(14) < 30 (Quantified Oversold)',
      left: { kind: 'indicator', indicator: 'rsi', period: 14 },
      operator: '<',
      right: { kind: 'number', value: 30 },
    });
  }
  if (rsiMatches.length === 0 && /\boverbought\b/i.test(lower)) {
    if (entryLongConds.length > 0) {
      exitLongConds.push({
        id: nextId(),
        label: 'RSI(14) > 70 (Quantified Overbought Exit)',
        left: { kind: 'indicator', indicator: 'rsi', period: 14 },
        operator: '>',
        right: { kind: 'number', value: 70 },
      });
    } else {
      entryShortConds.push({
        id: nextId(),
        label: 'RSI(14) > 70 (Quantified Overbought Short)',
        left: { kind: 'indicator', indicator: 'rsi', period: 14 },
        operator: '>',
        right: { kind: 'number', value: 70 },
      });
    }
  }

  // MACD rules
  if (/\bmacd\b/i.test(lower)) {
    if (/hist/i.test(lower)) {
      entryLongConds.push({
        id: nextId(),
        label: 'MACD Histogram > 0',
        left: { kind: 'indicator', indicator: 'macd_hist', fast: 12, slow: 26, signal: 9 },
        operator: '>',
        right: { kind: 'number', value: 0 },
      });
    } else {
      entryLongConds.push({
        id: nextId(),
        label: 'MACD crosses above Signal',
        left: { kind: 'indicator', indicator: 'macd_line', fast: 12, slow: 26, signal: 9 },
        operator: 'crosses_above',
        right: { kind: 'indicator', indicator: 'macd_signal', fast: 12, slow: 26, signal: 9 },
      });
      exitLongConds.push({
        id: nextId(),
        label: 'MACD crosses below Signal',
        left: { kind: 'indicator', indicator: 'macd_line', fast: 12, slow: 26, signal: 9 },
        operator: 'crosses_below',
        right: { kind: 'indicator', indicator: 'macd_signal', fast: 12, slow: 26, signal: 9 },
      });
    }
  }

  // Bollinger Bands
  if (/\b(bollinger|\bbb\b)\b/i.test(lower)) {
    if (/upper|breakout|above/i.test(lower)) {
      entryLongConds.push({
        id: nextId(),
        label: 'Close crosses above BB Upper(20,2)',
        left: { kind: 'price', field: 'close' },
        operator: 'crosses_above',
        right: { kind: 'indicator', indicator: 'bb_upper', period: 20, stdDev: 2 },
      });
    } else {
      entryLongConds.push({
        id: nextId(),
        label: 'Close < BB Lower(20,2)',
        left: { kind: 'price', field: 'close' },
        operator: '<',
        right: { kind: 'indicator', indicator: 'bb_lower', period: 20, stdDev: 2 },
      });
      exitLongConds.push({
        id: nextId(),
        label: 'Close >= BB Middle(20)',
        left: { kind: 'price', field: 'close' },
        operator: '>=',
        right: { kind: 'indicator', indicator: 'bb_middle', period: 20 },
      });
    }
  }

  // VWAP
  if (/\bvwap\b/i.test(lower)) {
    const below = /\b(below|under|<)\s*vwap\b/i.test(lower);
    entryLongConds.push({
      id: nextId(),
      label: `Close ${below ? '<' : '>'} VWAP`,
      left: { kind: 'price', field: 'close' },
      operator: below ? '<' : '>',
      right: { kind: 'indicator', indicator: 'vwap' },
    });
  }

  // ADX Trend Strength: e.g. "ADX > 25" or "ADX(14) >= 20"
  const adxMatch = lower.match(/\badx(?:\s*\(?\s*(\d{1,2})\s*\)?)?\s*(>|>=|<|<=|above|below)\s*(\d{1,2}(?:\.\d+)?)/i);
  if (adxMatch) {
    const p = adxMatch[1] ? Math.max(2, Number(adxMatch[1])) : 14;
    const opWord = adxMatch[2].toLowerCase();
    const op: RuleOperator = opWord === '<' || opWord === 'below' ? '<' : opWord === '<=' ? '<=' : opWord === '>=' ? '>=' : '>';
    const val = Number(adxMatch[3]);
    entryLongConds.push({
      id: nextId(),
      label: `ADX(${p}) ${op} ${val}`,
      left: { kind: 'indicator', indicator: 'adx', period: p },
      operator: op,
      right: { kind: 'number', value: val },
    });
  }

  // Supertrend: e.g. "supertrend bullish" / "above supertrend"
  if (/\bsupertrend\b/i.test(lower)) {
    const bearish = /\bsupertrend\s+bearish\b|\bbelow\s+supertrend\b/i.test(lower);
    entryLongConds.push({
      id: nextId(),
      label: bearish ? 'Supertrend Bearish (-1)' : 'Supertrend Bullish (+1)',
      left: { kind: 'indicator', indicator: 'supertrend_dir', period: 10, multiplier: 3 },
      operator: '==',
      right: { kind: 'number', value: bearish ? -1 : 1 },
    });
    exitLongConds.push({
      id: nextId(),
      label: bearish ? 'Supertrend Flips Bullish (+1)' : 'Supertrend Flips Bearish (-1)',
      left: { kind: 'indicator', indicator: 'supertrend_dir', period: 10, multiplier: 3 },
      operator: '==',
      right: { kind: 'number', value: bearish ? 1 : -1 },
    });
  }

  // Stochastic Oscillator: e.g. "stochastic < 20" / "stoch > 80"
  const stochMatch = lower.match(/\bstoch(?:astic)?\s*(>|>=|<|<=|below|above)\s*(\d{1,2}(?:\.\d+)?)/i);
  if (stochMatch) {
    const opWord = stochMatch[1].toLowerCase();
    const op: RuleOperator = opWord === '<' || opWord === 'below' ? '<' : opWord === '<=' ? '<=' : opWord === '>=' ? '>=' : '>';
    const val = Number(stochMatch[2]);
    entryLongConds.push({
      id: nextId(),
      label: `StochK(14) ${op} ${val}`,
      left: { kind: 'indicator', indicator: 'stoch_k', period: 14 },
      operator: op,
      right: { kind: 'number', value: val },
    });
  }

  // Volume Ratio / Spike: e.g. "volume > 1.5x" or "volume spike"
  const volMultMatch = lower.match(/\bvolume\s*(?:>|>=|above|over|is)?\s*(\d+(?:\.\d+)?)\s*x\b/i);
  if (volMultMatch || /\bvolume\s+spike\b/i.test(lower)) {
    const mult = volMultMatch ? Math.max(1.05, Number(volMultMatch[1])) : 1.5;
    entryLongConds.push({
      id: nextId(),
      label: `VolRatio(20) >= ${mult}x`,
      left: { kind: 'indicator', indicator: 'volume_ratio', period: 20 },
      operator: '>=',
      right: { kind: 'number', value: mult },
    });
  }

  // Candlestick Patterns
  if (/\bbullish\s+engulfing\b/i.test(lower)) {
    entryLongConds.push({
      id: nextId(),
      label: 'Bullish Engulfing Candle',
      left: { kind: 'pattern', pattern: 'bullish_engulfing' },
      operator: '==',
      right: { kind: 'number', value: 1 },
    });
  }
  if (/\bbearish\s+engulfing\b/i.test(lower)) {
    exitLongConds.push({
      id: nextId(),
      label: 'Bearish Engulfing Candle',
      left: { kind: 'pattern', pattern: 'bearish_engulfing' },
      operator: '==',
      right: { kind: 'number', value: 1 },
    });
  }
  if (/\bhammer\b/i.test(lower)) {
    entryLongConds.push({
      id: nextId(),
      label: 'Hammer Reversal Candle',
      left: { kind: 'pattern', pattern: 'hammer' },
      operator: '==',
      right: { kind: 'number', value: 1 },
    });
  }
  if (/\binside\s+bar\b/i.test(lower)) {
    entryLongConds.push({
      id: nextId(),
      label: 'Inside Bar Compression',
      left: { kind: 'pattern', pattern: 'inside_bar' },
      operator: '==',
      right: { kind: 'number', value: 1 },
    });
  }

  // Donchian / N-bar High Breakout
  const brkMatch = lower.match(/\b(\d{1,3})\s*[- ]?(?:bar|day|period)\s+high\b|\bbreakout\b/i);
  if (brkMatch && entryLongConds.length === 0) {
    const p = brkMatch[1] ? Math.max(5, Number(brkMatch[1])) : 20;
    entryLongConds.push({
      id: nextId(),
      label: `Close > HighestHigh(${p})`,
      left: { kind: 'price', field: 'close' },
      operator: '>',
      right: { kind: 'indicator', indicator: 'highest_high', period: p },
    });
    exitLongConds.push({
      id: nextId(),
      label: `Close < LowestLow(${Math.max(5, Math.floor(p / 2))})`,
      left: { kind: 'price', field: 'close' },
      operator: '<',
      right: { kind: 'indicator', indicator: 'lowest_low', period: Math.max(5, Math.floor(p / 2)) },
    });
  }

  // Ambiguous phrase fallback -> still yields a strict quantitative baseline only if no critical flaw was requested
  const looksEmpty = entryLongConds.length === 0 && entryShortConds.length === 0;
  if (looksEmpty && /\b(bullish|momentum|trend|buy|dip)\b/i.test(lower)) {
    entryLongConds.push(
      {
        id: nextId(),
        label: 'EMA(9) > EMA(21)',
        left: { kind: 'indicator', indicator: 'ema', period: 9 },
        operator: '>',
        right: { kind: 'indicator', indicator: 'ema', period: 21 },
      },
      {
        id: nextId(),
        label: 'RSI(14) > 50',
        left: { kind: 'indicator', indicator: 'rsi', period: 14 },
        operator: '>',
        right: { kind: 'number', value: 50 },
      },
    );
  }

  // Risk & execution parameters extraction (including ATR stops, Breakeven, Session, Cooldown)
  const slMatch =
    lower.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:stop\s*-?\s*loss|sl\b)/i) ??
    lower.match(/(?:stop\s*-?\s*loss|sl)\s*(?:of|at|:|=)?\s*(\d+(?:\.\d+)?)\s*%?/i);
  const tpMatch =
    lower.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:take\s*-?\s*profit|tp\b|target)/i) ??
    lower.match(/(?:take\s*-?\s*profit|tp|target)\s*(?:of|at|:|=)?\s*(\d+(?:\.\d+)?)\s*%?/i);
  const slAtrMatch = lower.match(/(\d+(?:\.\d+)?)\s*x?\s*atr\s*(?:stop|sl)/i);
  const tpAtrMatch = lower.match(/(\d+(?:\.\d+)?)\s*x?\s*atr\s*(?:take\s*-?\s*profit|tp|target)/i);
  const beMatch = lower.match(/breakeven\s*(?:at|after)?\s*(\d+(?:\.\d+)?)\s*r\b/i);
  const cooldownMatch = lower.match(/cooldown\s*(?:of)?\s*(\d{1,2})\s*bars?/i);
  const allowedHoursUtc: [number, number] | undefined = /\b(ny|new\s+york)\s+session\b/i.test(lower)
    ? [13, 20]
    : /\blondon\s+session\b/i.test(lower)
      ? [7, 16]
      : /\basia\s+session\b/i.test(lower)
        ? [0, 8]
        : undefined;
  const trailMatch = lower.match(/trailing\s+stop\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s*%/i);
  const riskMatch = lower.match(/(\d+(?:\.\d+)?)\s*%\s*risk\s*(?:per\s*trade)?/i);
  const dailyLossMatch = lower.match(/max\s*daily\s*loss\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s*%/i);

  const stopLossPct = slMatch ? Math.max(0.1, Number(slMatch[1])) : 2.0;
  const takeProfitPct = tpMatch ? Math.max(0.1, Number(tpMatch[1])) : 4.0;
  const trailingStopPct = trailMatch ? Math.max(0.2, Number(trailMatch[1])) : undefined;
  const riskPerTradePct = riskMatch ? Math.max(0.25, Number(riskMatch[1])) : 1.5;
  const maxDailyLossPct = dailyLossMatch ? Math.max(0.5, Number(dailyLossMatch[1])) : 3.0;

  const allowShort = /\b(short|both\s+directions|long\s+and\s+short)\b/i.test(lower);
  const direction: StrategyRuleSpec['direction'] =
    allowShort && entryShortConds.length > 0 ? 'both' : 'long';

  return {
    id: `strat-${Date.now().toString(36)}`,
    name: `${symbol} AI Compiled Strategy`,
    summary: description.trim().slice(0, 180),
    symbol: symbol.trim().toUpperCase(),
    timeframe,
    direction,
    entryLong: { combinator: 'AND', conditions: entryLongConds },
    exitLong: exitLongConds.length > 0 ? { combinator: 'AND', conditions: exitLongConds } : undefined,
    entryShort: allowShort ? { combinator: 'AND', conditions: entryShortConds } : undefined,
    exitShort: allowShort && exitShortConds.length > 0 ? { combinator: 'AND', conditions: exitShortConds } : undefined,
    risk: {
      stopLossPct,
      takeProfitPct,
      trailingStopPct,
      ...(slAtrMatch ? { stopLossAtrMult: Math.max(0.5, Number(slAtrMatch[1])) } : {}),
      ...(tpAtrMatch ? { takeProfitAtrMult: Math.max(0.5, Number(tpAtrMatch[1])) } : {}),
      ...(beMatch ? { breakevenTriggerR: Math.max(0.3, Number(beMatch[1])) } : {}),
      ...(cooldownMatch ? { cooldownBarsAfterLoss: Math.max(1, Number(cooldownMatch[1])) } : {}),
      ...(allowedHoursUtc ? { allowedHoursUtc } : {}),
      riskPerTradePct,
      maxDailyLossPct,
      maxPositionPct: 25,
      pyramiding: 0,
    },
    execution: {
      initialCapital: 100_000,
      commissionPct: 0.05,
      slippageBps: 5,
      orderSizeType: 'percent_of_equity',
      orderSizeValue: 25,
      processOnClose: false,
      allowShort,
    },
    strictRulesNote:
      'STRICT COMPILER: Zero future-bar lookahead; fills on bar[i+1] open with slippage & commissions; SL evaluated conservatively before TP.',
  };
}

/** Renders the human-readable editable Master Prompt sent to the user for approval before backtesting. */
export function renderMasterPrompt(
  spec: StrategyRuleSpec,
  originalDescription: string,
  issues: StrategyAuditIssue[],
): string {
  const auditSummary =
    issues.length === 0
      ? '- ALL STRICT CHECKS PASSED (Zero lookahead, explicit risk brackets, unambiguous thresholds).'
      : issues.map((i) => `- [${i.severity.toUpperCase()} · ${i.code}] ${i.explanation}`).join('\n');

  return [
    `# MASTER STRATEGY PROMPT — ${spec.symbol} (${spec.timeframe})`,
    ``,
    `## 1. User Intent`,
    originalDescription.trim(),
    ``,
    `## 2. Compiled Strict Entry Rules (${spec.direction.toUpperCase()})`,
    `Long Entry (${spec.entryLong?.combinator ?? 'AND'}):`,
    `   ${formatRuleGroup(spec.entryLong)}`,
    ...(spec.entryShort && spec.entryShort.conditions.length > 0
      ? [`Short Entry (${spec.entryShort.combinator}):`, `   ${formatRuleGroup(spec.entryShort)}`]
      : []),
    ``,
    `## 3. Compiled Exit Rules`,
    `Long Exit Signal:`,
    `   ${formatRuleGroup(spec.exitLong)}`,
    ``,
    `## 4. Mandatory Risk & Paper-Trading Guardrails`,
    `- Stop-Loss: ${spec.risk.stopLossPct}% | Take-Profit: ${spec.risk.takeProfitPct}%${spec.risk.trailingStopPct ? ` | Trailing Stop: ${spec.risk.trailingStopPct}%` : ''}`,
    `- Risk per Trade: ${spec.risk.riskPerTradePct}% | Max Position Size: ${spec.risk.maxPositionPct}% | Max Daily Loss Breaker: ${spec.risk.maxDailyLossPct}%`,
    `- Initial Capital: $${spec.execution.initialCapital.toLocaleString()} | Commission: ${spec.execution.commissionPct}% | Slippage: ${spec.execution.slippageBps} bps`,
    ``,
    `## 5. Strict Anti-Lookahead & Audit Findings`,
    auditSummary,
    ``,
    `## 6. Confirmation Required`,
    `Is this Master Prompt & Rule Specification fine to compile and backtest on ${spec.symbol} (${spec.timeframe})? Edit any parameter or approve to execute.`,
  ].join('\n');
}

function tryExtractJsonBlock(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/(\{[\s\S]*\})/);
  if (!fenced) return null;
  try {
    const parsed = JSON.parse(fenced[1] ?? fenced[0]) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isValidConditionArray(arr: unknown): arr is RuleCondition[] {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.every((c) => {
    if (!c || typeof c !== 'object') return false;
    const obj = c as Record<string, unknown>;
    return (
      typeof obj.id === 'string' &&
      typeof obj.label === 'string' &&
      typeof obj.operator === 'string' &&
      obj.left !== undefined &&
      obj.right !== undefined
    );
  });
}

function mergeAiSpecRefinement(
  base: StrategyRuleSpec,
  aiObj: Record<string, unknown>,
): StrategyRuleSpec {
  const next = { ...base };
  if (typeof aiObj.name === 'string' && aiObj.name.trim()) {
    next.name = aiObj.name.trim().slice(0, 80);
  }
  if (typeof aiObj.summary === 'string' && aiObj.summary.trim()) {
    next.summary = aiObj.summary.trim().slice(0, 240);
  }
  const el = aiObj.entryLong as Record<string, unknown> | undefined;
  if (el && isValidConditionArray(el.conditions)) {
    next.entryLong = {
      combinator: el.combinator === 'OR' ? 'OR' : 'AND',
      conditions: el.conditions,
    };
  }
  const xl = aiObj.exitLong as Record<string, unknown> | undefined;
  if (xl && isValidConditionArray(xl.conditions)) {
    next.exitLong = {
      combinator: xl.combinator === 'OR' ? 'OR' : 'AND',
      conditions: xl.conditions,
    };
  }
  const risk = aiObj.risk as Record<string, unknown> | undefined;
  if (risk && typeof risk === 'object') {
    if (typeof risk.stopLossPct === 'number' && risk.stopLossPct > 0 && risk.stopLossPct <= 50) {
      next.risk = { ...next.risk, stopLossPct: risk.stopLossPct };
    }
    if (typeof risk.takeProfitPct === 'number' && risk.takeProfitPct > 0 && risk.takeProfitPct <= 200) {
      next.risk = { ...next.risk, takeProfitPct: risk.takeProfitPct };
    }
  }
  return next;
}

/**
 * Step 1 of Strategy Copilot: converts plain-English words into a Master Prompt
 * + strict rule spec + audit report using OpenCode / Gemini / deterministic compiler.
 */
export async function generateMasterPromptDraft(
  req: MasterPromptRequest,
): Promise<MasterPromptResponse> {
  const symbol = req.symbol.trim().toUpperCase() || 'AAPL';
  const timeframe = req.timeframe || '1D';
  let compiledSpec = parseNaturalLanguageToRuleSpec(req.description, symbol, timeframe);
  let providerUsed: StrategyAIProvider = 'deterministic';
  let modelLabel: string | undefined;
  let aiNote: string | undefined;

  if (
    req.provider === 'opencode' ||
    req.provider === 'gemini' ||
    req.provider === 'deepseek' ||
    req.provider === 'byok'
  ) {
    const compilerPrompt = [
      'You are a strict Quantitative Strategy Compiler & Auditor.',
      'Convert the user strategy description into a strict JSON object with optional fields:',
      '{ "name": string, "summary": string, "entryLong": { "combinator": "AND"|"OR", "conditions": [...] }, "exitLong": { "combinator": "AND"|"OR", "conditions": [...] }, "risk": { "stopLossPct": number, "takeProfitPct": number }, "critique": string }',
      'Rules: NEVER use future bars or lookahead bias. Always use numeric thresholds.',
      `Current deterministic baseline spec: ${JSON.stringify(compiledSpec)}`,
      `User Strategy Description: "${req.description.trim()}"`,
      'Reply with a ```json ... ``` block.',
    ].join('\n');

    const { deepseek, opencode, byok, gemini } = getRawConnectionsConfig();
    if (req.provider === 'deepseek' || req.provider === 'byok') {
      const cfg = req.provider === 'byok' ? byok : deepseek;
      const res = await invokeOpenAICompat(req.provider, cfg, {
        provider: req.provider,
        prompt: compilerPrompt,
        chartContext: { symbol, timeframe },
      });
      if (res.body.ok && res.body.text) {
        providerUsed = req.provider;
        modelLabel = res.body.modelLabel;
        const parsed = tryExtractJsonBlock(res.body.text);
        if (parsed) {
          compiledSpec = mergeAiSpecRefinement(compiledSpec, parsed);
          if (typeof parsed.critique === 'string' && parsed.critique.trim()) {
            aiNote = parsed.critique.trim();
          }
        }
      } else {
        aiNote = `${req.provider === 'deepseek' ? 'DeepSeek' : 'BYOK'} refinement skipped (${res.body.message || 'not configured'}); strict deterministic compiler used.`;
      }
    } else if (req.provider === 'opencode') {
      const res = await invokeOpenCode(opencode, {
        prompt: compilerPrompt,
        chartContext: { symbol, timeframe },
        model: req.model,
      });
      if (res.body.ok && res.body.messageText) {
        providerUsed = 'opencode';
        modelLabel = res.body.rawModel;
        const parsed = tryExtractJsonBlock(res.body.messageText);
        if (parsed) {
          compiledSpec = mergeAiSpecRefinement(compiledSpec, parsed);
          if (typeof parsed.critique === 'string' && parsed.critique.trim()) {
            aiNote = parsed.critique.trim();
          }
        }
      } else {
        aiNote = `OpenCode refinement skipped (${res.body.message || 'offline'}); strict deterministic compiler used.`;
      }
    } else if (req.provider === 'gemini') {
      const res = await invokeGemini(gemini, {
        prompt: compilerPrompt,
        chartContext: { symbol, timeframe },
        workflow: 'custom',
      });
      if (res.body.ok && res.body.text) {
        providerUsed = 'gemini';
        modelLabel = gemini.model;
        const parsed = tryExtractJsonBlock(res.body.text);
        if (parsed) {
          compiledSpec = mergeAiSpecRefinement(compiledSpec, parsed);
          if (typeof parsed.critique === 'string' && parsed.critique.trim()) {
            aiNote = parsed.critique.trim();
          }
        }
      } else {
        aiNote = `Gemini refinement skipped (${res.body.message || 'not configured'}); strict deterministic compiler used.`;
      }
    }
  }

  let effectiveDescription = req.description;
  if (req.applyStrictFixes) {
    if (compiledSpec.risk.stopLossPct <= 0) compiledSpec.risk.stopLossPct = 2.0;
    if (compiledSpec.risk.takeProfitPct <= compiledSpec.risk.stopLossPct) {
      compiledSpec.risk.takeProfitPct = Math.max(4.0, compiledSpec.risk.stopLossPct * 2);
    }
    if (!compiledSpec.entryLong || compiledSpec.entryLong.conditions.length === 0) {
      compiledSpec.entryLong = {
        combinator: 'AND',
        conditions: [
          {
            id: 'fix-ema',
            label: 'EMA(9) crosses above EMA(21)',
            left: { kind: 'indicator', indicator: 'ema', period: 9 },
            operator: 'crosses_above',
            right: { kind: 'indicator', indicator: 'ema', period: 21 },
          },
          {
            id: 'fix-rsi',
            label: 'RSI(14) < 70',
            left: { kind: 'indicator', indicator: 'rsi', period: 14 },
            operator: '<',
            right: { kind: 'number', value: 70 },
          },
        ],
      };
    }
    // Strip lookahead phrase only when user explicitly asks to enforce strict anti-lookahead rules
    effectiveDescription = effectiveDescription.replace(
      /\b(next\s+bar|tomorrow'?s|future\s+high|future\s+low|future\s+close|look\s*-?\s*ahead|peek\s+ahead|after\s+tomorrow)\b/gi,
      'confirmed closed bar[i]',
    );
  }

  const auditIssues = auditStrategyDescriptionAndSpec(effectiveDescription, compiledSpec);
  const hasCriticalIssues = auditIssues.some((i) => i.severity === 'critical');
  const masterPrompt = renderMasterPrompt(compiledSpec, effectiveDescription, auditIssues);

  const draft: MasterPromptDraft = {
    draftId: `draft-${Date.now().toString(36)}`,
    userDescription: effectiveDescription,
    masterPrompt,
    compiledSpec,
    auditIssues,
    hasCriticalIssues,
    providerUsed,
    modelLabel,
    approved: false,
    createdAt: new Date().toISOString(),
  };

  return {
    ok: true,
    draft,
    ...(aiNote ? { aiNote } : {}),
  };
}

/**
 * Reconciles manual edits made by the user directly inside the Master Prompt editor
 * back into the executable StrategyRuleSpec so user changes to SL, TP, sizing, fees,
 * or intent are ALWAYS honored during backtest and paper deployment!
 */
export function reconcileMasterPromptEditsToSpec(
  masterPromptText: string,
  baseSpec: StrategyRuleSpec,
): StrategyRuleSpec {
  if (!masterPromptText || !masterPromptText.trim()) return baseSpec;

  let next: StrategyRuleSpec = {
    ...baseSpec,
    risk: { ...baseSpec.risk },
    execution: { ...baseSpec.execution },
  };

  // Check if user edited Section 1 (User Intent) and re-parse indicator rules if modified
  const intentSection = masterPromptText.match(/## 1\. User Intent\s*\r?\n([\s\S]*?)(?:\r?\n## 2\.|$)/i);
  if (intentSection?.[1]) {
    const editedIntent = intentSection[1].trim().replace(/^"+|"+$/g, '').trim();
    const origSummary = (baseSpec.summary ?? '').trim().replace(/^"+|"+$/g, '').trim();
    if (editedIntent && editedIntent !== origSummary && !origSummary.startsWith(editedIntent) && editedIntent.length >= 6) {
      const reparsed = parseNaturalLanguageToRuleSpec(editedIntent, baseSpec.symbol, baseSpec.timeframe);
      if (reparsed.entryLong && reparsed.entryLong.conditions.length > 0) {
        next = {
          ...next,
          summary: editedIntent.slice(0, 180),
          entryLong: reparsed.entryLong,
          exitLong: reparsed.exitLong ?? next.exitLong,
          risk: {
            ...next.risk,
            ...reparsed.risk,
          },
        };
      }
    }
  }

  const sl = masterPromptText.match(/Stop-Loss:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (sl) next.risk.stopLossPct = Math.max(0.05, Number(sl[1]));

  const tp = masterPromptText.match(/Take-Profit:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (tp) next.risk.takeProfitPct = Math.max(0.05, Number(tp[1]));

  const trail = masterPromptText.match(/Trailing Stop:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (trail) next.risk.trailingStopPct = Math.max(0.1, Number(trail[1]));

  const rpt = masterPromptText.match(/Risk per Trade:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (rpt) next.risk.riskPerTradePct = Math.max(0.1, Number(rpt[1]));

  const maxPos = masterPromptText.match(/Max Position Size:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (maxPos) next.risk.maxPositionPct = Math.min(100, Math.max(1, Number(maxPos[1])));

  const mdl = masterPromptText.match(/Max Daily Loss Breaker:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (mdl) next.risk.maxDailyLossPct = Math.max(0.25, Number(mdl[1]));

  const cap = masterPromptText.match(/Initial Capital:\s*\$([\d,]+(?:\.\d+)?)/i);
  if (cap) {
    const parsedCap = Number(cap[1].replace(/,/g, ''));
    if (Number.isFinite(parsedCap) && parsedCap >= 100) {
      next.execution.initialCapital = parsedCap;
    }
  }

  const comm = masterPromptText.match(/Commission:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (comm) next.execution.commissionPct = Math.max(0, Number(comm[1]));

  const slip = masterPromptText.match(/Slippage:\s*(\d+(?:\.\d+)?)\s*bps/i);
  if (slip) next.execution.slippageBps = Math.max(0, Number(slip[1]));

  return next;
}

/**
 * Conversational + direct-edit Master Prompt refiner: reconciles user textarea edits
 * and optional natural-language follow-up instructions, then re-audits strictly.
 */
export async function refineMasterPromptDraft(
  req: StrategyRefineRequest,
): Promise<MasterPromptResponse> {
  const baseText = req.editedMasterPrompt ?? req.draft.masterPrompt;
  const followupRaw = req.userFollowup?.trim() ?? '';

  // 1. Reconcile any direct edits made in the Master Prompt textarea (Section 1 intent + Section 4 risk/capital)
  let nextSpec = reconcileMasterPromptEditsToSpec(baseText, req.draft.compiledSpec);
  const baseIntent = (nextSpec.summary || req.draft.userDescription).trim();
  const combinedIntent = followupRaw
    ? `${baseIntent}. Refinement: ${followupRaw}`
    : baseIntent;

  // 2. Apply conversational follow-up refinement on top while preserving reconciled risk/execution
  if (followupRaw) {
    const followupParsed = parseNaturalLanguageToRuleSpec(
      combinedIntent,
      nextSpec.symbol,
      nextSpec.timeframe,
    );
    const nextRisk = { ...nextSpec.risk };
    const fSl = followupRaw.match(/(?:stop[\s-]*loss|sl)\s*(?:of|at|=|:)?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (fSl) nextRisk.stopLossPct = Math.max(0.1, Number(fSl[1]));
    const fTp = followupRaw.match(/(?:take[\s-]*profit|tp|target)\s*(?:of|at|=|:)?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (fTp) nextRisk.takeProfitPct = Math.max(0.2, Number(fTp[1]));
    if (followupParsed.risk.stopLossAtrMult) nextRisk.stopLossAtrMult = followupParsed.risk.stopLossAtrMult;
    if (followupParsed.risk.takeProfitAtrMult) nextRisk.takeProfitAtrMult = followupParsed.risk.takeProfitAtrMult;

    nextSpec = {
      ...nextSpec,
      summary: combinedIntent.slice(0, 180),
      entryLong:
        followupParsed.entryLong && followupParsed.entryLong.conditions.length > 0
          ? followupParsed.entryLong
          : nextSpec.entryLong,
      exitLong: followupParsed.exitLong ?? nextSpec.exitLong,
      risk: nextRisk,
    };
  }

  let providerUsed: StrategyAIProvider = 'deterministic';
  let modelLabel: string | undefined;
  let aiNote: string | undefined;

  if (
    (req.provider === 'opencode' ||
      req.provider === 'gemini' ||
      req.provider === 'deepseek' ||
      req.provider === 'byok') &&
    req.userFollowup?.trim()
  ) {
    const { deepseek, opencode, byok, gemini } = getRawConnectionsConfig();
    const prompt = [
      'You are a Strict Quantitative Strategy Compiler.',
      `Current Spec: ${JSON.stringify(nextSpec)}`,
      `User Follow-up Instruction: "${req.userFollowup.trim()}"`,
      'Reply with a ```json ... ``` object containing updated fields (entryLong, exitLong, risk, critique). Never introduce lookahead bias.',
    ].join('\n');

    if (req.provider === 'deepseek' || req.provider === 'byok') {
      const cfg = req.provider === 'byok' ? byok : deepseek;
      const res = await invokeOpenAICompat(req.provider, cfg, {
        provider: req.provider,
        prompt,
        chartContext: { symbol: nextSpec.symbol, timeframe: nextSpec.timeframe },
      });
      if (res.body.ok && res.body.text) {
        providerUsed = req.provider;
        modelLabel = res.body.modelLabel;
        const parsed = tryExtractJsonBlock(res.body.text);
        if (parsed) {
          nextSpec = mergeAiSpecRefinement(nextSpec, parsed);
          if (typeof parsed.critique === 'string') aiNote = parsed.critique.trim();
        }
      }
    } else if (req.provider === 'opencode') {
      const res = await invokeOpenCode(opencode, {
        prompt,
        chartContext: { symbol: nextSpec.symbol, timeframe: nextSpec.timeframe },
        model: req.model,
      });
      if (res.body.ok && res.body.messageText) {
        providerUsed = 'opencode';
        modelLabel = res.body.rawModel;
        const parsed = tryExtractJsonBlock(res.body.messageText);
        if (parsed) {
          nextSpec = mergeAiSpecRefinement(nextSpec, parsed);
          if (typeof parsed.critique === 'string') aiNote = parsed.critique.trim();
        }
      }
    } else {
      const res = await invokeGemini(gemini, {
        prompt,
        chartContext: { symbol: nextSpec.symbol, timeframe: nextSpec.timeframe },
        workflow: 'custom',
      });
      if (res.body.ok && res.body.text) {
        providerUsed = 'gemini';
        modelLabel = gemini.model;
        const parsed = tryExtractJsonBlock(res.body.text);
        if (parsed) {
          nextSpec = mergeAiSpecRefinement(nextSpec, parsed);
          if (typeof parsed.critique === 'string') aiNote = parsed.critique.trim();
        }
      }
    }
  }

  const auditIssues = auditStrategyDescriptionAndSpec(combinedIntent, nextSpec);
  const hasCriticalIssues = auditIssues.some((i) => i.severity === 'critical');
  const masterPrompt = renderMasterPrompt(nextSpec, combinedIntent, auditIssues);

  return {
    ok: true,
    draft: {
      draftId: `draft-${Date.now().toString(36)}`,
      userDescription: combinedIntent,
      masterPrompt,
      compiledSpec: nextSpec,
      auditIssues,
      hasCriticalIssues,
      providerUsed,
      modelLabel,
      approved: false,
      createdAt: new Date().toISOString(),
    },
    ...(aiNote ? { aiNote } : {}),
  };
}

function formatTraceChecks(checks: ConditionEvalTrace[]): string {
  if (checks.length === 0) return '(no rules configured)';
  return checks
    .map((c) => {
      const gap =
        !c.passed && c.leftValue !== null && c.rightValue !== null
          ? ` [gap: ${(c.leftValue - c.rightValue >= 0 ? '+' : '') + (c.leftValue - c.rightValue).toFixed(4)}]`
          : '';
      return `  - [${c.passed ? 'PASS' : 'FAIL'}] ${c.label}: left=${c.leftValue ?? 'warmup'} ${c.operator} right=${c.rightValue ?? 'warmup'}${gap}`;
    })
    .join('\n');
}

/**
 * Strict "Why?" Rule Interrogator: grounds every AI explanation on the exact
 * deterministic bar-by-bar boolean evaluation trace so users can question any
 * entry, exit, missed trade, or strategy logic flaw.
 */
export async function explainStrategyDecision(
  req: StrategyExplainRequest,
  bars: OHLCVBar[],
): Promise<StrategyExplainResponse> {
  const report =
    req.report && req.report.barCount > 0
      ? req.report
      : bars.length >= 3
        ? runStrategyBacktest(bars, req.spec)
        : undefined;

  let inspectedTrade: BacktestTrade | undefined;
  if (req.tradeNumber !== undefined && report) {
    inspectedTrade = report.trades.find((t) => t.tradeNumber === req.tradeNumber);
  }

  let groundTruthTrace: BarDecisionTrace | undefined;
  if (bars.length > 0) {
    let targetIdx = bars.length - 1;
    if (inspectedTrade) {
      targetIdx = Math.max(0, Math.min(bars.length - 1, inspectedTrade.entryBarIndex));
    } else if (req.barIndex !== undefined) {
      targetIdx = Math.max(0, Math.min(bars.length - 1, req.barIndex));
    } else if (req.barTime !== undefined) {
      const idx = bars.findIndex((b) => b.time >= req.barTime!);
      if (idx >= 0) targetIdx = idx;
    }
    groundTruthTrace = evaluateBarDecision(bars, req.spec, targetIdx);
  } else if (report?.recentTraces.length) {
    groundTruthTrace = report.recentTraces[report.recentTraces.length - 1];
  }

  const factLines: string[] = [
    `Strategy: ${req.spec.name} | Symbol: ${req.spec.symbol} (${req.spec.timeframe})`,
    `Risk Rules: SL=${req.spec.risk.stopLossPct}%, TP=${req.spec.risk.takeProfitPct}%, Risk/Trade=${req.spec.risk.riskPerTradePct}%, MaxDailyLoss=${req.spec.risk.maxDailyLossPct}%`,
  ];

  if (report) {
    factLines.push(
      `Backtest Summary: Trades=${report.all.totalTrades}, WinRate=${report.all.percentProfitable}%, NetProfit=$${report.all.netProfit} (${report.all.netProfitPercent}%), ProfitFactor=${report.all.profitFactor}, MaxDD=${report.maxDrawdownPercent}%, Sharpe=${report.sharpeRatio}, OutperformanceVsB&H=${report.strategyOutperformancePercent}%`,
    );
    if (report.scorecard) {
      factLines.push(
        `Quant Scorecard: Grade ${report.scorecard.grade} (${report.scorecard.score}/100), tStat=${report.scorecard.tStat}, p=${report.scorecard.pValue}`,
      );
    }
    if (report.walkForward) {
      factLines.push(
        `Walk-Forward (70/30 OOS): Verdict=${report.walkForward.verdict}, IS=${report.walkForward.inSampleReturnPct}% vs OOS=${report.walkForward.outOfSampleReturnPct}%`,
      );
    }
    if (report.monteCarlo) {
      factLines.push(
        `Monte Carlo (${report.monteCarlo.iterations} paths): P5=${report.monteCarlo.p5ReturnPct}%, Median=${report.monteCarlo.medianReturnPct}%, P95 MaxDD=-${report.monteCarlo.p95MaxDrawdownPct}%, RuinProb=${report.monteCarlo.ruinProbabilityPct}%`,
      );
    }
  }

  if (inspectedTrade) {
    factLines.push(
      `Inspected Trade #${inspectedTrade.tradeNumber} (${inspectedTrade.side.toUpperCase()}):`,
      `  Entry: bar #${inspectedTrade.entryBarIndex} @ $${inspectedTrade.entryPrice} (${new Date(inspectedTrade.entryTime * 1000).toISOString()})`,
      `  Exit (${inspectedTrade.exitReason}): bar #${inspectedTrade.exitBarIndex} @ $${inspectedTrade.exitPrice}`,
      `  Net P&L: $${inspectedTrade.netProfit} (${inspectedTrade.netProfitPercent}%), Commission=$${inspectedTrade.commission}, MFE=${inspectedTrade.maxFavorableExcursionPct}%, MAE=${inspectedTrade.maxAdverseExcursionPct}%`,
      `  Entry Conditions Snapshot:`,
      formatTraceChecks(inspectedTrade.entryTrace),
    );
    if (inspectedTrade.exitTrace.length > 0) {
      factLines.push(`  Exit Conditions Snapshot:`, formatTraceChecks(inspectedTrade.exitTrace));
    }
  } else if (groundTruthTrace) {
    factLines.push(
      `Bar #${groundTruthTrace.barIndex} (${new Date(groundTruthTrace.time * 1000).toISOString()}) O=${groundTruthTrace.open} H=${groundTruthTrace.high} L=${groundTruthTrace.low} C=${groundTruthTrace.close}:`,
      `  Decision: ${groundTruthTrace.actionTaken} — ${groundTruthTrace.reason}`,
      `  Long Entry Checks:`,
      formatTraceChecks(groundTruthTrace.entryLongChecks),
      `  Long Exit Checks:`,
      formatTraceChecks(groundTruthTrace.exitLongChecks),
    );
  }

  const factSheet = factLines.join('\n');
  const strictPrompt = [
    'You are a Strict Quantitative Trading Rule Auditor.',
    'The user is questioning WHY the strategy behaved this way or critiquing its logic.',
    'Answer strictly using the Ground-Truth Evaluation Trace below. Cite exact PASS/FAIL conditions and numeric indicator values. Be brutally honest about overfitting, stop-loss placement, win-rate vs R:R math, and missing filters.',
    '',
    '=== GROUND-TRUTH TRACE ===',
    factSheet,
    '',
    `User Question: ${req.question.trim()}`,
  ].join('\n');

  let providerUsed: StrategyAIProvider = 'deterministic';
  let modelLabel: string | undefined;
  let aiAnswer = '';

  const { deepseek, opencode, byok, gemini } = getRawConnectionsConfig();
  if (req.provider === 'deepseek' || req.provider === 'byok') {
    const cfg = req.provider === 'byok' ? byok : deepseek;
    const res = await invokeOpenAICompat(req.provider, cfg, {
      provider: req.provider,
      prompt: strictPrompt,
      chartContext: { symbol: req.spec.symbol, timeframe: req.spec.timeframe },
    });
    if (res.body.ok && res.body.text) {
      providerUsed = req.provider;
      modelLabel = res.body.modelLabel;
      aiAnswer = res.body.text;
    }
  } else if (req.provider === 'opencode') {
    const res = await invokeOpenCode(opencode, {
      prompt: strictPrompt,
      chartContext: { symbol: req.spec.symbol, timeframe: req.spec.timeframe },
      model: req.model,
    });
    if (res.body.ok && res.body.messageText) {
      providerUsed = 'opencode';
      modelLabel = res.body.rawModel;
      aiAnswer = res.body.messageText;
    }
  } else if (req.provider === 'gemini') {
    const res = await invokeGemini(gemini, {
      prompt: strictPrompt,
      chartContext: { symbol: req.spec.symbol, timeframe: req.spec.timeframe },
      workflow: 'custom',
    });
    if (res.body.ok && res.body.text) {
      providerUsed = 'gemini';
      modelLabel = gemini.model;
      aiAnswer = res.body.text;
    }
  }

  if (!aiAnswer) {
    const verdict =
      report && report.all.totalTrades < 10
        ? `STRICT SAMPLE-SIZE WARNING: Only ${report.all.totalTrades} trades executed (< 30 minimum for statistical significance).`
        : report && report.all.profitFactor < 1.2
          ? `STRICT EDGE WARNING: Profit Factor (${report.all.profitFactor}) is thin relative to transaction costs & slippage.`
          : 'Rule logic strictly adhered to your approved quantitative conditions without lookahead.';
    aiAnswer = `${factSheet}\n\n### Strict Audit Verdict\n${verdict}`;
  }

  return {
    ok: true,
    answer: aiAnswer,
    providerUsed,
    modelLabel,
    groundTruthTrace,
    inspectedTrade,
  };
}
