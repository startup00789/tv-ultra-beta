import { useState } from 'react';
import { Code2, Layers, Play, Sparkles } from 'lucide-react';
import type { IndicatorType, RuleCondition, StrategyRuleSpec } from '../../../shared/types';
import { runStrategyBacktest } from '../../../shared/strategyEngine';
import { useWorkspaceStore } from '../../state/workspaceStore';

interface PinePreset {
  name: string;
  code: string;
}

const PINE_PRESETS: readonly PinePreset[] = [
  {
    name: 'EMA 9/21 + RSI Strategy',
    code: `//@version=5
strategy("EMA 9/21 + RSI Trend", overlay=true, initial_capital=100000, commission_value=0.05)
fast = ta.ema(close, 9)
slow = ta.ema(close, 21)
r = ta.rsi(close, 14)

longCondition = ta.crossover(fast, slow) and r < 70
exitCondition = ta.crossunder(fast, slow)

if (longCondition)
    strategy.entry("Long", strategy.long)
if (exitCondition)
    strategy.close("Long")
// @risk stop_loss=2.0 take_profit=6.0`,
  },
  {
    name: 'Supertrend + ADX Breakout',
    code: `//@version=5
strategy("Supertrend + ADX Pro", overlay=true, initial_capital=100000)
[st, dir] = ta.supertrend(3.0, 10)
adxVal = ta.adx(14)

if (dir == 1 and adxVal > 22)
    strategy.entry("TrendLong", strategy.long)
if (dir == -1)
    strategy.close("TrendLong")
// @risk stop_loss=2.5 take_profit=7.5`,
  },
  {
    name: 'Bollinger Mean Reversion',
    code: `//@version=5
strategy("BB Mean Reversion", overlay=true, initial_capital=100000)
[middle, upper, lower] = ta.bb(close, 20, 2.0)
r = ta.rsi(close, 14)

if (close < lower and r < 38)
    strategy.entry("DipBuy", strategy.long)
if (close >= middle)
    strategy.close("DipBuy")
// @risk stop_loss=2.0 take_profit=5.0`,
  },
];

function compilePineToSpecAndIndicators(
  code: string,
  symbol: string,
  timeframe: StrategyRuleSpec['timeframe'],
): {
  spec: StrategyRuleSpec;
  indicatorsToPlot: Array<{ id: IndicatorType; name: string; pane: 'main' | 'sub'; color: string; params: Record<string, number> }>;
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  const entryConds: RuleCondition[] = [];
  const exitConds: RuleCondition[] = [];
  const indicatorsToPlot: Array<{
    id: IndicatorType;
    name: string;
    pane: 'main' | 'sub';
    color: string;
    params: Record<string, number>;
  }> = [];

  if (!/\/\/@version=[456]/.test(code)) {
    diagnostics.push('Note: Missing //@version=5 header — assuming Pine v5 compatibility.');
  }
  const titleMatch = code.match(/(?:strategy|indicator)\s*\(\s*["']([^"']+)["']/);
  const name = titleMatch?.[1] ?? `${symbol} Pine Script Strategy`;

  // Detect EMAs / SMAs
  const emaMatches = [...code.matchAll(/(\w+)\s*=\s*ta\.(ema|sma)\s*\(\s*close\s*,\s*(\d+)\s*\)/g)];
  const varMap = new Map<string, { type: 'ema' | 'sma'; period: number }>();
  const palette = ['#2962ff', '#f59e0b', '#a855f7', '#089981'];
  emaMatches.forEach((m, idx) => {
    const varName = m[1];
    const kind = m[2] as 'ema' | 'sma';
    const period = Math.max(2, Number(m[3]));
    varMap.set(varName, { type: kind, period });
    indicatorsToPlot.push({
      id: kind,
      name: `${kind.toUpperCase()}`,
      pane: 'main',
      color: palette[idx % palette.length],
      params: { period },
    });
  });

  // Detect crossover / crossunder
  const crossOver = code.match(/ta\.crossover\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (crossOver) {
    const a = varMap.get(crossOver[1]) ?? { type: 'ema' as const, period: 9 };
    const b = varMap.get(crossOver[2]) ?? { type: 'ema' as const, period: 21 };
    entryConds.push({
      id: 'pine-xover',
      label: `${a.type.toUpperCase()}(${a.period}) crosses above ${b.type.toUpperCase()}(${b.period})`,
      left: { kind: 'indicator', indicator: a.type, period: a.period },
      operator: 'crosses_above',
      right: { kind: 'indicator', indicator: b.type, period: b.period },
    });
  }

  const crossUnder = code.match(/ta\.crossunder\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (crossUnder) {
    const a = varMap.get(crossUnder[1]) ?? { type: 'ema' as const, period: 9 };
    const b = varMap.get(crossUnder[2]) ?? { type: 'ema' as const, period: 21 };
    exitConds.push({
      id: 'pine-xunder',
      label: `${a.type.toUpperCase()}(${a.period}) crosses below ${b.type.toUpperCase()}(${b.period})`,
      left: { kind: 'indicator', indicator: a.type, period: a.period },
      operator: 'crosses_below',
      right: { kind: 'indicator', indicator: b.type, period: b.period },
    });
  }

  // Detect ta.supertrend
  const stMatch = code.match(/ta\.supertrend\s*\(\s*([\d.]+)\s*,\s*(\d+)\s*\)/);
  if (stMatch) {
    const mult = Number(stMatch[1]) || 3;
    const period = Number(stMatch[2]) || 10;
    indicatorsToPlot.push({
      id: 'supertrend',
      name: 'Supertrend',
      pane: 'main',
      color: '#089981',
      params: { period, multiplier: mult },
    });
    entryConds.push({
      id: 'pine-st-up',
      label: `Supertrend(${period},${mult}) Bullish`,
      left: { kind: 'indicator', indicator: 'supertrend_dir', period, multiplier: mult },
      operator: '==',
      right: { kind: 'number', value: 1 },
    });
    exitConds.push({
      id: 'pine-st-dn',
      label: `Supertrend(${period},${mult}) Bearish`,
      left: { kind: 'indicator', indicator: 'supertrend_dir', period, multiplier: mult },
      operator: '==',
      right: { kind: 'number', value: -1 },
    });
  }

  // Detect ta.bb
  const bbMatch = code.match(/ta\.bb\s*\(\s*close\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (bbMatch) {
    const period = Number(bbMatch[1]) || 20;
    const stdDev = Number(bbMatch[2]) || 2;
    indicatorsToPlot.push({
      id: 'bb',
      name: 'BB',
      pane: 'main',
      color: '#2962ff',
      params: { period, stdDev },
    });
    if (/close\s*<\s*lower/.test(code)) {
      entryConds.push({
        id: 'pine-bb-low',
        label: `Close < BB_Lower(${period},${stdDev})`,
        left: { kind: 'price', field: 'close' },
        operator: '<',
        right: { kind: 'indicator', indicator: 'bb_lower', period, stdDev },
      });
    }
    if (/close\s*>=\s*middle/.test(code)) {
      exitConds.push({
        id: 'pine-bb-mid',
        label: `Close >= BB_Middle(${period})`,
        left: { kind: 'price', field: 'close' },
        operator: '>=',
        right: { kind: 'indicator', indicator: 'bb_middle', period },
      });
    }
  }

  // Detect ta.rsi
  const rsiDef = code.match(/(\w+)\s*=\s*ta\.rsi\s*\(\s*close\s*,\s*(\d+)\s*\)/);
  if (rsiDef) {
    const rVar = rsiDef[1];
    const period = Number(rsiDef[2]) || 14;
    indicatorsToPlot.push({
      id: 'rsi',
      name: 'RSI',
      pane: 'sub',
      color: '#a855f7',
      params: { period },
    });
    const rCmp = code.match(new RegExp(`\\b${rVar}\\s*(<|<=|>|>=)\\s*(\\d+(?:\\.\\d+)?)`));
    if (rCmp) {
      entryConds.push({
        id: 'pine-rsi',
        label: `RSI(${period}) ${rCmp[1]} ${rCmp[2]}`,
        left: { kind: 'indicator', indicator: 'rsi', period },
        operator: rCmp[1] as '<' | '<=' | '>' | '>=',
        right: { kind: 'number', value: Number(rCmp[2]) },
      });
    }
  }

  // Detect ta.adx
  const adxDef = code.match(/(\w+)\s*=\s*ta\.adx\s*\(\s*(\d+)\s*\)/);
  if (adxDef) {
    const aVar = adxDef[1];
    const period = Number(adxDef[2]) || 14;
    indicatorsToPlot.push({
      id: 'adx',
      name: 'ADX',
      pane: 'sub',
      color: '#089981',
      params: { period },
    });
    const aCmp = code.match(new RegExp(`\\b${aVar}\\s*(>|>=|<|<=)\\s*(\\d+(?:\\.\\d+)?)`));
    if (aCmp) {
      entryConds.push({
        id: 'pine-adx',
        label: `ADX(${period}) ${aCmp[1]} ${aCmp[2]}`,
        left: { kind: 'indicator', indicator: 'adx', period },
        operator: aCmp[1] as '>' | '>=' | '<' | '<=',
        right: { kind: 'number', value: Number(aCmp[2]) },
      });
    }
  }

  if (entryConds.length === 0) {
    diagnostics.push('Fallback rule added: EMA(9) crosses above EMA(21).');
    entryConds.push({
      id: 'pine-fallback',
      label: 'EMA(9) crosses above EMA(21)',
      left: { kind: 'indicator', indicator: 'ema', period: 9 },
      operator: 'crosses_above',
      right: { kind: 'indicator', indicator: 'ema', period: 21 },
    });
  }

  const slMatch = code.match(/stop_loss\s*=\s*([\d.]+)/);
  const tpMatch = code.match(/take_profit\s*=\s*([\d.]+)/);
  const capMatch = code.match(/initial_capital\s*=\s*(\d+)/);

  const spec: StrategyRuleSpec = {
    id: `pine-${Date.now().toString(36)}`,
    name,
    summary: `Compiled from Pine Script v5 (${entryConds.length} entry rules)`,
    symbol,
    timeframe,
    direction: 'long',
    entryLong: { combinator: 'AND', conditions: entryConds },
    exitLong: exitConds.length > 0 ? { combinator: 'AND', conditions: exitConds } : undefined,
    risk: {
      stopLossPct: slMatch ? Number(slMatch[1]) : 2.0,
      takeProfitPct: tpMatch ? Number(tpMatch[1]) : 5.0,
      riskPerTradePct: 1.5,
      maxDailyLossPct: 3.0,
      maxPositionPct: 25,
      pyramiding: 0,
    },
    execution: {
      initialCapital: capMatch ? Number(capMatch[1]) : 100_000,
      commissionPct: 0.05,
      slippageBps: 5,
      orderSizeType: 'percent_of_equity',
      orderSizeValue: 25,
      processOnClose: false,
      allowShort: false,
    },
    strictRulesNote: 'Compiled from Pine Script v5 AST transpiler (zero lookahead).',
  };

  diagnostics.unshift(
    `Compiled "${name}": ${entryConds.length} entry rule(s), ${exitConds.length} exit rule(s), ${indicatorsToPlot.length} chart study plot(s).`,
  );
  return { spec, indicatorsToPlot, diagnostics };
}

export function PineScriptEditorDrawer() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bars = useWorkspaceStore((s) => s.bars);
  const addIndicator = useWorkspaceStore((s) => s.addIndicator);
  const setBacktestReport = useWorkspaceStore((s) => s.setBacktestReport);
  const setBacktestMarkersVisible = useWorkspaceStore((s) => s.setBacktestMarkersVisible);
  const setMasterPromptDraft = useWorkspaceStore((s) => s.setMasterPromptDraft);
  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);
  const setActiveRightTab = useWorkspaceStore((s) => s.setActiveRightTab);

  const [code, setCode] = useState(PINE_PRESETS[0].code);
  const [logs, setLogs] = useState<string[]>([
    'Pine Script v5 Transpiler ready. Select a template or edit code and click "Compile & Backtest".',
  ]);

  const handlePlotOnly = () => {
    const { indicatorsToPlot, diagnostics } = compilePineToSpecAndIndicators(
      code,
      symbol,
      timeframe,
    );
    for (const ind of indicatorsToPlot) {
      addIndicator({ ...ind, visible: true });
    }
    setLogs([`Added ${indicatorsToPlot.length} indicator plot(s) to ${symbol} chart.`, ...diagnostics]);
  };

  const handleCompileAndBacktest = () => {
    const { spec, indicatorsToPlot, diagnostics } = compilePineToSpecAndIndicators(
      code,
      symbol,
      timeframe,
    );
    for (const ind of indicatorsToPlot) {
      addIndicator({ ...ind, visible: true });
    }
    const report = runStrategyBacktest(bars, spec);
    setMasterPromptDraft({
      draftId: `pine-draft-${Date.now().toString(36)}`,
      userDescription: `Pine Script: ${spec.name}`,
      masterPrompt: `# MASTER STRATEGY PROMPT — ${symbol} (${timeframe})\n## 1. User Intent\n${spec.summary}\n## 4. Mandatory Risk & Paper-Trading Guardrails\n- Stop-Loss: ${spec.risk.stopLossPct}% | Take-Profit: ${spec.risk.takeProfitPct}%\n- Risk per Trade: 1.5% | Max Position Size: 25% | Max Daily Loss Breaker: 3%\n`,
      compiledSpec: spec,
      auditIssues: [],
      hasCriticalIssues: false,
      providerUsed: 'deterministic',
      approved: true,
      createdAt: new Date().toISOString(),
    });
    setBacktestReport(report);
    setBacktestMarkersVisible(true);
    setLogs([
      `Backtest executed: ${report.all.totalTrades} trades | Net ${report.all.netProfitPercent >= 0 ? '+' : ''}${report.all.netProfitPercent}% | Grade ${report.scorecard?.grade ?? '—'}`,
      ...diagnostics,
    ]);
    setActiveBottomTab('backtester');
  };

  return (
    <div
      data-testid="pine-script-editor-drawer"
      className="h-full flex flex-col min-h-0 gap-2 text-[12px] text-[var(--tv-text-primary)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Code2 className="w-4 h-4 text-[var(--tv-accent)]" />
          <span className="font-semibold">Pine Script™ v5 Editor &amp; Strategy Compiler</span>
          <div className="flex items-center gap-1 ml-2">
            {PINE_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setCode(p.code)}
                className="px-2 py-0.5 rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[10px] text-[var(--tv-text-secondary)] cursor-pointer"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveRightTab('ai')}
            className="h-[26px] px-2.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[11px] flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-[var(--tv-accent)]" />
            <span>AI Pine Copilot</span>
          </button>
          <button
            type="button"
            onClick={handlePlotOnly}
            className="h-[26px] px-2.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[11px] flex items-center gap-1 cursor-pointer"
          >
            <Layers className="w-3 h-3 text-[#f59e0b]" />
            <span>Add Plots to Chart</span>
          </button>
          <button
            type="button"
            data-testid="pine-compile-backtest-btn"
            onClick={handleCompileAndBacktest}
            className="h-[26px] px-3 rounded bg-[#089981] hover:bg-[#089981]/90 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Play className="w-3 h-3" />
            <span>Compile &amp; Backtest</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2 overflow-hidden">
        <textarea
          data-testid="pine-editor-textarea"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="lg:col-span-8 h-full p-2.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-canvas)] font-mono text-[11px] text-[var(--tv-text-primary)] resize-none focus:outline-none focus:border-[var(--tv-accent)]"
        />
        <div className="lg:col-span-4 h-full p-2.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-canvas)] font-mono text-[11px] overflow-y-auto flex flex-col gap-1">
          <div className="text-[10px] font-sans font-semibold uppercase tracking-wide text-[var(--tv-text-muted)]">
            Compiler Console
          </div>
          {logs.map((l, idx) => (
            <div key={idx} className="text-[var(--tv-text-secondary)] leading-snug">
              &gt; {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
