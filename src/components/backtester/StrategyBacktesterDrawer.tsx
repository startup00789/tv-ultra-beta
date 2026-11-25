import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  HelpCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type {
  BacktestReport,
  BacktestTrade,
  BarDecisionTrace,
  ConditionEvalTrace,
  MasterPromptDraft,
  StrategyAIProvider,
  StrategyAuditIssue,
  StrategyExplainResponse,
  StrategyRuleSpec,
  StrategySweepResponse,
} from '../../../shared/types';
import { apiClient, ApiError } from '../../lib/apiClient';
import { useWorkspaceStore } from '../../state/workspaceStore';

type ReportTab =
  | 'overview'
  | 'performance'
  | 'trades_analysis'
  | 'ratios'
  | 'trades'
  | 'sweep'
  | 'stress';

const STARTER_PRESETS: Array<{ label: string; prompt: string }> = [
  {
    label: 'EMA 9/21 Cross + RSI',
    prompt:
      'Buy when EMA 9 crosses above EMA 21 and RSI 14 < 70; exit when EMA 9 crosses below EMA 21 with 2% stop loss and 6% take profit.',
  },
  {
    label: 'Supertrend + ADX + Vol Spike',
    prompt:
      'Buy when Supertrend bullish and ADX 14 > 22 and volume > 1.3x with 2x ATR stop and 5% take profit.',
  },
  {
    label: 'Bollinger Mean Reversion',
    prompt:
      'Buy when close crosses below lower Bollinger Band 20 and RSI 14 < 38; exit when close crosses above middle Bollinger Band with 2% stop loss and 5% take profit.',
  },
  {
    label: 'Vague Test',
    prompt: 'Buy when it looks bullish and sell when it feels weak',
  },
];

function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtPct(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtNum(n: number | undefined | null, digits = 2): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function fmtBarTime(tsSec: number): string {
  if (!Number.isFinite(tsSec)) return '—';
  const d = new Date(tsSec * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function issueBadgeStyle(sev: StrategyAuditIssue['severity']): string {
  if (sev === 'critical') return 'border-[#f23645]/45 bg-[#f23645]/10 text-[#f23645]';
  if (sev === 'warning') return 'border-[#f59e0b]/45 bg-[#f59e0b]/10 text-[#f59e0b]';
  return 'border-[var(--tv-accent)]/40 bg-[var(--tv-accent)]/10 text-[var(--tv-accent)]';
}

function OverviewEquitySvg({ report }: { report: BacktestReport }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pts = report.equityCurve;
  if (pts.length < 2) {
    return (
      <div className="h-[115px] flex items-center justify-center text-[11px] text-[var(--tv-text-muted)] border border-[var(--tv-border)] rounded bg-[var(--tv-bg-canvas)]">
        Insufficient bars to plot equity curve.
      </div>
    );
  }

  const W = 540;
  const H = 126;
  const P = 10;
  const equities = pts.map((p) => p.equity);
  const bhs = pts.map((p) => p.buyHoldEquity);
  const allVals = [...equities, ...bhs];
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const span = Math.max(1e-6, maxVal - minVal);
  const maxDd = Math.max(1, ...pts.map((p) => p.drawdownPct));

  const toX = (i: number) => P + (i / (pts.length - 1)) * (W - P * 2);
  const toY = (v: number) => H - 24 - ((v - minVal) / span) * (H - 38);

  const eqPath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.equity).toFixed(1)}`)
    .join(' ');
  const bhPath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.buyHoldEquity).toFixed(1)}`)
    .join(' ');

  const areaPath = `${eqPath} L${toX(pts.length - 1).toFixed(1)},${(H - 24).toFixed(1)} L${toX(0).toFixed(1)},${(H - 24).toFixed(1)} Z`;
  const hovered = hoverIdx !== null && pts[hoverIdx] ? pts[hoverIdx] : null;

  return (
    <div className="border border-[var(--tv-border)] rounded bg-[var(--tv-bg-canvas)] p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--tv-text-muted)] mb-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 text-[#089981] font-medium">
            <span className="inline-block w-2.5 h-0.5 bg-[#089981]" />
            Strategy ({fmtPct(report.all.netProfitPercent)})
          </span>
          <span className="flex items-center gap-1 text-[#787b86]">
            <span className="inline-block w-2.5 h-0.5 bg-[#787b86]" />
            Buy &amp; Hold ({fmtPct(report.buyHoldReturnPercent)})
          </span>
          <span className="text-[#f23645]">Max DD: -{report.maxDrawdownPercent.toFixed(2)}%</span>
        </div>
        {hovered ? (
          <span className="font-mono text-[var(--tv-text-primary)]">
            {fmtBarTime(hovered.time)} · Eq <strong>{fmtMoney(hovered.equity)}</strong> · B&amp;H{' '}
            {fmtMoney(hovered.buyHoldEquity)} · DD -{hovered.drawdownPct.toFixed(2)}%
          </span>
        ) : (
          <span className="font-mono">
            {report.barCount.toLocaleString()} bars · {fmtBarTime(report.startTime).slice(0, 10)} →{' '}
            {fmtBarTime(report.endTime).slice(0, 10)}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[116px] block cursor-crosshair"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width <= 0) return;
          const rel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          setHoverIdx(Math.round(rel * (pts.length - 1)));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <path d={areaPath} fill="rgba(8, 153, 129, 0.12)" />
        <path d={bhPath} fill="none" stroke="#787b86" strokeWidth={1.25} strokeDasharray="3,3" />
        <path d={eqPath} fill="none" stroke="#089981" strokeWidth={1.8} />
        {pts.map((p, i) => {
          if (p.drawdownPct <= 0.1) return null;
          const barH = Math.min(18, (p.drawdownPct / maxDd) * 18);
          return (
            <rect
              key={`${p.time}-${i}`}
              x={toX(i) - 0.8}
              y={H - barH}
              width={1.8}
              height={barH}
              fill="rgba(242, 54, 69, 0.45)"
            />
          );
        })}
        {hoverIdx !== null && hovered && (
          <g>
            <line
              x1={toX(hoverIdx)}
              y1={4}
              x2={toX(hoverIdx)}
              y2={H - 2}
              stroke="#2962ff"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <circle
              cx={toX(hoverIdx)}
              cy={toY(hovered.equity)}
              r={3.5}
              fill="#089981"
              stroke="#131722"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>
    </div>
  );
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function MonthlyReturnsGrid({ report }: { report: BacktestReport }) {
  const entries = report.monthlyReturns ?? [];
  if (entries.length === 0) return null;

  const byYear = new Map<string, Record<number, number>>();
  for (const item of entries) {
    const [yr, moStr] = item.yearMonth.split('-');
    const mo = Number(moStr) - 1;
    if (!yr || !Number.isFinite(mo) || mo < 0 || mo > 11) continue;
    const row = byYear.get(yr) ?? {};
    row[mo] = item.returnPct;
    byYear.set(yr, row);
  }
  const years = Array.from(byYear.keys()).sort();
  if (years.length === 0) return null;

  return (
    <div
      data-testid="monthly-returns-heatmap"
      className="border border-[var(--tv-border)] rounded bg-[var(--tv-bg-canvas)] overflow-x-auto"
    >
      <div className="px-2.5 py-1 border-b border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] text-[10px] font-semibold uppercase tracking-wide text-[var(--tv-text-muted)] flex items-center justify-between">
        <span>Monthly Returns Heatmap (%)</span>
        <span className="font-mono font-normal">{entries.length} active months</span>
      </div>
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="text-[var(--tv-text-muted)] border-b border-[var(--tv-border)]">
            <th className="py-1 px-2 text-left">Year</th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="py-1 px-1 text-right">
                {m}
              </th>
            ))}
            <th className="py-1 px-2 text-right">YTD</th>
          </tr>
        </thead>
        <tbody>
          {years.map((yr) => {
            const row = byYear.get(yr) ?? {};
            const ytd = Object.values(row).reduce((acc, v) => acc + v, 0);
            return (
              <tr key={yr} className="border-b border-[var(--tv-border)]/40 last:border-b-0">
                <td className="py-1 px-2 font-semibold text-[var(--tv-text-secondary)]">{yr}</td>
                {MONTH_LABELS.map((_, idx) => {
                  const val = row[idx];
                  if (val === undefined) {
                    return (
                      <td key={idx} className="py-1 px-1 text-right text-[var(--tv-text-muted)]/40">
                        —
                      </td>
                    );
                  }
                  const bg =
                    val > 0.05
                      ? 'bg-[#089981]/18 text-[#089981]'
                      : val < -0.05
                        ? 'bg-[#f23645]/18 text-[#f23645]'
                        : 'text-[var(--tv-text-muted)]';
                  return (
                    <td key={idx} className={`py-1 px-1 text-right ${bg}`}>
                      {val >= 0 ? '+' : ''}
                      {val.toFixed(1)}
                    </td>
                  );
                })}
                <td
                  className={`py-1 px-2 text-right font-bold ${
                    ytd >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                  }`}
                >
                  {ytd >= 0 ? '+' : ''}
                  {ytd.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConditionTraceTable({
  title,
  checks,
}: {
  title: string;
  checks: ConditionEvalTrace[];
}) {
  if (!checks || checks.length === 0) return null;
  return (
    <div className="border border-[var(--tv-border)] rounded bg-[var(--tv-bg-canvas)] overflow-hidden">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--tv-text-muted)] bg-[var(--tv-bg-elevated)] border-b border-[var(--tv-border)]">
        {title}
      </div>
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="text-left text-[10px] text-[var(--tv-text-muted)] border-b border-[var(--tv-border)]">
            <th className="py-1 px-2">Condition</th>
            <th className="py-1 px-2 text-right">Left</th>
            <th className="py-1 px-2 text-center">Op</th>
            <th className="py-1 px-2 text-right">Right</th>
            <th className="py-1 px-2 text-right">Result</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.conditionId} className="border-b border-[var(--tv-border)]/50 last:border-b-0">
              <td className="py-1 px-2 font-sans text-[var(--tv-text-primary)]">{c.label}</td>
              <td className="py-1 px-2 text-right">{c.leftValue !== null ? c.leftValue.toFixed(4) : 'null'}</td>
              <td className="py-1 px-2 text-center text-[var(--tv-text-muted)]">{c.operator}</td>
              <td className="py-1 px-2 text-right">{c.rightValue !== null ? c.rightValue.toFixed(4) : 'null'}</td>
              <td className="py-1 px-2 text-right">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    c.passed
                      ? 'bg-[#089981]/15 text-[#089981]'
                      : 'bg-[#f23645]/15 text-[#f23645]'
                  }`}
                >
                  {c.passed ? 'PASS' : 'FAIL'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StrategyBacktesterDrawer() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bars = useWorkspaceStore((s) => s.bars);
  const opencodeSelectedModel = useWorkspaceStore((s) => s.opencodeSelectedModel);
  const masterPromptDraft = useWorkspaceStore((s) => s.masterPromptDraft);
  const backtestReport = useWorkspaceStore((s) => s.backtestReport);
  const backtestMarkersVisible = useWorkspaceStore((s) => s.backtestMarkersVisible);
  const selectedBacktestTradeNumber = useWorkspaceStore((s) => s.selectedBacktestTradeNumber);
  const inspectedBarIndex = useWorkspaceStore((s) => s.inspectedBarIndex);
  const chartWhyInspectMode = useWorkspaceStore((s) => s.chartWhyInspectMode);

  const setMasterPromptDraft = useWorkspaceStore((s) => s.setMasterPromptDraft);
  const setBacktestReport = useWorkspaceStore((s) => s.setBacktestReport);
  const setBacktestMarkersVisible = useWorkspaceStore((s) => s.setBacktestMarkersVisible);
  const setSelectedBacktestTradeNumber = useWorkspaceStore((s) => s.setSelectedBacktestTradeNumber);
  const setChartWhyInspectMode = useWorkspaceStore((s) => s.setChartWhyInspectMode);
  const startForwardTest = useWorkspaceStore((s) => s.startForwardTest);
  const setActiveRightTab = useWorkspaceStore((s) => s.setActiveRightTab);

  const [provider, setProvider] = useState<StrategyAIProvider>('opencode');
  const [historyDepth, setHistoryDepth] = useState<'chart' | '5000' | '15000' | '40000'>('chart');
  const [direction, setDirection] = useState<'both' | 'long' | 'short'>('both');
  const [leverage, setLeverage] = useState<number>(1);
  const [intrabarMagnifier, setIntrabarMagnifier] = useState<boolean>(true);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [description, setDescription] = useState(STARTER_PRESETS[0].prompt);
  const [masterPromptText, setMasterPromptText] = useState('');
  const [userFollowup, setUserFollowup] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [sweepResult, setSweepResult] = useState<StrategySweepResponse | null>(null);
  const [reportTab, setReportTab] = useState<ReportTab>('overview');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // "Why?" / Critique state
  const [whyOpen, setWhyOpen] = useState(false);
  const [whyQuestion, setWhyQuestion] = useState(
    'Critique the strategy logic and explain why the selected trade/bar fired.',
  );
  const [whyTradeNumber, setWhyTradeNumber] = useState<number | undefined>(undefined);
  const [whyLoading, setWhyLoading] = useState(false);
  const [whyResponse, setWhyResponse] = useState<StrategyExplainResponse | null>(null);

  useEffect(() => {
    if (masterPromptDraft) {
      setMasterPromptText(masterPromptDraft.masterPrompt);
    }
  }, [masterPromptDraft]);

  const applyDraft = (draft: MasterPromptDraft, note?: string) => {
    setMasterPromptDraft(draft);
    setMasterPromptText(draft.masterPrompt);
    setAiNote(note ?? null);
    setErrorMsg(null);
  };

  const handleGenerateMasterPrompt = async (applyStrictFixes = false) => {
    if (!description.trim()) {
      setErrorMsg('Describe your strategy rules in plain English first.');
      return;
    }
    setPromptLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiClient.generateMasterPrompt({
        description,
        symbol,
        timeframe,
        provider,
        model: provider === 'opencode' ? (opencodeSelectedModel ?? undefined) : undefined,
        applyStrictFixes,
      });
      applyDraft(res.draft, res.aiNote);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to generate Master Prompt.',
      );
    } finally {
      setPromptLoading(false);
    }
  };

  const handleRefineMasterPrompt = async () => {
    if (!masterPromptDraft) return;
    setRefineLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiClient.refineMasterPrompt({
        draft: masterPromptDraft,
        editedMasterPrompt: masterPromptText,
        userFollowup: userFollowup.trim() || undefined,
        provider,
        model: provider === 'opencode' ? (opencodeSelectedModel ?? undefined) : undefined,
      });
      applyDraft(res.draft, res.aiNote);
      setUserFollowup('');
      setStatusMsg('Master Prompt edits & refinement synced to Rule Spec and re-audited.');
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to refine Master Prompt.',
      );
    } finally {
      setRefineLoading(false);
    }
  };

  const handleApproveAndBacktest = async () => {
    if (!masterPromptDraft) {
      setErrorMsg('Generate and review a Master Prompt first.');
      return;
    }
    if (masterPromptDraft.hasCriticalIssues) {
      setErrorMsg(
        'Critical rule issues remain. Click "Apply Strict Auto-Fixes" or rewrite your rules before approving.',
      );
      return;
    }
    setBacktestLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const approvedDraft: MasterPromptDraft = {
        ...masterPromptDraft,
        masterPrompt: masterPromptText,
        approved: true,
      };
      setMasterPromptDraft(approvedDraft);

      const execSpec: StrategyRuleSpec = {
        ...approvedDraft.compiledSpec,
        direction,
        execution: {
          ...approvedDraft.compiledSpec.execution,
          leverage,
          intrabarMagnifier,
        },
      };

      const parsedFrom = fromDate ? Math.floor(Date.parse(`${fromDate}T00:00:00Z`) / 1000) : undefined;
      const parsedTo = toDate ? Math.floor(Date.parse(`${toDate}T23:59:59Z`) / 1000) : undefined;
      const useServerUltraDepth = historyDepth !== 'chart' || bars.length > 3500;
      const requestedLimit =
        historyDepth !== 'chart' ? Number(historyDepth) : Math.max(300, bars.length);

      const res = await apiClient.runStrategyBacktest({
        spec: execSpec,
        masterPrompt: masterPromptText,
        approved: true,
        symbol,
        timeframe,
        bars: !useServerUltraDepth && bars.length > 0 ? bars : undefined,
        historyLimit: useServerUltraDepth ? requestedLimit : undefined,
        fromTime: Number.isFinite(parsedFrom) ? parsedFrom : undefined,
        toTime: Number.isFinite(parsedTo) ? parsedTo : undefined,
        descriptionForAudit: approvedDraft.userDescription,
      });
      if (!res.ok || !res.report) {
        setErrorMsg(res.message || 'Backtest rejected by strict validator.');
        return;
      }
      setMasterPromptDraft({
        ...approvedDraft,
        compiledSpec: res.report.spec,
      });
      setBacktestReport(res.report);
      setBacktestMarkersVisible(true);
      setSweepResult(null);
      setStatusMsg(
        `Deep Backtest completed: ${res.report.all.totalTrades} trades across ${res.report.barCount.toLocaleString()} bars (Grade ${res.report.scorecard?.grade ?? '—'}) · Auto-loaded into DeepSeek / OpenCode / Demo Forward Test.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Backtest execution failed.',
      );
    } finally {
      setBacktestLoading(false);
    }
  };

  const handleRunSweep = async () => {
    const spec = masterPromptDraft?.compiledSpec ?? backtestReport?.spec;
    if (!spec) return;
    setSweepLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.runStrategySweep({
        spec,
        metric: 'sharpeRatio',
        symbol,
        timeframe,
        bars: bars.length > 0 && bars.length <= 3500 ? bars : undefined,
      });
      setSweepResult(res);
      setReportTab('sweep');
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Parameter sweep failed.',
      );
    } finally {
      setSweepLoading(false);
    }
  };

  const handleAskWhy = async (
    overrideTradeNum?: number,
    customQuestion?: string,
    overrideBarIndex?: number,
  ) => {
    const spec = masterPromptDraft?.compiledSpec ?? backtestReport?.spec;
    if (!spec) {
      setErrorMsg('Compile or run a strategy first to interrogate decisions.');
      return;
    }
    const targetTrade = overrideTradeNum ?? (overrideBarIndex === undefined ? whyTradeNumber : undefined);
    const questionText = (customQuestion ?? whyQuestion).trim() || 'Why did this rule trigger or not trigger?';
    setWhyOpen(true);
    setWhyLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.explainStrategyDecision({
        question: questionText,
        spec,
        provider,
        model: provider === 'opencode' ? (opencodeSelectedModel ?? undefined) : undefined,
        report: backtestReport ?? undefined,
        tradeNumber: targetTrade,
        barIndex: overrideBarIndex,
        bars: bars.length > 0 && bars.length <= 3500 ? bars : undefined,
      });
      setWhyResponse(res);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Explain request failed.',
      );
    } finally {
      setWhyLoading(false);
    }
  };

  useEffect(() => {
    if (inspectedBarIndex !== null && (masterPromptDraft?.compiledSpec || backtestReport?.spec)) {
      void handleAskWhy(
        undefined,
        `Why did the strategy fire or skip on Bar #${inspectedBarIndex}? Show exact condition gaps.`,
        inspectedBarIndex,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectedBarIndex]);

  const handleDeployToPaperBot = async () => {
    if (!masterPromptDraft || !masterPromptDraft.approved) {
      setErrorMsg('Approve your Master Prompt & run backtest before launching Live Demo Forward Test.');
      return;
    }
    setErrorMsg(null);
    try {
      await startForwardTest();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to launch Live Demo Forward Test.',
      );
    }
  };

  const handleWhySubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleAskWhy();
  };

  const perfRows = useMemo(() => {
    if (!backtestReport) return [];
    const { all, long, short } = backtestReport;
    return [
      { label: 'Net Profit', all: fmtMoney(all.netProfit), long: fmtMoney(long.netProfit), short: fmtMoney(short.netProfit) },
      { label: 'Net Profit %', all: fmtPct(all.netProfitPercent), long: fmtPct(long.netProfitPercent), short: fmtPct(short.netProfitPercent) },
      { label: 'Gross Profit', all: fmtMoney(all.grossProfit), long: fmtMoney(long.grossProfit), short: fmtMoney(short.grossProfit) },
      { label: 'Gross Loss', all: fmtMoney(all.grossLoss), long: fmtMoney(long.grossLoss), short: fmtMoney(short.grossLoss) },
      { label: 'Profit Factor', all: fmtNum(all.profitFactor), long: fmtNum(long.profitFactor), short: fmtNum(short.profitFactor) },
      { label: 'Total Closed Trades', all: String(all.totalTrades), long: String(long.totalTrades), short: String(short.totalTrades) },
      { label: 'Percent Profitable', all: `${all.percentProfitable.toFixed(1)}%`, long: `${long.percentProfitable.toFixed(1)}%`, short: `${short.percentProfitable.toFixed(1)}%` },
      { label: 'Avg Trade', all: fmtMoney(all.avgTrade), long: fmtMoney(long.avgTrade), short: fmtMoney(short.avgTrade) },
      { label: 'Avg Win / Avg Loss Ratio', all: fmtNum(all.ratioAvgWinAvgLoss), long: fmtNum(long.ratioAvgWinAvgLoss), short: fmtNum(short.ratioAvgWinAvgLoss) },
      { label: 'Commission Paid', all: fmtMoney(all.commissionPaid), long: fmtMoney(long.commissionPaid), short: fmtMoney(short.commissionPaid) },
    ];
  }, [backtestReport]);

  const groundTrace: BarDecisionTrace | undefined = whyResponse?.groundTruthTrace;
  const inspectedTrade: BacktestTrade | undefined = whyResponse?.inspectedTrade;

  return (
    <div
      data-testid="strategy-backtester-drawer"
      className="h-full flex min-h-0 bg-[var(--tv-bg-panel)] text-[12px] text-[var(--tv-text-primary)] overflow-hidden"
    >
      {/* LEFT PANE: Natural Language Compiler + Master Prompt Approval Gate */}
      <div className="w-[350px] shrink-0 border-r border-[var(--tv-border)] flex flex-col min-h-0 overflow-y-auto p-2.5 gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-[12px]">
            <Sparkles className="w-3.5 h-3.5 text-[var(--tv-accent)]" />
            <span>AI Strategy Compiler</span>
            <span className="text-[10px] text-[var(--tv-text-muted)] font-normal">
              ({symbol} · {timeframe})
            </span>
          </div>
          <select
            data-testid="strategy-provider-select"
            aria-label="Strategy AI Provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as StrategyAIProvider)}
            className="h-[24px] px-1.5 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)]"
          >
            <option value="deepseek">DeepSeek V3 / R1</option>
            <option value="opencode">OpenCode AI</option>
            <option value="byok">Bring Your Own API</option>
            <option value="gemini">Gemini AI</option>
            <option value="deterministic">Deterministic Strict</option>
          </select>
        </div>

        {/* TradingView Ultra Deep Backtesting Controls */}
        <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]/70 flex flex-col gap-1.5 text-[10px]">
          <div className="grid grid-cols-3 gap-1">
            <label className="flex flex-col gap-0.5">
              <span className="text-[var(--tv-text-muted)]">Ultra Depth</span>
              <select
                data-testid="backtest-depth-select"
                value={historyDepth}
                onChange={(e) =>
                  setHistoryDepth(e.target.value as 'chart' | '5000' | '15000' | '40000')
                }
                className="h-[22px] px-1 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] text-[10px] text-[var(--tv-text-primary)]"
              >
                <option value="chart">Chart ({bars.length.toLocaleString()}b)</option>
                <option value="5000">5,000 Bars</option>
                <option value="15000">15,000 Ultra</option>
                <option value="40000">40,000 Max</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[var(--tv-text-muted)]">Direction</span>
              <select
                data-testid="backtest-direction-select"
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'both' | 'long' | 'short')}
                className="h-[22px] px-1 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] text-[10px] text-[var(--tv-text-primary)]"
              >
                <option value="both">Long &amp; Short</option>
                <option value="long">Long Only</option>
                <option value="short">Short Only</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[var(--tv-text-muted)]">Leverage</span>
              <select
                data-testid="backtest-leverage-select"
                value={String(leverage)}
                onChange={(e) => setLeverage(Number(e.target.value) || 1)}
                className="h-[22px] px-1 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] text-[10px] text-[var(--tv-text-primary)]"
              >
                <option value="1">1x Spot</option>
                <option value="2">2x Margin</option>
                <option value="5">5x Perp</option>
                <option value="10">10x Perp</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between gap-1.5 pt-0.5">
            <label className="flex items-center gap-1 cursor-pointer text-[var(--tv-text-secondary)]">
              <input
                type="checkbox"
                data-testid="backtest-magnifier-toggle"
                checked={intrabarMagnifier}
                onChange={(e) => setIntrabarMagnifier(e.target.checked)}
                className="accent-[var(--tv-accent)]"
              />
              <span>Bar Magnifier (Intrabar Wick)</span>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                aria-label="Backtest From Date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-[20px] w-[92px] px-1 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] text-[9.5px] text-[var(--tv-text-secondary)]"
              />
              <span className="text-[var(--tv-text-muted)]">→</span>
              <input
                type="date"
                aria-label="Backtest To Date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-[20px] w-[92px] px-1 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] text-[9.5px] text-[var(--tv-text-secondary)]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {STARTER_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setDescription(preset.prompt);
                setErrorMsg(null);
              }}
              className="px-2 py-0.5 rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[10px] text-[var(--tv-text-secondary)] cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <textarea
          data-testid="strategy-description-input"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe entry, exit, stop-loss, take-profit in plain English..."
          className="w-full p-2 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-muted)] resize-y focus:outline-none focus:border-[var(--tv-accent)]"
        />

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="generate-master-prompt-btn"
            disabled={promptLoading || !description.trim()}
            onClick={() => void handleGenerateMasterPrompt(false)}
            className="flex-1 h-[28px] px-2.5 rounded bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] disabled:opacity-50 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{promptLoading ? 'Auditing Rules...' : 'Generate Master Prompt'}</span>
          </button>
        </div>

        {errorMsg && (
          <div
            data-testid="strategy-error-banner"
            className="px-2.5 py-1.5 rounded border border-[#f23645]/45 bg-[#f23645]/10 text-[#f23645] text-[11px]"
          >
            {errorMsg}
          </div>
        )}

        {statusMsg && !errorMsg && (
          <div className="px-2.5 py-1 rounded border border-[#089981]/40 bg-[#089981]/10 text-[#089981] text-[11px]">
            {statusMsg}
          </div>
        )}

        {/* Strict Master Prompt Confirmation Card */}
        {masterPromptDraft && (
          <div
            data-testid="master-prompt-card"
            className="p-2.5 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                {masterPromptDraft.hasCriticalIssues ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-[#f23645]" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#089981]" />
                )}
                <span>Master Prompt Approval Gate</span>
              </div>
              <span className="text-[10px] text-[var(--tv-text-muted)] uppercase">
                {masterPromptDraft.providerUsed}
                {masterPromptDraft.modelLabel ? ` · ${masterPromptDraft.modelLabel}` : ''}
              </span>
            </div>

            <div className="text-[11px] text-[var(--tv-accent)] font-medium">
              Is this Master Prompt &amp; Rule Spec fine? Review strict audit &amp; edit before running:
            </div>

            {aiNote && (
              <div className="text-[10px] text-[var(--tv-text-muted)] bg-[var(--tv-bg-panel)] px-2 py-1 rounded border border-[var(--tv-border)]">
                {aiNote}
              </div>
            )}

            {/* Audit Issues */}
            <div className="flex flex-col gap-1 max-h-[115px] overflow-y-auto">
              {masterPromptDraft.auditIssues.length === 0 ? (
                <div className="px-2 py-1 rounded border border-[#089981]/40 bg-[#089981]/10 text-[#089981] text-[10px]">
                  All strict anti-lookahead &amp; risk checks passed.
                </div>
              ) : (
                masterPromptDraft.auditIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`px-2 py-1 rounded border text-[10px] leading-snug ${issueBadgeStyle(issue.severity)}`}
                  >
                    <div className="font-semibold uppercase flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>
                        {issue.severity} · {issue.code}: {issue.rule}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[var(--tv-text-primary)]">{issue.explanation}</div>
                    <div className="mt-0.5 opacity-80">Fix: {issue.suggestedFix}</div>
                  </div>
                ))
              )}
            </div>

            <textarea
              data-testid="master-prompt-editor"
              rows={5}
              value={masterPromptText}
              onChange={(e) => setMasterPromptText(e.target.value)}
              className="w-full p-1.5 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] font-mono text-[10px] text-[var(--tv-text-primary)] resize-y focus:outline-none focus:border-[var(--tv-accent)]"
            />

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                data-testid="strategy-refine-input"
                value={userFollowup}
                onChange={(e) => setUserFollowup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleRefineMasterPrompt();
                  }
                }}
                placeholder="Refine rules (e.g. 'Add ADX > 25 or change stop loss to 1.5%')..."
                className="flex-1 min-w-0 h-[25px] px-2 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] text-[10px] text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-muted)] focus:outline-none focus:border-[var(--tv-accent)]"
              />
              <button
                type="button"
                data-testid="sync-prompt-edits-btn"
                disabled={refineLoading}
                onClick={() => void handleRefineMasterPrompt()}
                title="Sync manual Master Prompt edits or follow-up refinement into Rule Spec & re-audit"
                className="h-[25px] px-2 rounded border border-[var(--tv-accent)]/45 bg-[var(--tv-accent)]/12 hover:bg-[var(--tv-accent)]/22 text-[var(--tv-accent)] text-[10px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${refineLoading ? 'animate-spin' : ''}`} />
                <span>Sync Edits &amp; Re-Audit</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {masterPromptDraft.auditIssues.length > 0 && (
                <button
                  type="button"
                  data-testid="apply-strict-fixes-btn"
                  disabled={promptLoading}
                  onClick={() => void handleGenerateMasterPrompt(true)}
                  className="h-[26px] px-2 rounded border border-[#f59e0b]/50 bg-[#f59e0b]/15 hover:bg-[#f59e0b]/25 text-[#f59e0b] text-[10px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Wrench className="w-3 h-3" />
                  <span>Apply Strict Auto-Fixes</span>
                </button>
              )}
              <button
                type="button"
                data-testid="approve-run-backtest-btn"
                disabled={backtestLoading || masterPromptDraft.hasCriticalIssues}
                onClick={() => void handleApproveAndBacktest()}
                className="flex-1 h-[26px] px-2.5 rounded bg-[#089981] hover:bg-[#089981]/90 disabled:opacity-45 text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                <span>{backtestLoading ? 'Running Backtest...' : 'Approve & Run Backtest'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANE: 7-Tab Strategy Report + Paper Bot Deploy + "Why?" Interrogator */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* Top Action & Sub-Tab Strip */}
        <div className="px-2.5 py-1.5 border-b border-[var(--tv-border)] flex flex-wrap items-center justify-between gap-1.5 shrink-0 bg-[var(--tv-bg-elevated)]/40">
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            {(
              [
                ['overview', 'Overview'],
                ['performance', 'Performance'],
                ['trades_analysis', 'Trades Analysis'],
                ['ratios', 'Ratios'],
                ['trades', 'Trades'],
                ['sweep', 'Sweep'],
                ['stress', 'Stress & Grade'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`report-tab-${id}`}
                onClick={() => setReportTab(id)}
                className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  reportTab === id
                    ? 'bg-[var(--tv-accent)] text-white'
                    : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1 shrink-0">
            <button
              type="button"
              data-testid="inspect-bar-why-toggle"
              onClick={() => setChartWhyInspectMode(!chartWhyInspectMode)}
              title="Click any candle on the chart to interrogate exact PASS/FAIL rule trace"
              className={`h-[24px] px-2 rounded border text-[10px] flex items-center gap-1 cursor-pointer ${
                chartWhyInspectMode
                  ? 'border-[#f59e0b] bg-[#f59e0b]/15 text-[#f59e0b] font-semibold'
                  : 'border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-secondary)]'
              }`}
            >
              <Crosshair className="w-3 h-3" />
              <span>{chartWhyInspectMode ? 'Inspecting' : 'Inspect'}</span>
            </button>
            <button
              type="button"
              onClick={() => setBacktestMarkersVisible(!backtestMarkersVisible)}
              title="Toggle Buy/Sell trade markers on chart"
              className="h-[24px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[10px] text-[var(--tv-text-secondary)] flex items-center gap-1 cursor-pointer"
            >
              {backtestMarkersVisible ? <Eye className="w-3 h-3 text-[#089981]" /> : <EyeOff className="w-3 h-3" />}
              <span>Markers</span>
            </button>
            <button
              type="button"
              data-testid="run-param-sweep-btn"
              disabled={sweepLoading || !masterPromptDraft}
              onClick={() => void handleRunSweep()}
              className="h-[24px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] disabled:opacity-45 text-[10px] text-[var(--tv-text-primary)] flex items-center gap-1 cursor-pointer"
            >
              <Sliders className="w-3 h-3 text-[var(--tv-accent)]" />
              <span>{sweepLoading ? 'Sweeping...' : 'Sweep'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setWhyOpen((v) => !v);
              }}
              className={`h-[24px] px-2 rounded border text-[10px] flex items-center gap-1 cursor-pointer ${
                whyOpen
                  ? 'border-[var(--tv-accent)] bg-[var(--tv-accent)]/15 text-[var(--tv-accent)]'
                  : 'border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)]'
              }`}
            >
              <HelpCircle className="w-3 h-3" />
              <span>Why? / Critique</span>
            </button>
            <button
              type="button"
              data-testid="send-strategy-to-ai-btn"
              disabled={!backtestReport && !masterPromptDraft}
              onClick={() => setActiveRightTab('ai')}
              title="Open AI Copilot with this backtested strategy loaded for DeepSeek / OpenCode / BYOK"
              className="h-[24px] px-2 rounded border border-[#38bdf8]/45 bg-[#38bdf8]/12 hover:bg-[#38bdf8]/22 disabled:opacity-45 text-[#38bdf8] text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <BrainCircuit className="w-3 h-3" />
              <span>Ask DeepSeek / AI</span>
            </button>
            <button
              type="button"
              data-testid="deploy-paper-bot-btn"
              disabled={!masterPromptDraft?.approved}
              onClick={() => void handleDeployToPaperBot()}
              className="h-[24px] px-2.5 rounded bg-[#089981] hover:bg-[#089981]/90 disabled:opacity-45 text-white text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Play className="w-3 h-3" />
              <span>Forward Test in Demo</span>
            </button>
          </div>
        </div>

        {/* Report Body + Optional "Why?" Drawer */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-w-0 overflow-y-auto p-3 flex flex-col gap-2.5">
            {!backtestReport && reportTab !== 'sweep' ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 text-[var(--tv-text-muted)]">
                <Sparkles className="w-6 h-6 text-[var(--tv-accent)]/70" />
                <div className="text-[12px] font-medium text-[var(--tv-text-primary)]">
                  Describe a strategy on the left, audit its Master Prompt, and click Approve &amp; Run Backtest.
                </div>
                <div className="text-[11px] max-w-[440px]">
                  Every backtest runs zero-lookahead evaluation, logs entry/exit numeric rule traces on every trade, and lets you ask &ldquo;Why?&rdquo; on any bar or trade.
                </div>
              </div>
            ) : (
              <>
                {backtestReport && reportTab === 'overview' && (
                  <>
                    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                      <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                        <div className="text-[10px] text-[var(--tv-text-muted)]">Net Profit</div>
                        <div
                          className={`font-mono font-semibold text-[12px] ${
                            backtestReport.all.netProfit >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                          }`}
                        >
                          {fmtMoney(backtestReport.all.netProfit)}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--tv-text-muted)]">
                          {fmtPct(backtestReport.all.netProfitPercent)}
                        </div>
                      </div>
                      <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                        <div className="text-[10px] text-[var(--tv-text-muted)]">Max Drawdown</div>
                        <div className="font-mono font-semibold text-[12px] text-[#f23645]">
                          {fmtMoney(-backtestReport.maxDrawdown)}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--tv-text-muted)]">
                          -{backtestReport.maxDrawdownPercent.toFixed(2)}%
                        </div>
                      </div>
                      <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                        <div className="text-[10px] text-[var(--tv-text-muted)]">Total Trades</div>
                        <div className="font-mono font-semibold text-[12px]">
                          {backtestReport.all.totalTrades}
                        </div>
                        <div className="text-[10px] text-[var(--tv-text-muted)]">
                          Win {backtestReport.all.winningTrades} / Loss {backtestReport.all.losingTrades}
                        </div>
                      </div>
                      <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                        <div className="text-[10px] text-[var(--tv-text-muted)]">Percent Profitable</div>
                        <div className="font-mono font-semibold text-[12px]">
                          {backtestReport.all.percentProfitable.toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                        <div className="text-[10px] text-[var(--tv-text-muted)]">Profit Factor</div>
                        <div className="font-mono font-semibold text-[12px]">
                          {fmtNum(backtestReport.all.profitFactor)}
                        </div>
                      </div>
                      <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                        <div className="text-[10px] text-[var(--tv-text-muted)]">Sharpe Ratio</div>
                        <div className="font-mono font-semibold text-[12px]">
                          {fmtNum(backtestReport.sharpeRatio)}
                        </div>
                      </div>
                    </div>
                    <OverviewEquitySvg report={backtestReport} />
                    <MonthlyReturnsGrid report={backtestReport} />
                  </>
                )}

                {backtestReport && reportTab === 'performance' && (
                  <div className="flex flex-col gap-2.5">
                    <div className="border border-[var(--tv-border)] rounded overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead className="bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)]">
                          <tr className="border-b border-[var(--tv-border)]">
                            <th className="py-1.5 px-2.5 text-left">Metric</th>
                            <th className="py-1.5 px-2.5 text-right">All</th>
                            <th className="py-1.5 px-2.5 text-right">Long</th>
                            <th className="py-1.5 px-2.5 text-right">Short</th>
                          </tr>
                        </thead>
                        <tbody>
                          {perfRows.map((row) => (
                            <tr key={row.label} className="border-b border-[var(--tv-border)]/50">
                              <td className="py-1 px-2.5 text-[var(--tv-text-secondary)]">{row.label}</td>
                              <td className="py-1 px-2.5 text-right font-mono">{row.all}</td>
                              <td className="py-1 px-2.5 text-right font-mono">{row.long}</td>
                              <td className="py-1 px-2.5 text-right font-mono">{row.short}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <MonthlyReturnsGrid report={backtestReport} />
                  </div>
                )}

                {backtestReport && reportTab === 'trades_analysis' && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                      <div className="text-[10px] text-[var(--tv-text-muted)]">Largest Win / Loss</div>
                      <div className="font-mono text-[11px] text-[#089981]">
                        {fmtMoney(backtestReport.all.largestWinTrade)}
                      </div>
                      <div className="font-mono text-[11px] text-[#f23645]">
                        {fmtMoney(backtestReport.all.largestLossTrade)}
                      </div>
                    </div>
                    <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                      <div className="text-[10px] text-[var(--tv-text-muted)]">Streaks (Win / Loss)</div>
                      <div className="font-mono text-[11px]">
                        {backtestReport.all.maxConsecutiveWins} wins / {backtestReport.all.maxConsecutiveLosses} losses
                      </div>
                      <div className="text-[10px] text-[var(--tv-text-muted)]">
                        Avg bars held: {backtestReport.all.avgBarsInTrade.toFixed(1)}
                      </div>
                    </div>
                    <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                      <div className="text-[10px] text-[var(--tv-text-muted)]">MFE / MAE Avg</div>
                      <div className="font-mono text-[11px] text-[#089981]">
                        MFE: {fmtPct(backtestReport.all.avgMfePct)}
                      </div>
                      <div className="font-mono text-[11px] text-[#f23645]">
                        MAE: {fmtPct(backtestReport.all.avgMaePct)}
                      </div>
                    </div>
                    <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]">
                      <div className="text-[10px] text-[var(--tv-text-muted)]">2σ Outliers &amp; Timing</div>
                      <div className="font-mono text-[11px]">
                        {backtestReport.all.outliersCount} outlier trades
                      </div>
                      <div className="text-[10px] text-[var(--tv-text-muted)]">
                        Best Entry Hour (UTC):{' '}
                        {backtestReport.bestEntryHourUtc !== null
                          ? `${backtestReport.bestEntryHourUtc}:00`
                          : '—'}
                      </div>
                    </div>
                  </div>
                )}

                {backtestReport && reportTab === 'ratios' && (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                    {[
                      ['Sharpe Ratio', fmtNum(backtestReport.sharpeRatio)],
                      ['Sortino Ratio', fmtNum(backtestReport.sortinoRatio)],
                      ['Calmar Ratio', fmtNum(backtestReport.calmarRatio)],
                      ['CAGR %', fmtPct(backtestReport.cagrPercent)],
                      ['Return / Max Drawdown', fmtNum(backtestReport.returnOnMaxDrawdown)],
                      ['Strategy vs B&H Corr', fmtNum(backtestReport.strategyBuyHoldCorrelation, 3)],
                      ['Outperformance vs B&H', fmtPct(backtestReport.strategyOutperformancePercent)],
                      ['Max Run-up %', `${backtestReport.maxRunupPercent.toFixed(2)}%`],
                      ['Final Equity', fmtMoney(backtestReport.finalEquity)],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex items-center justify-between"
                      >
                        <span className="text-[var(--tv-text-muted)]">{k}</span>
                        <span className="font-mono font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {backtestReport && reportTab === 'trades' && (
                  <div className="border border-[var(--tv-border)] rounded overflow-hidden">
                    <table data-testid="backtest-trades-table" className="w-full text-[11px]">
                      <thead className="bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)]">
                        <tr className="border-b border-[var(--tv-border)]">
                          <th className="py-1.5 px-2 text-left">#</th>
                          <th className="py-1.5 px-2 text-left">Side</th>
                          <th className="py-1.5 px-2 text-left">Entry</th>
                          <th className="py-1.5 px-2 text-left">Exit</th>
                          <th className="py-1.5 px-2 text-right">Entry $</th>
                          <th className="py-1.5 px-2 text-right">Exit $</th>
                          <th className="py-1.5 px-2 text-right">Net P&amp;L</th>
                          <th className="py-1.5 px-2 text-left">Reason</th>
                          <th className="py-1.5 px-2 text-right">Audit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestReport.trades.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-4 text-center text-[var(--tv-text-muted)]">
                              No trades triggered under these strict rules on {symbol} ({timeframe}).
                            </td>
                          </tr>
                        ) : (
                          backtestReport.trades.map((t) => {
                            const selected = selectedBacktestTradeNumber === t.tradeNumber;
                            return (
                              <tr
                                key={t.tradeNumber}
                                onClick={() => setSelectedBacktestTradeNumber(t.tradeNumber)}
                                className={`border-b border-[var(--tv-border)]/50 cursor-pointer ${
                                  selected ? 'bg-[var(--tv-accent)]/12' : 'hover:bg-[var(--tv-bg-hover)]/40'
                                }`}
                              >
                                <td className="py-1 px-2 font-mono">{t.tradeNumber}</td>
                                <td className="py-1 px-2 uppercase font-semibold">
                                  <span className={t.side === 'long' ? 'text-[#089981]' : 'text-[#f23645]'}>
                                    {t.side}
                                  </span>
                                </td>
                                <td className="py-1 px-2 font-mono text-[10px]">{fmtBarTime(t.entryTime)}</td>
                                <td className="py-1 px-2 font-mono text-[10px]">{fmtBarTime(t.exitTime)}</td>
                                <td className="py-1 px-2 text-right font-mono">{t.entryPrice.toFixed(2)}</td>
                                <td className="py-1 px-2 text-right font-mono">{t.exitPrice.toFixed(2)}</td>
                                <td
                                  className={`py-1 px-2 text-right font-mono ${
                                    t.netProfit >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                                  }`}
                                >
                                  {fmtMoney(t.netProfit)} ({fmtPct(t.netProfitPercent)})
                                </td>
                                <td className="py-1 px-2 text-[10px] uppercase text-[var(--tv-text-muted)]">
                                  {t.exitReason}
                                </td>
                                <td className="py-1 px-2 text-right">
                                  <button
                                    type="button"
                                    data-testid={`trade-why-btn-${t.tradeNumber}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedBacktestTradeNumber(t.tradeNumber);
                                      setWhyTradeNumber(t.tradeNumber);
                                      void handleAskWhy(
                                        t.tradeNumber,
                                        `Why did Trade #${t.tradeNumber} (${t.side}) enter and exit (${t.exitReason})? Critique this setup strictly.`,
                                      );
                                    }}
                                    className="px-2 py-0.5 rounded bg-[var(--tv-accent)]/15 hover:bg-[var(--tv-accent)]/25 text-[var(--tv-accent)] font-semibold text-[10px] cursor-pointer"
                                  >
                                    Why?
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {reportTab === 'sweep' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] text-[var(--tv-text-muted)]">
                      <span>
                        Zero-lookahead parameter grid sweep across Stop-Loss, Take-Profit &amp; indicator periods
                      </span>
                      {sweepResult && <span>Completed in {sweepResult.durationMs}ms</span>}
                    </div>
                    {!sweepResult ? (
                      <div className="py-6 text-center text-[var(--tv-text-muted)] border border-[var(--tv-border)] rounded">
                        Click &ldquo;Sweep&rdquo; in the toolbar above to rank parameter combinations by Sharpe Ratio.
                      </div>
                    ) : (
                      <div className="border border-[var(--tv-border)] rounded overflow-hidden">
                        <table className="w-full text-[11px]">
                          <thead className="bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)]">
                            <tr className="border-b border-[var(--tv-border)]">
                              <th className="py-1.5 px-2 text-left">Parameters</th>
                              <th className="py-1.5 px-2 text-right">Sharpe</th>
                              <th className="py-1.5 px-2 text-right">Net %</th>
                              <th className="py-1.5 px-2 text-right">Profit Factor</th>
                              <th className="py-1.5 px-2 text-right">Max DD %</th>
                              <th className="py-1.5 px-2 text-right">Win Rate</th>
                              <th className="py-1.5 px-2 text-right">Trades</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sweepResult.results.map((item) => (
                              <tr key={item.label} className="border-b border-[var(--tv-border)]/50">
                                <td className="py-1 px-2 font-mono">{item.label}</td>
                                <td className="py-1 px-2 text-right font-mono">{item.sharpeRatio.toFixed(2)}</td>
                                <td
                                  className={`py-1 px-2 text-right font-mono ${
                                    item.netProfitPercent >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                                  }`}
                                >
                                  {fmtPct(item.netProfitPercent)}
                                </td>
                                <td className="py-1 px-2 text-right font-mono">{item.profitFactor.toFixed(2)}</td>
                                <td className="py-1 px-2 text-right font-mono text-[#f23645]">
                                  -{item.maxDrawdownPercent.toFixed(2)}%
                                </td>
                                <td className="py-1 px-2 text-right font-mono">{item.winRatePercent.toFixed(1)}%</td>
                                <td className="py-1 px-2 text-right font-mono">{item.totalTrades}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {backtestReport && reportTab === 'stress' && (
                  <div data-testid="stress-quant-view" className="flex flex-col gap-2.5">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
                      {/* Quant Scorecard */}
                      <div className="p-2.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--tv-text-muted)]">
                            Institutional Grade
                          </span>
                          <span
                            data-testid="quant-grade-badge"
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              backtestReport.scorecard?.grade === 'A' || backtestReport.scorecard?.grade === 'B'
                                ? 'bg-[#089981]/20 text-[#089981]'
                                : backtestReport.scorecard?.grade === 'C'
                                  ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                                  : 'bg-[#f23645]/20 text-[#f23645]'
                            }`}
                          >
                            Grade {backtestReport.scorecard?.grade ?? '—'} · {backtestReport.scorecard?.score ?? 0}/100
                          </span>
                        </div>
                        <div className="text-[11px] font-mono">
                          t-Stat: {fmtNum(backtestReport.scorecard?.tStat)} · p-Val:{' '}
                          {fmtNum(backtestReport.scorecard?.pValue, 3)}
                        </div>
                        <div className="text-[10px] text-[var(--tv-text-muted)]">
                          Sample: {backtestReport.scorecard?.sampleSizeAdequate ? 'Adequate (≥15)' : 'Low-N (<15 trades)'}
                        </div>
                      </div>

                      {/* Walk-Forward 70/30 OOS */}
                      <div className="p-2.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--tv-text-muted)]">
                            Walk-Forward (70/30 OOS)
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              backtestReport.walkForward?.verdict === 'ROBUST'
                                ? 'bg-[#089981]/20 text-[#089981]'
                                : backtestReport.walkForward?.verdict === 'FRAGILE'
                                  ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                                  : 'bg-[#f23645]/20 text-[#f23645]'
                            }`}
                          >
                            {backtestReport.walkForward?.verdict ?? '—'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono">
                          IS: {fmtPct(backtestReport.walkForward?.inSampleReturnPct)} (SR{' '}
                          {fmtNum(backtestReport.walkForward?.inSampleSharpe)})
                        </div>
                        <div className="text-[11px] font-mono">
                          OOS: {fmtPct(backtestReport.walkForward?.outOfSampleReturnPct)} (SR{' '}
                          {fmtNum(backtestReport.walkForward?.outOfSampleSharpe)})
                        </div>
                      </div>

                      {/* Monte Carlo 500x Bootstrap */}
                      <div className="p-2.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--tv-text-muted)]">
                            Monte Carlo ({backtestReport.monteCarlo?.iterations ?? 500}x)
                          </span>
                          <span className="text-[10px] font-mono text-[#f23645]">
                            Ruin: {fmtNum(backtestReport.monteCarlo?.ruinProbabilityPct, 1)}%
                          </span>
                        </div>
                        <div className="text-[11px] font-mono">
                          P5/Med/P95: {fmtPct(backtestReport.monteCarlo?.p5ReturnPct)} /{' '}
                          {fmtPct(backtestReport.monteCarlo?.medianReturnPct)} /{' '}
                          {fmtPct(backtestReport.monteCarlo?.p95ReturnPct)}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--tv-text-muted)]">
                          P95 Max DD: -{fmtNum(backtestReport.monteCarlo?.p95MaxDrawdownPct)}%
                        </div>
                      </div>

                      {/* 2x Execution Friction Stress */}
                      <div className="p-2.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wide text-[var(--tv-text-muted)]">
                            2x Fee + Slippage Stress
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              backtestReport.costStress?.survivesDoubleCost
                                ? 'bg-[#089981]/20 text-[#089981]'
                                : 'bg-[#f23645]/20 text-[#f23645]'
                            }`}
                          >
                            {backtestReport.costStress?.survivesDoubleCost ? 'SURVIVES 2X' : 'FAILS 2X'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono">
                          Stressed Net: {fmtPct(backtestReport.costStress?.stressedNetProfitPercent)}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--tv-text-muted)]">
                          Stressed PF: {fmtNum(backtestReport.costStress?.stressedProfitFactor)}
                        </div>
                      </div>
                    </div>

                    {/* Quant Scorecard Diagnostic Flags */}
                    {backtestReport.scorecard && backtestReport.scorecard.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {backtestReport.scorecard.flags.map((flag) => (
                          <span
                            key={flag}
                            className="px-2 py-0.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-canvas)] text-[10px] text-[var(--tv-text-secondary)]"
                          >
                            • {flag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Market Regime Breakdown Table */}
                    {backtestReport.regimes && backtestReport.regimes.length > 0 && (
                      <div className="border border-[var(--tv-border)] rounded overflow-hidden">
                        <table className="w-full text-[11px]">
                          <thead className="bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)]">
                            <tr className="border-b border-[var(--tv-border)]">
                              <th className="py-1.5 px-2.5 text-left">Market Regime (SMA50 + ADX)</th>
                              <th className="py-1.5 px-2.5 text-right">Trades</th>
                              <th className="py-1.5 px-2.5 text-right">Win Rate</th>
                              <th className="py-1.5 px-2.5 text-right">Avg Trade %</th>
                              <th className="py-1.5 px-2.5 text-right">Net Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {backtestReport.regimes.map((reg) => (
                              <tr key={reg.regime} className="border-b border-[var(--tv-border)]/50">
                                <td className="py-1 px-2.5 uppercase font-semibold">{reg.regime}</td>
                                <td className="py-1 px-2.5 text-right font-mono">{reg.trades}</td>
                                <td className="py-1 px-2.5 text-right font-mono">{reg.winRatePct.toFixed(1)}%</td>
                                <td className="py-1 px-2.5 text-right font-mono">{fmtPct(reg.avgTradePct)}</td>
                                <td
                                  className={`py-1 px-2.5 text-right font-mono ${
                                    reg.netProfit >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                                  }`}
                                >
                                  {fmtMoney(reg.netProfit)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* RIGHT-SIDE "WHY?" / STRICT CRITIQUE INTERROGATOR PANEL */}
          {whyOpen && (
            <div
              data-testid="strategy-why-panel"
              className="w-[320px] shrink-0 border-l border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]/45 flex flex-col min-h-0"
            >
              <div className="px-2.5 py-1.5 border-b border-[var(--tv-border)] flex items-center justify-between text-[11px] font-semibold">
                <span className="flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-[var(--tv-accent)]" />
                  <span>Strict &ldquo;Why?&rdquo; Rule Audit</span>
                </span>
                <button
                  type="button"
                  onClick={() => setWhyOpen(false)}
                  className="text-[10px] text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2">
                {whyResponse ? (
                  <>
                    <div className="text-[10px] text-[var(--tv-text-muted)] uppercase">
                      Provider: {whyResponse.providerUsed}
                      {whyResponse.modelLabel ? ` · ${whyResponse.modelLabel}` : ''}
                    </div>
                    {inspectedTrade && (
                      <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-canvas)] text-[11px]">
                        <div className="font-semibold">
                          Trade #{inspectedTrade.tradeNumber} · {inspectedTrade.side.toUpperCase()} ({inspectedTrade.exitReason})
                        </div>
                        <div className="text-[10px] text-[var(--tv-text-muted)]">
                          Entry {inspectedTrade.entryPrice.toFixed(2)} → Exit {inspectedTrade.exitPrice.toFixed(2)} · Net{' '}
                          {fmtMoney(inspectedTrade.netProfit)}
                        </div>
                      </div>
                    )}

                    {groundTrace && (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-[10px] text-[var(--tv-text-muted)]">
                          Bar #{groundTrace.barIndex} ({fmtBarTime(groundTrace.time)}) · Close {groundTrace.close.toFixed(2)} · Action:{' '}
                          <span className="font-semibold text-[var(--tv-text-primary)]">
                            {groundTrace.actionTaken}
                          </span>
                        </div>
                        <ConditionTraceTable
                          title={`Entry Long Checks (${groundTrace.entryLongPassed ? 'PASSED' : 'FAILED'})`}
                          checks={groundTrace.entryLongChecks}
                        />
                        <ConditionTraceTable
                          title={`Exit Long Checks (${groundTrace.exitLongPassed ? 'PASSED' : 'FAILED'})`}
                          checks={groundTrace.exitLongChecks}
                        />
                      </div>
                    )}

                    <div className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-canvas)] whitespace-pre-wrap text-[11px] leading-relaxed">
                      {whyResponse.answer}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-[var(--tv-text-muted)]">
                    Click &ldquo;Why?&rdquo; on any trade row in List of Trades or ask a question below to inspect exact boolean PASS/FAIL condition traces.
                  </div>
                )}
              </div>

              <form
                onSubmit={handleWhySubmit}
                className="p-2 border-t border-[var(--tv-border)] flex flex-col gap-1.5 shrink-0"
              >
                <input
                  data-testid="strategy-why-input"
                  value={whyQuestion}
                  onChange={(e) => setWhyQuestion(e.target.value)}
                  placeholder="Ask why a trade fired, why a bar skipped, or critique logic..."
                  className="w-full h-[28px] px-2 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)] focus:outline-none focus:border-[var(--tv-accent)]"
                />
                <button
                  type="submit"
                  disabled={whyLoading || !masterPromptDraft}
                  className="h-[26px] px-2.5 rounded bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] disabled:opacity-50 text-white text-[11px] font-medium cursor-pointer"
                >
                  {whyLoading ? 'Auditing Ground Truth...' : 'Interrogate Rule Trace'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
