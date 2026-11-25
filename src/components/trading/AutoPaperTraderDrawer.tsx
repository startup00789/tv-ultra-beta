import { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronDown,
  ChevronRight,
  OctagonAlert,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { PaperOrderLog, PaperTradingBot } from '../../../shared/types';
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

function botStatusBadge(status: PaperTradingBot['status']): string {
  if (status === 'armed') return 'bg-[#089981]/15 text-[#089981] border-[#089981]/40';
  if (status === 'paused') return 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40';
  return 'bg-[#f23645]/15 text-[#f23645] border-[#f23645]/40';
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

export function AutoPaperTraderDrawer() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bars = useWorkspaceStore((s) => s.bars);
  const watchlist = useWorkspaceStore((s) => s.watchlist);
  const paperAccount = useWorkspaceStore((s) => s.paperAccount);
  const setPaperAccount = useWorkspaceStore((s) => s.setPaperAccount);
  const refreshPaperAccount = useWorkspaceStore((s) => s.refreshPaperAccount);
  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderNotional, setOrderNotional] = useState('2500');
  const [orderSlPct, setOrderSlPct] = useState('2');
  const [orderTpPct, setOrderTpPct] = useState('5');

  useEffect(() => {
    if (!paperAccount) {
      void refreshPaperAccount();
    }
  }, [paperAccount, refreshPaperAccount]);

  const buildLatestPrices = (): Record<string, number> => {
    const prices: Record<string, number> = {};
    for (const item of watchlist) {
      if (Number.isFinite(item.last) && item.last > 0) {
        prices[item.symbol] = item.last;
      }
    }
    const lastBar = bars[bars.length - 1];
    if (lastBar && Number.isFinite(lastBar.close)) {
      prices[symbol] = lastBar.close;
    }
    return prices;
  };

  const handleKillSwitch = async () => {
    setBusyAction('kill');
    setErrorMsg(null);
    try {
      const res = await apiClient.triggerPaperKillSwitch(
        'Emergency manual Kill Switch triggered from Auto Paper Trader',
        buildLatestPrices(),
      );
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Kill switch request failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleReset = async () => {
    setBusyAction('reset');
    setErrorMsg(null);
    try {
      const res = await apiClient.resetPaperAccount(100_000);
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Reset paper account failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleBot = async (botId: string) => {
    setBusyAction(`toggle-${botId}`);
    setErrorMsg(null);
    try {
      const res = await apiClient.togglePaperBot(botId);
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to toggle bot status.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleEvaluateBot = async (bot: PaperTradingBot) => {
    setBusyAction(`eval-${bot.id}`);
    setErrorMsg(null);
    try {
      const sameSeries = bot.symbol === symbol && bot.timeframe === timeframe && bars.length > 0;
      const livePrice = sameSeries
        ? bars[bars.length - 1]?.close
        : watchlist.find((w) => w.symbol === bot.symbol)?.last;
      const res = await apiClient.evaluatePaperBots({
        symbol: bot.symbol,
        timeframe: bot.timeframe,
        bars: sameSeries ? bars : undefined,
        livePrice,
      });
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Bot evaluation failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteBot = async (botId: string) => {
    setBusyAction(`del-${botId}`);
    setErrorMsg(null);
    try {
      const res = await apiClient.deletePaperBot(botId);
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to delete bot.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleManualOrder = async (side: 'long' | 'short') => {
    setBusyAction(`manual-${side}`);
    setErrorMsg(null);
    try {
      const livePx =
        bars[bars.length - 1]?.close ??
        watchlist.find((w) => w.symbol === symbol)?.last;
      const res = await apiClient.placePaperOrder({
        symbol,
        side,
        notionalUsd: Math.max(50, Number(orderNotional) || 2500),
        stopLossPct: Math.max(0.2, Number(orderSlPct) || 2),
        takeProfitPct: Math.max(0.5, Number(orderTpPct) || 5),
        price: livePx,
        note: `Direct ${side.toUpperCase()} paper ticket on ${symbol}`,
      });
      if (res.ok) setPaperAccount(res.state);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Manual paper order failed.');
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
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to close paper position.');
    } finally {
      setBusyAction(null);
    }
  };

  const state = paperAccount;

  return (
    <div
      data-testid="auto-paper-trader-drawer"
      className="h-full flex flex-col min-h-0 bg-[var(--tv-bg-panel)] text-[12px] text-[var(--tv-text-primary)] overflow-hidden"
    >
      {/* Top Safety & Account Strip */}
      <div className="px-3 py-2 border-b border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <span
            data-testid="paper-only-badge"
            className="px-2 py-0.5 rounded-full bg-[#089981]/15 border border-[#089981]/45 text-[#089981] text-[10px] font-bold tracking-wide flex items-center gap-1"
          >
            <ShieldCheck className="w-3 h-3" />
            <span>PAPER TRADING ONLY · NO REAL MONEY</span>
          </span>

          <span
            data-testid="paper-daemon-badge"
            className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide ${
              state?.daemonRunning
                ? 'bg-[var(--tv-accent)]/15 border-[var(--tv-accent)]/45 text-[var(--tv-accent)]'
                : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-muted)]'
            }`}
          >
            {state?.daemonRunning ? 'DAEMON ACTIVE · MULTI-SYMBOL' : 'LOCAL TICK EVAL'}
          </span>

          {state?.firewall && (
            <span className="text-[10px] font-mono text-[var(--tv-text-muted)]">
              Firewall: Max {state.firewall.maxOpenPositions} Pos · {state.firewall.maxTotalExposurePct}% Exp
            </span>
          )}

          {state && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
              <span>
                <span className="text-[var(--tv-text-muted)] font-sans">Cash:</span>{' '}
                <strong>{fmtUsd(state.cash)}</strong>
              </span>
              <span>
                <span className="text-[var(--tv-text-muted)] font-sans">Equity:</span>{' '}
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
              <span>
                <span className="text-[var(--tv-text-muted)] font-sans">Daily P&amp;L:</span>{' '}
                <strong className={state.dailyPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                  {fmtUsd(state.dailyPnl)}
                </strong>{' '}
                <span className="text-[10px] text-[var(--tv-text-muted)]">
                  (Cap -{state.dailyLossLimitPct}%)
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveBottomTab('backtester')}
            className="h-[26px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] text-[11px] text-[var(--tv-text-secondary)] cursor-pointer"
          >
            + Strategy Compiler
          </button>
          <button
            type="button"
            data-testid="paper-reset-btn"
            disabled={busyAction !== null}
            onClick={() => void handleReset()}
            className="h-[26px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] text-[11px] text-[var(--tv-text-primary)] flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            data-testid="paper-kill-switch-btn"
            disabled={busyAction !== null}
            onClick={() => void handleKillSwitch()}
            className="h-[26px] px-2.5 rounded bg-[#f23645] hover:bg-[#d92635] disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-sm"
          >
            <OctagonAlert className="w-3.5 h-3.5" />
            <span>Kill Switch (Stop &amp; Flatten)</span>
          </button>
        </div>
      </div>

      {state?.killSwitchActive && (
        <div
          data-testid="paper-kill-switch-banner"
          className="px-3 py-1.5 bg-[#f23645]/15 border-b border-[#f23645]/45 text-[#f23645] text-[11px] font-medium flex items-center justify-between shrink-0"
        >
          <span>
            KILL SWITCH ACTIVE — All automated bots halted &amp; open paper positions flattened.{' '}
            {state.killSwitchReason ? `(${state.killSwitchReason})` : ''}
          </span>
          <span className="text-[10px]">Click Reset to re-enable paper deployment.</span>
        </div>
      )}

      {errorMsg && (
        <div className="px-3 py-1 bg-[#f23645]/10 border-b border-[#f23645]/35 text-[#f23645] text-[11px] shrink-0">
          {errorMsg}
        </div>
      )}

      {/* Main Content Split: Deployed Bots + Open Positions | Execution Order Audit Log */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Deployed Bots + Open Positions */}
        <div className="lg:col-span-6 border-r border-[var(--tv-border)] flex flex-col min-h-0 overflow-y-auto p-2.5 gap-3">
          {/* Quick Paper Order Ticket + Mini Equity Sparkline */}
          <div
            data-testid="paper-manual-order-form"
            className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="px-1.5 py-0.5 rounded bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] font-semibold font-mono">
                {symbol}
              </span>
              <label className="flex items-center gap-1 text-[10px] text-[var(--tv-text-muted)]">
                <span>Size $</span>
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

            {state?.equityHistory && state.equityHistory.length >= 2 && (
              <svg width={94} height={24} className="shrink-0">
                {(() => {
                  const eqs = state.equityHistory.map((h) => h.equity);
                  const minE = Math.min(...eqs);
                  const maxE = Math.max(...eqs);
                  const span = Math.max(1, maxE - minE);
                  const pts = eqs
                    .map((v, i) => {
                      const x = (i / (eqs.length - 1)) * 90 + 2;
                      const y = 21 - ((v - minE) / span) * 18;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ');
                  const up = eqs[eqs.length - 1] >= eqs[0];
                  return (
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={up ? '#089981' : '#f23645'}
                      strokeWidth={1.6}
                    />
                  );
                })()}
              </svg>
            )}
          </div>

          {/* Deployed Bots */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--tv-text-secondary)] uppercase tracking-wide">
              <span className="flex items-center gap-1">
                <Bot className="w-3.5 h-3.5 text-[var(--tv-accent)]" />
                <span>Deployed Strategy Bots ({state?.bots.length ?? 0})</span>
              </span>
            </div>
            {!state || state.bots.length === 0 ? (
              <div className="p-3 rounded border border-dashed border-[var(--tv-border)] text-[11px] text-[var(--tv-text-muted)] text-center">
                No automated paper bots deployed yet. Approve a strategy in Strategy Tester &amp; click &ldquo;Deploy to Auto Paper Trader&rdquo;.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {state.bots.map((bot) => (
                  <div
                    key={bot.id}
                    data-testid={`paper-bot-card-${bot.id}`}
                    className="p-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold truncate">{bot.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[9px] uppercase font-bold ${botStatusBadge(bot.status)}`}
                        >
                          {bot.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--tv-text-muted)] font-mono mt-0.5">
                        {bot.symbol} · {bot.timeframe} · Trades: {bot.tradesExecuted} · SL{' '}
                        {bot.spec.risk.stopLossPct}% / TP {bot.spec.risk.takeProfitPct}% · P&amp;L{' '}
                        <span className={bot.realizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                          {fmtUsd(bot.realizedPnl)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={bot.status === 'killed' || busyAction !== null}
                        onClick={() => void handleToggleBot(bot.id)}
                        title={bot.status === 'armed' ? 'Pause bot' : 'Resume bot'}
                        className="h-[24px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] disabled:opacity-40 text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        {bot.status === 'armed' ? (
                          <>
                            <Pause className="w-3 h-3" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3" />
                            <span>Resume</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={bot.status !== 'armed' || busyAction !== null}
                        onClick={() => void handleEvaluateBot(bot)}
                        title="Evaluate rules immediately on current market bars"
                        className="h-[24px] px-2 rounded border border-[var(--tv-accent)]/40 bg-[var(--tv-accent)]/15 hover:bg-[var(--tv-accent)]/25 disabled:opacity-40 text-[var(--tv-accent)] text-[10px] font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <Activity className="w-3 h-3" />
                        <span>Eval</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete bot ${bot.name}`}
                        disabled={busyAction !== null}
                        onClick={() => void handleDeleteBot(bot.id)}
                        className="h-[24px] w-[24px] rounded border border-[var(--tv-border)] hover:border-[#f23645] hover:text-[#f23645] text-[var(--tv-text-muted)] flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open Paper Positions */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-semibold text-[var(--tv-text-secondary)] uppercase tracking-wide">
              Open Paper Positions ({state?.positions.length ?? 0})
            </div>
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
                      <td colSpan={8} className="py-3 text-center text-[var(--tv-text-muted)]">
                        No open paper positions.
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
        </div>

        {/* Automated Execution Order Log + Expandable "Why?" Trace */}
        <div className="lg:col-span-6 flex flex-col min-h-0 overflow-y-auto p-2.5 gap-1.5">
          <div className="text-[11px] font-semibold text-[var(--tv-text-secondary)] uppercase tracking-wide">
            Automated Execution Audit Log ({state?.orders.length ?? 0})
          </div>
          {!state || state.orders.length === 0 ? (
            <div className="p-4 rounded border border-dashed border-[var(--tv-border)] text-[11px] text-[var(--tv-text-muted)] text-center">
              Simulated bot orders and risk halts will appear here with exact rule PASS/FAIL &ldquo;Why?&rdquo; audit traces.
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
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-[var(--tv-text-muted)] font-mono">
                          {ord.timestamp.slice(11, 19)}
                        </span>
                        {hasTrace && (
                          <button
                            type="button"
                            onClick={() => setExpandedOrderId(expanded ? null : ord.id)}
                            className="px-1.5 py-0.5 rounded bg-[var(--tv-accent)]/15 text-[var(--tv-accent)] text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer"
                          >
                            {expanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
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
