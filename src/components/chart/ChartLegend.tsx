import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Settings, Trash2, X } from 'lucide-react';
import type { IndicatorConfig, Timeframe } from '../../../shared/types';
import { apiClient } from '../../lib/apiClient';
import { formatIndicatorValuesForTime } from '../../lib/indicators';
import {
  useChartAppearanceStore,
  type PrecisionOverride,
} from '../../state/chartAppearanceStore';
import { useWorkspaceStore } from '../../state/workspaceStore';

const TIMEFRAME_SECONDS_LEGEND: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000,
};

function formatCountdown(timeframe: Timeframe, nowMs: number): string {
  const stepSec = TIMEFRAME_SECONDS_LEGEND[timeframe];
  const remaining = Math.max(0, stepSec - (Math.floor(nowMs / 1000) % stepSec));
  const hrs = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function formatNum(
  val: number,
  precisionHint?: number,
  symbolHint?: string,
  precisionOverride: PrecisionOverride = 'default',
): string {
  if (precisionOverride !== 'default') {
    const dec = Number(precisionOverride);
    if (Number.isFinite(dec) && dec >= 0 && dec <= 5) {
      return val.toFixed(dec);
    }
  }
  const sym = (symbolHint ?? '').toUpperCase();
  if (
    sym.endsWith('JPY') ||
    sym === 'USDINR' ||
    sym === 'XAGUSD' ||
    sym === 'XAGEUR' ||
    sym === 'DXY'
  ) {
    return val.toFixed(3);
  }
  const ref = precisionHint ?? val;
  if (Math.abs(ref) < 10) return val.toFixed(4);
  return val.toFixed(2);
}

function formatVol(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return String(vol);
}

function isBrightColor(colorStr: string): boolean {
  const trimmed = colorStr.trim();
  if (trimmed.startsWith('#') && trimmed.length >= 7) {
    const r = parseInt(trimmed.slice(1, 3), 16);
    const g = parseInt(trimmed.slice(3, 5), 16);
    const b = parseInt(trimmed.slice(5, 7), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.65;
    }
  }
  return false;
}

export function ChartLegend() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const symbolInfo = useWorkspaceStore((s) => s.symbolInfo);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bars = useWorkspaceStore((s) => s.bars);
  const barsSource = useWorkspaceStore((s) => s.barsSource);
  const streamStatus = useWorkspaceStore((s) => s.streamStatus);
  const tickFlashBySymbol = useWorkspaceStore((s) => s.tickFlashBySymbol);
  const hoveredBar = useWorkspaceStore((s) => s.hoveredBar);
  const indicators = useWorkspaceStore((s) => s.indicators);
  const compareSymbols = useWorkspaceStore((s) => s.compareSymbols);
  const showBidAskPill = useWorkspaceStore((s) => s.showBidAskPill);

  const showSymbolTitle = useChartAppearanceStore((s) => s.showSymbolTitle);
  const symbolTitleMode = useChartAppearanceStore((s) => s.symbolTitleMode);
  const showOpenMarketStatus = useChartAppearanceStore((s) => s.showOpenMarketStatus);
  const showOhlcValues = useChartAppearanceStore((s) => s.showOhlcValues);
  const showBarChangeValues = useChartAppearanceStore((s) => s.showBarChangeValues);
  const showVolumeLegend = useChartAppearanceStore((s) => s.showVolumeLegend);
  const showIndicatorTitles = useChartAppearanceStore((s) => s.showIndicatorTitles);
  const showIndicatorArguments = useChartAppearanceStore((s) => s.showIndicatorArguments);
  const showIndicatorValues = useChartAppearanceStore((s) => s.showIndicatorValues);
  const showCountdownToBarClose = useChartAppearanceStore(
    (s) => s.showCountdownToBarClose,
  );
  const precisionOverride = useChartAppearanceStore((s) => s.precisionOverride);
  const colorBasedOnPrevClose = useChartAppearanceStore((s) => s.colorBasedOnPrevClose);
  const backgroundColor = useChartAppearanceStore((s) => s.backgroundColor);

  const toggleIndicatorVisibility = useWorkspaceStore((s) => s.toggleIndicatorVisibility);
  const updateIndicatorParams = useWorkspaceStore((s) => s.updateIndicatorParams);
  const removeIndicator = useWorkspaceStore((s) => s.removeIndicator);
  const removeCompareSymbol = useWorkspaceStore((s) => s.removeCompareSymbol);
  const showVolumeProfile = useWorkspaceStore((s) => s.showVolumeProfile);
  const showSmcOverlay = useWorkspaceStore((s) => s.showSmcOverlay);
  const showSessionsOverlay = useWorkspaceStore((s) => s.showSessionsOverlay);
  const toggleVolumeProfile = useWorkspaceStore((s) => s.toggleVolumeProfile);
  const toggleSmcOverlay = useWorkspaceStore((s) => s.toggleSmcOverlay);
  const toggleSessionsOverlay = useWorkspaceStore((s) => s.toggleSessionsOverlay);
  const setPaperAccount = useWorkspaceStore((s) => s.setPaperAccount);

  const [collapsed, setCollapsed] = useState(false);
  const [orderToast, setOrderToast] = useState<string | null>(null);
  const [editingIndId, setEditingIndId] = useState<string | null>(null);
  const [draftParams, setDraftParams] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  const marketOpen = symbolInfo?.marketOpen !== false;
  const showCountdown =
    barsSource === 'live' && marketOpen && showCountdownToBarClose;

  useEffect(() => {
    if (!showCountdown) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [showCountdown, timeframe]);

  const activeFlash = tickFlashBySymbol[symbol.toUpperCase()];
  const countdownLabel = showCountdown ? formatCountdown(timeframe, nowMs) : null;

  const displayBar = hoveredBar ?? bars[bars.length - 1] ?? null;
  const displayIdx = displayBar
    ? bars.findIndex((b) => b.time === displayBar.time)
    : bars.length - 1;
  const prevBar =
    displayIdx > 0 ? bars[displayIdx - 1] : bars[0] ?? displayBar;

  const delta = displayBar && prevBar ? displayBar.close - prevBar.close : 0;
  const deltaPct =
    displayBar && prevBar && prevBar.close > 0 ? (delta / prevBar.close) * 100 : 0;
  const isBull = displayBar
    ? colorBasedOnPrevClose && prevBar && displayIdx > 0
      ? displayBar.close >= prevBar.close
      : displayBar.close >= displayBar.open
    : true;

  const lightCanvas = isBrightColor(backgroundColor);
  const primaryTextClass = lightCanvas
    ? 'text-[#131722]'
    : 'text-[var(--tv-text-primary)]';
  const mutedTextClass = lightCanvas
    ? 'text-[#5d606b]'
    : 'text-[var(--tv-text-muted)]';

  const symbolLabelText =
    symbolTitleMode === 'ticker'
      ? `${symbol} · ${timeframe} · ${symbolInfo?.exchange ?? 'NASDAQ'}`
      : symbolTitleMode === 'description'
        ? `${symbolInfo?.name ?? symbol} · ${timeframe} · ${symbolInfo?.exchange ?? 'NASDAQ'}`
        : `${symbolInfo?.name ?? symbol} (${symbol}) · ${timeframe} · ${symbolInfo?.exchange ?? 'NASDAQ'}`;

  const openParamsEditor = (ind: IndicatorConfig) => {
    if (editingIndId === ind.instanceId) {
      setEditingIndId(null);
      return;
    }
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(ind.params)) {
      next[k] = String(v);
    }
    setDraftParams(next);
    setEditingIndId(ind.instanceId);
  };

  const applyParamsEdit = (instanceId: string) => {
    const parsed: Record<string, number> = {};
    for (const [k, raw] of Object.entries(draftParams)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        parsed[k] = n;
      }
    }
    if (Object.keys(parsed).length > 0) {
      updateIndicatorParams(instanceId, parsed);
    }
    setEditingIndId(null);
  };

  const liveBid =
    hoveredBar === null && typeof symbolInfo?.bid === 'number' ? symbolInfo.bid : undefined;
  const liveAsk =
    hoveredBar === null && typeof symbolInfo?.ask === 'number' ? symbolInfo.ask : undefined;
  const hasLiveBidAsk =
    liveBid !== undefined && liveAsk !== undefined && liveBid > 0 && liveAsk >= liveBid;

  const spread = hasLiveBidAsk
    ? Math.max(0, liveAsk - liveBid)
    : displayBar
      ? Math.max(displayBar.close < 10 ? 0.0002 : 0.02, displayBar.close * 0.00025)
      : 0;
  const sellPx = hasLiveBidAsk
    ? liveBid
    : displayBar
      ? displayBar.close - spread / 2
      : 0;
  const buyPx = hasLiveBidAsk
    ? liveAsk
    : displayBar
      ? displayBar.close + spread / 2
      : 0;

  return (
    <div
      data-testid="chart-legend"
      className="absolute top-2.5 left-3 z-20 flex flex-col gap-1 pointer-events-none select-none max-w-[calc(100%-88px)]"
    >
      {/* Primary Symbol + OHLCV Readout Row */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
        {showSymbolTitle && (
          <>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--tv-accent)]/20 text-[var(--tv-accent)] text-[10px] font-bold">
              {symbol.slice(0, 2)}
            </span>
            <span className={`font-semibold ${primaryTextClass}`}>{symbolLabelText}</span>
          </>
        )}
        {showOpenMarketStatus && (
          <span
            title={
              marketOpen
                ? 'Market session is open and trading'
                : 'Exchange regular session is currently closed; 24/7 crypto pairs stream live'
            }
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              marketOpen ? 'text-[#089981]' : 'text-[#787b86]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                marketOpen
                  ? streamStatus === 'live'
                    ? 'bg-[#089981] animate-pulse'
                    : 'bg-[#089981]'
                  : 'bg-[#787b86]'
              }`}
            />
            {marketOpen ? 'Open' : 'Market Closed'}
          </span>
        )}
        {barsSource && (
          <span
            data-testid="chart-feed-badge"
            className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wide tabular-nums ${
              barsSource === 'live'
                ? activeFlash && nowMs - activeFlash.at < 700
                  ? 'bg-[#089981]/30 text-[#089981]'
                  : 'bg-[#089981]/15 text-[#089981]'
                : 'bg-[var(--tv-bg-hover)] text-[var(--tv-text-muted)]'
            }`}
          >
            <span>{barsSource === 'live' ? 'LIVE' : 'SIM'}</span>
            {countdownLabel && <span className="opacity-85">· {countdownLabel}</span>}
          </span>
        )}

        {displayBar && (showOhlcValues || showBarChangeValues) && (
          <div className="flex items-center gap-2 text-[12px] tabular-nums">
            {showOhlcValues && (
              <>
                <span>
                  <span className={mutedTextClass}>O</span>
                  <span className={isBull ? 'text-[#089981]' : 'text-[#f23645]'}>
                    {formatNum(
                      displayBar.open,
                      displayBar.close,
                      symbol,
                      precisionOverride,
                    )}
                  </span>
                </span>
                <span>
                  <span className={mutedTextClass}>H</span>
                  <span className={isBull ? 'text-[#089981]' : 'text-[#f23645]'}>
                    {formatNum(
                      displayBar.high,
                      displayBar.close,
                      symbol,
                      precisionOverride,
                    )}
                  </span>
                </span>
                <span>
                  <span className={mutedTextClass}>L</span>
                  <span className={isBull ? 'text-[#089981]' : 'text-[#f23645]'}>
                    {formatNum(
                      displayBar.low,
                      displayBar.close,
                      symbol,
                      precisionOverride,
                    )}
                  </span>
                </span>
                <span>
                  <span className={mutedTextClass}>C</span>
                  <span className={isBull ? 'text-[#089981]' : 'text-[#f23645]'}>
                    {formatNum(
                      displayBar.close,
                      displayBar.close,
                      symbol,
                      precisionOverride,
                    )}
                  </span>
                </span>
              </>
            )}
            {showBarChangeValues && (
              <span className={delta >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                {delta >= 0 ? '+' : ''}
                {formatNum(delta, displayBar.close, symbol, precisionOverride)} (
                {delta >= 0 ? '+' : ''}
                {deltaPct.toFixed(2)}%)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Compact Interactive 1-Click Paper Bid/Ask Spread Pill (TradingView parity) */}
      {showBidAskPill && displayBar && (
        <div
          style={{ pointerEvents: 'auto' }}
          className="flex items-center gap-1.5 text-[10px] tabular-nums"
        >
          <button
            type="button"
            data-testid="legend-sell-btn"
            title={`1-Click Paper Market Sell ${symbol} @ ${formatNum(sellPx, displayBar.close, symbol, precisionOverride)}`}
            onClick={() => {
              void apiClient
                .placePaperOrder({
                  symbol,
                  side: 'short',
                  notionalUsd: 2500,
                  price: sellPx,
                  stopLossPct: 2,
                  takeProfitPct: 5,
                  note: '1-Click Chart Legend SELL',
                })
                .then((res) => {
                  if (res.ok) {
                    setPaperAccount(res.state);
                    setOrderToast(
                      `SHORT ${symbol} @ ${formatNum(sellPx, displayBar.close, symbol, precisionOverride)}`,
                    );
                    window.setTimeout(() => setOrderToast(null), 2200);
                  }
                })
                .catch((err) => {
                  setOrderToast(err instanceof Error ? err.message : 'Order blocked');
                  window.setTimeout(() => setOrderToast(null), 2200);
                });
            }}
            className="inline-flex items-center rounded-[4px] border border-[#f23645]/70 bg-[var(--tv-bg-canvas)]/90 hover:bg-[#f23645]/20 px-1.5 py-0.5 text-[#f23645] font-semibold cursor-pointer transition-colors"
          >
            {formatNum(sellPx, displayBar.close, symbol, precisionOverride)}{' '}
            <span className="ml-1 opacity-75">SELL</span>
          </button>
          <span className={mutedTextClass}>
            {displayBar.close < 10 ? spread.toFixed(4) : spread.toFixed(2)}
          </span>
          <button
            type="button"
            data-testid="legend-buy-btn"
            title={`1-Click Paper Market Buy ${symbol} @ ${formatNum(buyPx, displayBar.close, symbol, precisionOverride)}`}
            onClick={() => {
              void apiClient
                .placePaperOrder({
                  symbol,
                  side: 'long',
                  notionalUsd: 2500,
                  price: buyPx,
                  stopLossPct: 2,
                  takeProfitPct: 5,
                  note: '1-Click Chart Legend BUY',
                })
                .then((res) => {
                  if (res.ok) {
                    setPaperAccount(res.state);
                    setOrderToast(
                      `LONG ${symbol} @ ${formatNum(buyPx, displayBar.close, symbol, precisionOverride)}`,
                    );
                    window.setTimeout(() => setOrderToast(null), 2200);
                  }
                })
                .catch((err) => {
                  setOrderToast(err instanceof Error ? err.message : 'Order blocked');
                  window.setTimeout(() => setOrderToast(null), 2200);
                });
            }}
            className="inline-flex items-center rounded-[4px] border border-[#2962ff]/70 bg-[var(--tv-bg-canvas)]/90 hover:bg-[#2962ff]/20 px-1.5 py-0.5 text-[#2962ff] font-semibold cursor-pointer transition-colors"
          >
            {formatNum(buyPx, displayBar.close, symbol, precisionOverride)}{' '}
            <span className="ml-1 opacity-75">BUY</span>
          </button>

          {/* Instant Smart Overlay Toggles */}
          <button
            type="button"
            data-testid="legend-toggle-vp"
            onClick={toggleVolumeProfile}
            title="Toggle Visible-Range Volume Profile (POC / VAH / VAL)"
            className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase cursor-pointer ${
              showVolumeProfile
                ? 'border-[#f59e0b]/60 bg-[#f59e0b]/20 text-[#f59e0b]'
                : 'border-[var(--tv-border)] bg-[var(--tv-bg-canvas)]/80 text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)]'
            }`}
          >
            VPVR
          </button>
          <button
            type="button"
            data-testid="legend-toggle-smc"
            onClick={toggleSmcOverlay}
            title="Toggle Smart Money Concepts (BOS / CHoCH / FVG / Order Blocks)"
            className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase cursor-pointer ${
              showSmcOverlay
                ? 'border-[#089981]/60 bg-[#089981]/20 text-[#089981]'
                : 'border-[var(--tv-border)] bg-[var(--tv-bg-canvas)]/80 text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)]'
            }`}
          >
            SMC
          </button>
          <button
            type="button"
            data-testid="legend-toggle-sessions"
            onClick={toggleSessionsOverlay}
            title="Toggle Session Killzones (Asia / London / NY) & Liquidity Draws (PDH / PDL / PWH / PWL)"
            className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase cursor-pointer ${
              showSessionsOverlay
                ? 'border-[#a855f7]/60 bg-[#a855f7]/20 text-[#a855f7]'
                : 'border-[var(--tv-border)] bg-[var(--tv-bg-canvas)]/80 text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)]'
            }`}
          >
            SESSIONS
          </button>
          {orderToast && (
            <span className="px-2 py-0.5 rounded bg-[var(--tv-bg-elevated)] border border-[#089981]/50 text-[#089981] font-semibold">
              {orderToast}
            </span>
          )}
        </div>
      )}

      {/* Volume + Legend Collapse Toggle */}
      {displayBar &&
        (showVolumeLegend || indicators.length > 0 || compareSymbols.length > 0) && (
          <div className="flex items-center gap-2 text-[11px] tabular-nums">
            {showVolumeLegend && (
              <>
                <span className={mutedTextClass}>Vol</span>
                <span className={isBull ? 'text-[#089981]' : 'text-[#f23645]'}>
                  {formatVol(displayBar.volume)}
                </span>
              </>
            )}
            {(indicators.length > 0 || compareSymbols.length > 0) && (
              <button
                type="button"
                style={{ pointerEvents: 'auto' }}
                aria-label={collapsed ? 'Expand indicator legend' : 'Collapse indicator legend'}
                onClick={() => setCollapsed((c) => !c)}
                className="w-5 h-4 rounded bg-[var(--tv-bg-elevated)]/80 border border-[var(--tv-border)] flex items-center justify-center text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
              >
                {collapsed ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronUp className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        )}

      {/* Compare Symbols Chips */}
      {!collapsed && compareSymbols.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {compareSymbols.map((sym) => (
            <div
              key={sym}
              style={{ pointerEvents: 'auto' }}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[var(--tv-bg-elevated)]/90 border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
            >
              <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
              <span>Compare: {sym}</span>
              <button
                type="button"
                aria-label={`Remove compare ${sym}`}
                onClick={() => removeCompareSymbol(sym)}
                className="text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active Technical Indicators */}
      {!collapsed && indicators.length > 0 && (
        <div className="flex flex-col items-start gap-1">
          {indicators.map((ind) => {
            const values = formatIndicatorValuesForTime(ind, bars, displayBar?.time);
            const paramList = Object.values(ind.params).join(', ');
            return (
              <div key={ind.instanceId} className="relative flex flex-col items-start">
                <div
                  data-testid={`legend-indicator-${ind.instanceId}`}
                  style={{ pointerEvents: 'auto' }}
                  className={`group/ind inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-[4px] bg-[var(--tv-bg-canvas)]/75 hover:bg-[var(--tv-bg-elevated)]/95 border border-transparent hover:border-[var(--tv-border)] text-[11px] transition-colors ${
                    !ind.visible ? 'opacity-50' : ''
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: ind.color }}
                  />
                  {(showIndicatorTitles || (showIndicatorArguments && paramList)) && (
                    <span className="font-medium text-[var(--tv-text-primary)]">
                      {showIndicatorTitles ? ind.name : ''}
                      {showIndicatorArguments && paramList
                        ? `${showIndicatorTitles ? ' ' : ''}(${paramList})`
                        : ''}
                    </span>
                  )}
                  {showIndicatorValues && values.length > 0 && (
                    <span
                      className="tabular-nums font-medium"
                      style={{ color: ind.color }}
                    >
                      {values.join(' ')}
                    </span>
                  )}

                  <div className="flex items-center gap-0.5 ml-1">
                    <button
                      type="button"
                      data-testid={`legend-indicator-toggle-${ind.instanceId}`}
                      aria-label={ind.visible ? `Hide ${ind.name}` : `Show ${ind.name}`}
                      title={ind.visible ? 'Hide' : 'Show'}
                      onClick={() => toggleIndicatorVisibility(ind.instanceId)}
                      className="w-5 h-5 rounded flex items-center justify-center text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] hover:bg-[var(--tv-bg-hover)] cursor-pointer"
                    >
                      {ind.visible ? (
                        <Eye className="w-3 h-3" />
                      ) : (
                        <EyeOff className="w-3 h-3" />
                      )}
                    </button>

                    <button
                      type="button"
                      data-testid={`legend-indicator-settings-${ind.instanceId}`}
                      aria-label={`Settings for ${ind.name}`}
                      title="Settings"
                      onClick={() => openParamsEditor(ind)}
                      className="w-5 h-5 rounded flex items-center justify-center text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] hover:bg-[var(--tv-bg-hover)] cursor-pointer"
                    >
                      <Settings className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      data-testid={`legend-indicator-remove-${ind.instanceId}`}
                      aria-label={`Remove ${ind.name}`}
                      title="Remove"
                      onClick={() => removeIndicator(ind.instanceId)}
                      className="w-5 h-5 rounded flex items-center justify-center text-[var(--tv-text-muted)] hover:text-[#f23645] hover:bg-[var(--tv-bg-hover)] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {editingIndId === ind.instanceId && (
                  <div
                    style={{ pointerEvents: 'auto' }}
                    className="mt-1 z-30 p-2 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-xl flex items-center gap-2 text-[11px]"
                  >
                    {Object.entries(draftParams).length === 0 ? (
                      <span className="text-[var(--tv-text-muted)]">No editable inputs</span>
                    ) : (
                      Object.entries(draftParams).map(([key, val]) => (
                        <label key={key} className="flex items-center gap-1">
                          <span className="text-[var(--tv-text-muted)] capitalize">
                            {key}:
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={val}
                            onChange={(e) =>
                              setDraftParams((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="w-14 h-6 px-1.5 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] tabular-nums"
                          />
                        </label>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => applyParamsEdit(ind.instanceId)}
                      className="h-6 px-2 rounded bg-[var(--tv-accent)] text-white font-medium cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
