import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  OctagonAlert,
  Pause,
  Play,
  Plug,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { evaluateBarDecision } from '../../../shared/strategyEngine';
import type { PaperOrderLog, StrategyAIProvider } from '../../../shared/types';
import { apiClient, ApiError } from '../../lib/apiClient';
import { useWorkspaceStore } from '../../state/workspaceStore';

function fmtUsd(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function actionBadge(action: PaperOrderLog['action']): string {
  if (action === 'open_long' || action === 'take_profit') {
    return 'bg-[#089981]/15 text-[#089981]';
  }
  if (action === 'stop_loss' || action === 'kill_switch' || action === 'blocked_risk' || action === 'open_short') {
    return 'bg-[#f23645]/15 text-[#f23645]';
  }
  return 'bg-[var(--tv-accent)]/15 text-[var(--tv-accent)]';
}

export function ForwardTestDemoDrawer() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bars = useWorkspaceStore((s) => s.bars);
  const liveTickCount = useWorkspaceStore((s) => s.liveTickCount);
  const watchlist = useWorkspaceStore((s) => s.watchlist);
  const loadedStrategy = useWorkspaceStore((s) => s.loadedStrategy);
  const forwardTestActive = useWorkspaceStore((s) => s.forwardTestActive);
  const forwardTestAiProvider = useWorkspaceStore((s) => s.forwardTestAiProvider);
  const opencodeSelectedModel = useWorkspaceStore((s) => s.opencodeSelectedModel);
  const paperAccount = useWorkspaceStore((s) => s.paperAccount);

  const setPaperAccount = useWorkspaceStore((s) => s.setPaperAccount);
  const refreshPaperAccount = useWorkspaceStore((s) => s.refreshPaperAccount);
  const startForwardTest = useWorkspaceStore((s) => s.startForwardTest);
  const stopForwardTest = useWorkspaceStore((s) => s.stopForwardTest);
  const setForwardTestAiProvider = useWorkspaceStore((s) => s.setForwardTestAiProvider);
  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);
  const openConnectionsModal = useWorkspaceStore((s) => s.openConnectionsModal);

  const [directPrompt, setDirectPrompt] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderNotional, setOrderNotional] = useState('2500');
  const [orderSlPct, setOrderSlPct] = useState('2');
  const [orderTpPct, setOrderTpPct] = useState('5');

  useEffect(() => {
    if (!paperAccount) {
      void refreshPaperAccount();
    }
  }, [paperAccount, refreshPaperAccount]);

  const lastBarTime = bars[bars.length - 1]?.time ?? 0;
  const lastBarClose = bars[bars.length - 1]?.close ?? 0;

  // Real-time forward-test evaluation on live market ticks / candle updates
  useEffect(() => {
    if (!forwardTestActive || !loadedStrategy || bars.length < 15) return;
    if (loadedStrategy.spec.symbol.toUpperCase() !== symbol.toUpperCase()) return;
    const timer = window.setTimeout(() => {
      void apiClient
        .evaluatePaperBots({
          symbol,
          timeframe,
          bars: bars.slice(-400),
          livePrice: lastBarClose,
        })
        .then((res) => {
          if (res.ok) setPaperAccount(res.state);
        })
        .catch(() => {});
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forwardTestActive, lastBarTime, liveTickCount]);

  // Live Signal Radar computed directly against the active forming candle
  const liveRadar = useMemo(() => {
    if (!loadedStrategy || bars.length < 5) return null;
    try {
      return evaluateBarDecision(bars.slice(-300), loadedStrategy.spec, Math.min(bars.length, 300) - 1);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedStrategy, lastBarTime, lastBarClose, liveTickCount]);

  const buildLatestPrices = (): Record<string, number> => {
    const prices: Record<string, number> = {};
    for (const item of watchlist) {
      if (Number.isFinite(item.last) && item.last > 0) prices[item.symbol] = item.last;
    }
    if (lastBarClose > 0) prices[symbol] = lastBarClose;
    return prices;
  };

  const handleTellAiAndForwardTest = async (e: FormEvent) => {
    e.preventDefault();
    const raw = directPrompt.trim();
    if (!raw && !loadedStrategy) {
      setErrorMsg('Backtest a strategy first or tell DeepSeek / OpenCode / BYOK your rules above.');
      return;
    }
    setBusyAction('ai-forward');
    setErrorMsg(null);
    setStatusNote(null);
    try {
      if (!raw && loadedStrategy) {
        await startForwardTest(loadedStrategy, forwardTestAiProvider);
        setStatusNote(`Started Live Demo Forward Test for "${loadedStrategy.spec.name}".`);
        return;
      }

      const descriptionToCompile = loadedStrategy
        ? `${loadedStrategy.spec.summary}. Forward-test instruction: ${raw}`
        : raw;

      const mp = await apiClient.generateMasterPrompt({
        description: descriptionToCompile,
        symbol,
        timeframe,
        provider: forwardTestAiProvider,
        model:
          forwardTestAiProvider === 'opencode' ? (opencodeSelectedModel ?? undefined) : undefined,
        applyStrictFixes: true,
      });

      const nextLoaded = {
        spec: mp.draft.compiledSpec,
        masterPrompt: mp.draft.masterPrompt,
        loadedAt: new Date().toISOString(),
        reportSummary: loadedStrategy?.reportSummary,
      };
      await startForwardTest(nextLoaded, forwardTestAiProvider);
      setDirectPrompt('');
      setStatusNote(
        `Compiled via ${mp.draft.providerUsed.toUpperCase()} & launched Live Demo Forward Test on ${symbol} (${timeframe}).`,
      );
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to start forward test.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleManualOrder = async (side: 'long' | 'short') => {
    setBusyAction(`manual-${side}`);
    setErrorMsg(null);
    try {
      const livePx = lastBarClose || watchlist.find((w) => w.symbol === symbol)?.last;
      const res = await apiClient.placePaperOrder({
        symbol,
        side,
        notionalUsd: Math.max(50, Number(orderNotional) || 2500),
        stopLossPct: Math.max(0.2, Number(orderSlPct) || 2),
        takeProfitPct: Math.max(0.5, Number(orderTpPct) || 5),
        price: livePx,
        note: `Live Demo ${side.toUpperCase()} ticket on ${symbol}`,
      });
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Manual demo order failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClosePosition = async (botId: string, posSymbol: string) => {
    setBusyAction(`close-${botId}-${posSymbol}`);
    setErrorMsg(null);
    try {
      const res = await apiClient.closePaperPosition({
        botId,
        symbol: posSymbol,
        exitPrice: buildLatestPrices()[posSymbol],
      });
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to close demo position.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleKillSwitch = async () => {
    setBusyAction('kill');
    setErrorMsg(null);
    stopForwardTest();
    try {
      const res = await apiClient.triggerPaperKillSwitch(
        'Emergency Demo Kill Switch triggered',
        buildLatestPrices(),
      );
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Kill switch failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleReset = async () => {
    setBusyAction('reset');
    setErrorMsg(null);
    stopForwardTest();
    try {
      const res = await apiClient.resetPaperAccount(100_000);
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Reset failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const state = paperAccount;
  const btSummary = loadedStrategy?.reportSummary;

  return (
    <div
      data-testid="auto-paper-trader-drawer"
      className="h-full flex flex-col min-h-0 bg-[var(--tv-bg-panel)] text-[12px] text-[var(--tv-text-primary)] overflow-hidden"
    >
      {/* Top Demo Account & Forward-Test Status Bar */}
      <div className="px-3 py-1.5 border-b border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            data-testid="paper-only-badge"
            className="px-2 py-0.5 rounded-full bg-[#089981]/15 border border-[#089981]/45 text-[#089981] text-[10px] font-bold tracking-wide flex items-center gap-1"
          >
            <ShieldCheck className="w-3 h-3" />
            <span>PAPER TRADING ONLY · LIVE DEMO FORWARD TEST</span>
          </span>

          <span
            data-testid="forward-test-status-badge"
            className={`px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${
              forwardTestActive
                ? 'bg-[#089981]/20 border-[#089981] text-[#089981]'
                : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-muted)]'
            }`}
          >
            {forwardTestActive ? '● STREAMING FORWARD TEST ACTIVE' : '○ FORWARD TEST STANDBY'}
          </span>

          {state && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
              <span>
                <span className="text-[var(--tv-text-muted)] font-sans">Demo Cash:</span>{' '}
                <strong>{fmtUsd(state.cash)}</strong>
              </span>
              <span>
                <span className="text-[var(--tv-text-muted)] font-sans">Demo Equity:</span>{' '}
                <strong>{fmtUsd(state.equity)}</strong>
              </span>
              <span>
                <span className="text-[var(--tv-text-muted)] font-sans">Realized:</span>{' '}
                <strong className={state.realizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                  {fmtUsd(state.realizedPnl)}
                </strong>
              </span>
              <span>
                <span className="text-[var(--tv-text-muted)] font-sans">Unrealized:</span>{' '}
                <strong className={state.unrealizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                  {fmtUsd(state.unrealizedPnl)}
                </strong>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveBottomTab('backtester')}
            className="h-[25px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] text-[11px] text-[var(--tv-text-secondary)] cursor-pointer"
          >
            ← Backtester
          </button>
          <button
            type="button"
            data-testid="paper-reset-btn"
            disabled={busyAction !== null}
            onClick={() => void handleReset()}
            className="h-[25px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] text-[11px] text-[var(--tv-text-primary)] flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset $100k</span>
          </button>
          <button
            type="button"
            data-testid="paper-kill-switch-btn"
            disabled={busyAction !== null}
            onClick={() => void handleKillSwitch()}
            className="h-[25px] px-2.5 rounded bg-[#f23645] hover:bg-[#d92635] disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <OctagonAlert className="w-3.5 h-3.5" />
            <span>Kill Switch (Stop &amp; Flatten)</span>
          </button>
        </div>
      </div>

      {/* Conversational DeepSeek / OpenCode / BYOK Forward-Test Command Bar */}
      <form
        onSubmit={(e) => void handleTellAiAndForwardTest(e)}
        className="px-3 py-1.5 border-b border-[var(--tv-border)] bg-[var(--tv-bg-canvas)] flex flex-wrap items-center gap-1.5 shrink-0"
      >
        <BrainCircuit className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
        <select
          data-testid="forward-ai-provider-select"
          aria-label="Forward Test AI Engine"
          value={forwardTestAiProvider}
          onChange={(e) => setForwardTestAiProvider(e.target.value as StrategyAIProvider)}
          className="h-[26px] px-2 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)]"
        >
          <option value="deepseek">DeepSeek (V3 / R1)</option>
          <option value="opencode">OpenCode CLI</option>
          <option value="byok">Bring Your Own API</option>
          <option value="gemini">Gemini</option>
          <option value="deterministic">Instant Quant</option>
        </select>
        <button
          type="button"
          onClick={() =>
            openConnectionsModal(
              forwardTestAiProvider === 'byok'
                ? 'byok'
                : forwardTestAiProvider === 'opencode'
                  ? 'opencode'
                  : forwardTestAiProvider === 'gemini'
                    ? 'gemini'
                    : 'deepseek',
            )
          }
          title="Configure API key / model"
          className="h-[26px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[10px] text-[var(--tv-text-secondary)] flex items-center gap-1 cursor-pointer"
        >
          <Plug className="w-3 h-3" />
          <span>API Key</span>
        </button>
        <input
          type="text"
          data-testid="forward-direct-prompt-input"
          value={directPrompt}
          onChange={(e) => setDirectPrompt(e.target.value)}
          placeholder={
            loadedStrategy
              ? `Loaded "${loadedStrategy.spec.name}" — tell DeepSeek/OpenCode tweaks or click Run Forward Test...`
              : `Tell DeepSeek / OpenCode / BYOK your strategy in words to execute live in Demo on ${symbol} (${timeframe})...`
          }
          className="flex-1 min-w-[220px] h-[26px] px-2.5 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-muted)] focus:outline-none focus:border-[var(--tv-accent)]"
        />
        {forwardTestActive ? (
          <button
            type="button"
            onClick={stopForwardTest}
            className="h-[26px] px-2.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Pause className="w-3 h-3" />
            <span>Pause Forward</span>
          </button>
        ) : (
          <button
            type="submit"
            data-testid="forward-run-demo-btn"
            disabled={busyAction !== null}
            className="h-[26px] px-3 rounded bg-[#089981] hover:bg-[#089981]/90 disabled:opacity-50 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            {directPrompt.trim() ? <Send className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{directPrompt.trim() ? 'Compile & Forward Test' : 'Run Loaded Strategy in Demo'}</span>
          </button>
        )}
      </form>

      {state?.killSwitchActive && (
        <div
          data-testid="paper-kill-switch-banner"
          className="px-3 py-1 bg-[#f23645]/15 border-b border-[#f23645]/45 text-[#f23645] text-[11px] font-medium flex items-center justify-between shrink-0"
        >
          <span>
            KILL SWITCH ACTIVE — Forward test halted &amp; all demo positions flattened (killed).
          </span>
          <span className="text-[10px]">Click Reset $100k to resume demo execution.</span>
        </div>
      )}

      {errorMsg && (
        <div className="px-3 py-1 bg-[#f23645]/10 border-b border-[#f23645]/35 text-[#f23645] text-[11px] shrink-0">
          {errorMsg}
        </div>
      )}
      {statusNote && !errorMsg && (
        <div className="px-3 py-1 bg-[#089981]/10 border-b border-[#089981]/35 text-[#089981] text-[11px] shrink-0">
          {statusNote}
        </div>
      )}

      {/* Main Split: Loaded Strategy + Live Signal Radar + Demo Positions | Live Execution Log */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        <div className="lg:col-span-7 border-r border-[var(--tv-border)] flex flex-col min-h-0 overflow-y-auto p-2.5 gap-2.5">
          {/* Loaded Backtested Strategy vs Live Forward Benchmark */}
          {loadedStrategy ? (
            <div
              data-testid="forward-loaded-strategy-card"
              className="p-2.5 rounded border border-[var(--tv-accent)]/40 bg-[var(--tv-bg-elevated)] flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-[12px]">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--tv-accent)]" />
                  <span>{loadedStrategy.spec.name}</span>
                  <span className="text-[10px] font-mono text-[var(--tv-text-muted)]">
                    ({loadedStrategy.spec.symbol} · {loadedStrategy.spec.timeframe})
                  </span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-[#089981]/15 text-[#089981] text-[10px] font-bold uppercase">
                  {forwardTestActive ? 'armed · live forward' : 'loaded'}
                </span>
              </div>
              {btSummary && (
                <div className="grid grid-cols-4 gap-2 text-[10px] font-mono pt-1 border-t border-[var(--tv-border)]">
                  <div>
                    <span className="text-[var(--tv-text-muted)] block font-sans">Backtest Net</span>
                    <strong className={btSummary.netProfitPercent >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                      {btSummary.netProfitPercent >= 0 ? '+' : ''}
                      {btSummary.netProfitPercent.toFixed(2)}% ({btSummary.barCount.toLocaleString()}b)
                    </strong>
                  </div>
                  <div>
                    <span className="text-[var(--tv-text-muted)] block font-sans">Backtest Win% / PF</span>
                    <strong>
                      {btSummary.winRatePct.toFixed(1)}% · PF {btSummary.profitFactor.toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[var(--tv-text-muted)] block font-sans">Demo Live P&amp;L</span>
                    <strong
                      className={
                        (state?.realizedPnl ?? 0) + (state?.unrealizedPnl ?? 0) >= 0
                          ? 'text-[#089981]'
                          : 'text-[#f23645]'
                      }
                    >
                      {fmtUsd((state?.realizedPnl ?? 0) + (state?.unrealizedPnl ?? 0))}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[var(--tv-text-muted)] block font-sans">SL / TP Guard</span>
                    <strong>
                      -{loadedStrategy.spec.risk.stopLossPct}% / +{loadedStrategy.spec.risk.takeProfitPct}%
                    </strong>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-2.5 rounded border border-dashed border-[var(--tv-border)] text-[11px] text-[var(--tv-text-muted)]">
              Backtest any strategy in <strong>Strategy Tester (Ultra 40K)</strong> and it automatically loads here — or describe your strategy directly to DeepSeek / OpenCode / BYOK in the bar above!
            </div>
          )}

          {/* Live Forming-Candle Signal Radar */}
          {liveRadar && (
            <div className="border border-[var(--tv-border)] rounded bg-[var(--tv-bg-canvas)] overflow-hidden">
              <div className="px-2.5 py-1 bg-[var(--tv-bg-elevated)] border-b border-[var(--tv-border)] flex items-center justify-between text-[10px]">
                <span className="font-semibold uppercase tracking-wide text-[var(--tv-text-secondary)] flex items-center gap-1">
                  <Activity className="w-3 h-3 text-[#089981]" />
                  <span>Live Candle Signal Radar ({symbol} @ {lastBarClose.toFixed(2)})</span>
                </span>
                <span className="font-mono text-[var(--tv-text-muted)]">
                  Decision: {liveRadar.actionTaken}
                </span>
              </div>
              <table className="w-full text-[11px] font-mono">
                <tbody>
                  {liveRadar.entryLongChecks.map((c) => (
                    <tr key={c.conditionId} className="border-b border-[var(--tv-border)]/40 last:border-b-0">
                      <td className="py-1 px-2.5 font-sans text-[var(--tv-text-primary)]">{c.label}</td>
                      <td className="py-1 px-2 text-right">{c.leftValue !== null ? c.leftValue.toFixed(3) : 'warmup'}</td>
                      <td className="py-1 px-1 text-center text-[var(--tv-text-muted)]">{c.operator}</td>
                      <td className="py-1 px-2 text-right">{c.rightValue !== null ? c.rightValue.toFixed(3) : 'warmup'}</td>
                      <td className="py-1 px-2.5 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                            c.passed ? 'bg-[#089981]/15 text-[#089981]' : 'bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)]'
                          }`}
                        >
                          {c.passed ? 'TRIGGERED' : 'WAITING'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Direct Demo Order Ticket + Open Demo Positions */}
          <div
            data-testid="paper-manual-order-form"
            className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="px-1.5 py-0.5 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] font-semibold font-mono">
                {symbol}
              </span>
              <label className="flex items-center gap-1 text-[10px] text-[var(--tv-text-muted)]">
                <span>Demo $</span>
                <input
                  type="number"
                  data-testid="paper-order-notional-input"
                  value={orderNotional}
                  onChange={(e) => setOrderNotional(e.target.value)}
                  className="w-[62px] h-[22px] px-1.5 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] font-mono text-[11px] text-[var(--tv-text-primary)]"
                />
              </label>
              <label className="flex items-center gap-1 text-[10px] text-[var(--tv-text-muted)]">
                <span>SL%</span>
                <input
                  type="number"
                  step="0.1"
                  value={orderSlPct}
                  onChange={(e) => setOrderSlPct(e.target.value)}
                  className="w-[46px] h-[22px] px-1 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] font-mono text-[11px] text-[var(--tv-text-primary)]"
                />
              </label>
              <label className="flex items-center gap-1 text-[10px] text-[var(--tv-text-muted)]">
                <span>TP%</span>
                <input
                  type="number"
                  step="0.1"
                  value={orderTpPct}
                  onChange={(e) => setOrderTpPct(e.target.value)}
                  className="w-[46px] h-[22px] px-1 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] font-mono text-[11px] text-[var(--tv-text-primary)]"
                />
              </label>
              <button
                type="button"
                data-testid="paper-buy-long-btn"
                disabled={busyAction !== null || Boolean(state?.killSwitchActive)}
                onClick={() => void handleManualOrder('long')}
                className="h-[23px] px-2.5 rounded bg-[#089981] hover:bg-[#089981]/90 disabled:opacity-45 text-white text-[10px] font-bold cursor-pointer"
              >
                Buy Long
              </button>
              <button
                type="button"
                data-testid="paper-sell-short-btn"
                disabled={busyAction !== null || Boolean(state?.killSwitchActive)}
                onClick={() => void handleManualOrder('short')}
                className="h-[23px] px-2.5 rounded bg-[#f23645] hover:bg-[#f23645]/90 disabled:opacity-45 text-white text-[10px] font-bold cursor-pointer"
              >
                Sell Short
              </button>
            </div>
          </div>

          {/* Open Demo Positions */}
          <div className="border border-[var(--tv-border)] rounded overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)]">
                <tr className="border-b border-[var(--tv-border)]">
                  <th className="py-1 px-2 text-left">Symbol</th>
                  <th className="py-1 px-2 text-left">Side</th>
                  <th className="py-1 px-2 text-right">Qty</th>
                  <th className="py-1 px-2 text-right">Entry</th>
                  <th className="py-1 px-2 text-right">Mark</th>
                  <th className="py-1 px-2 text-right">SL / TP</th>
                  <th className="py-1 px-2 text-right">Unrealized</th>
                  <th className="py-1 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {!state || state.positions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-2.5 text-center text-[var(--tv-text-muted)]">
                      No open demo positions — waiting for next live signal trigger or manual ticket.
                    </td>
                  </tr>
                ) : (
                  state.positions.map((pos) => (
                    <tr key={`${pos.botId}-${pos.symbol}`} className="border-b border-[var(--tv-border)]/50">
                      <td className="py-1 px-2 font-semibold">{pos.symbol}</td>
                      <td className="py-1 px-2 uppercase text-[10px]">
                        <span className={pos.side === 'long' ? 'text-[#089981]' : 'text-[#f23645]'}>
                          {pos.side}
                        </span>
                      </td>
                      <td className="py-1 px-2 text-right font-mono">{pos.quantity.toFixed(4)}</td>
                      <td className="py-1 px-2 text-right font-mono">{pos.avgEntryPrice.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right font-mono">{pos.currentPrice.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right font-mono text-[10px] text-[var(--tv-text-muted)]">
                        {pos.stopLossPrice?.toFixed(2) ?? '—'} / {pos.takeProfitPrice?.toFixed(2) ?? '—'}
                      </td>
                      <td
                        className={`py-1 px-2 text-right font-mono ${
                          pos.unrealizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                        }`}
                      >
                        {fmtUsd(pos.unrealizedPnl)} ({pos.unrealizedPnlPct.toFixed(2)}%)
                      </td>
                      <td className="py-1 px-2 text-right">
                        <button
                          type="button"
                          data-testid={`paper-close-pos-${pos.symbol}`}
                          disabled={busyAction !== null}
                          onClick={() => void handleClosePosition(pos.botId, pos.symbol)}
                          className="px-1.5 py-0.5 rounded bg-[#f23645]/15 hover:bg-[#f23645]/25 text-[#f23645] text-[10px] font-semibold cursor-pointer"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Live Demo Forward Execution Audit Log */}
        <div className="lg:col-span-5 flex flex-col min-h-0 overflow-y-auto p-2.5 gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--tv-text-secondary)] uppercase tracking-wide">
            <span>Live Demo Execution Log ({state?.orders.length ?? 0})</span>
            {state?.bots && state.bots.length > 0 && (
              <span className="text-[10px] font-mono lowercase text-[var(--tv-text-muted)]">
                status: {state.bots[0].status}
              </span>
            )}
          </div>
          {!state || state.orders.length === 0 ? (
            <div className="p-4 rounded border border-dashed border-[var(--tv-border)] text-[11px] text-[var(--tv-text-muted)] text-center">
              Live forward-test fills and SL/TP executions stream here in real time with exact rule PASS/FAIL traces.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {state.orders.map((ord) => {
                const expanded = expandedOrderId === ord.id;
                const hasTrace = ord.ruleTrace && ord.ruleTrace.length > 0;
                return (
                  <div
                    key={ord.id}
                    className="rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] overflow-hidden"
                  >
                    <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold shrink-0 ${actionBadge(ord.action)}`}
                        >
                          {ord.action}
                        </span>
                        <span className="font-semibold">{ord.symbol}</span>
                        <span className="font-mono text-[10px] text-[var(--tv-text-muted)]">
                          {ord.quantity.toFixed(4)} @ {ord.price.toFixed(2)}
                        </span>
                        {ord.realizedPnl !== undefined && (
                          <span
                            className={`font-mono text-[10px] font-semibold ${
                              ord.realizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                            }`}
                          >
                            {fmtUsd(ord.realizedPnl)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-[var(--tv-text-muted)] font-mono">
                          {ord.timestamp.slice(11, 19)}
                        </span>
                        {hasTrace && (
                          <button
                            type="button"
                            onClick={() => setExpandedOrderId(expanded ? null : ord.id)}
                            className="px-1.5 py-0.5 rounded bg-[var(--tv-accent)]/15 text-[var(--tv-accent)] text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer"
                          >
                            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span>Why?</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="px-2.5 pb-1.5 text-[10px] text-[var(--tv-text-secondary)]">
                      {ord.botName}: {ord.reason}
                    </div>
                    {expanded && hasTrace && (
                      <div className="border-t border-[var(--tv-border)] bg-[var(--tv-bg-canvas)] p-2">
                        <table className="w-full text-[10px] font-mono">
                          <tbody>
                            {ord.ruleTrace.map((t) => (
                              <tr key={t.conditionId} className="border-b border-[var(--tv-border)]/40 last:border-b-0">
                                <td className="py-0.5 font-sans">{t.label}</td>
                                <td className="py-0.5 text-right">{t.leftValue?.toFixed(3) ?? 'null'}</td>
                                <td className="py-0.5 text-center text-[var(--tv-text-muted)]">{t.operator}</td>
                                <td className="py-0.5 text-right">{t.rightValue?.toFixed(3) ?? 'null'}</td>
                                <td className="py-0.5 text-right">
                                  <span className={t.passed ? 'text-[#089981]' : 'text-[#f23645]'}>
                                    {t.passed ? 'PASS' : 'FAIL'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
