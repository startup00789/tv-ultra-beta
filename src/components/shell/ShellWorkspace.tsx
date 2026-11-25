import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { subscribeMarketStream } from '../../lib/marketStream';
import { useWorkspaceStore, type IndicatorType } from '../../state/workspaceStore';
import { ShellBottomDrawer } from './ShellBottomDrawer';
import { ShellChartArea } from './ShellChartArea';
import { ShellLeftToolbar } from './ShellLeftToolbar';
import { ShellRightSidebar } from './ShellRightSidebar';
import { ShellTopToolbar } from './ShellTopToolbar';
import type { WorkspaceSlots } from './slots';

const FALLBACK_INDICATORS: ReadonlyArray<{
  id: IndicatorType;
  name: string;
  pane: 'main' | 'sub';
  color: string;
  params: Record<string, number>;
}> = [
  { id: 'sma', name: 'Simple Moving Average', pane: 'main', color: '#2962ff', params: { period: 20 } },
  { id: 'ema', name: 'Exponential Moving Average', pane: 'main', color: '#f59e0b', params: { period: 20 } },
  { id: 'bb', name: 'Bollinger Bands', pane: 'main', color: '#089981', params: { period: 20, stdDev: 2 } },
  { id: 'vwap', name: 'VWAP', pane: 'main', color: '#a855f7', params: {} },
  { id: 'rsi', name: 'Relative Strength Index', pane: 'sub', color: '#a855f7', params: { period: 14 } },
  { id: 'macd', name: 'MACD', pane: 'sub', color: '#2962ff', params: { fast: 12, slow: 26, signal: 9 } },
  { id: 'atr', name: 'Average True Range', pane: 'sub', color: '#f23645', params: { period: 14 } },
];

interface ShellWorkspaceProps {
  slots?: WorkspaceSlots;
}

export function ShellWorkspace({ slots }: ShellWorkspaceProps) {
  const initializeWorkspace = useWorkspaceStore((s) => s.initializeWorkspace);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);

  const symbolSearchOpen = useWorkspaceStore((s) => s.symbolSearchOpen);
  const indicatorsModalOpen = useWorkspaceStore((s) => s.indicatorsModalOpen);
  const chartSettingsOpen = useWorkspaceStore((s) => s.chartSettingsOpen);
  const connectionsModalOpen = useWorkspaceStore((s) => s.connectionsModalOpen);

  const setSymbolSearchOpen = useWorkspaceStore((s) => s.setSymbolSearchOpen);
  const setIndicatorsModalOpen = useWorkspaceStore((s) => s.setIndicatorsModalOpen);
  const setChartSettingsOpen = useWorkspaceStore((s) => s.setChartSettingsOpen);
  const closeConnectionsModal = useWorkspaceStore((s) => s.closeConnectionsModal);
  const setMainMenuOpen = useWorkspaceStore((s) => s.setMainMenuOpen);

  const catalogSymbols = useWorkspaceStore((s) => s.catalogSymbols);
  const setSymbol = useWorkspaceStore((s) => s.setSymbol);
  const addIndicator = useWorkspaceStore((s) => s.addIndicator);
  const theme = useWorkspaceStore((s) => s.theme);
  const setTheme = useWorkspaceStore((s) => s.setTheme);
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const watchlistTickers = useWorkspaceStore((s) => s.watchlistTickers);
  const liveMarketData = useWorkspaceStore((s) => s.liveMarketData);
  const setStreamStatus = useWorkspaceStore((s) => s.setStreamStatus);
  const applyLiveBarTick = useWorkspaceStore((s) => s.applyLiveBarTick);
  const applyLiveQuoteTick = useWorkspaceStore((s) => s.applyLiveQuoteTick);
  const refreshLivePrices = useWorkspaceStore((s) => s.refreshLivePrices);
  const bars = useWorkspaceStore((s) => s.bars);
  const liveTickCount = useWorkspaceStore((s) => s.liveTickCount);
  const paperAccount = useWorkspaceStore((s) => s.paperAccount);
  const setPaperAccount = useWorkspaceStore((s) => s.setPaperAccount);
  const lastPaperEvalAtRef = useRef(0);

  const [symbolQuery, setSymbolQuery] = useState('');
  const [indicatorQuery, setIndicatorQuery] = useState('');

  const watchlistKey = useMemo(
    () => [...watchlistTickers].sort().join(','),
    [watchlistTickers],
  );

  useEffect(() => {
    void initializeWorkspace();
  }, [initializeWorkspace]);

  useEffect(() => {
    if (!liveMarketData) return;
    return subscribeMarketStream({
      symbol,
      timeframe,
      watchlist: watchlistKey ? watchlistKey.split(',') : [],
      onStatus: (status) => setStreamStatus(status),
      onBar: applyLiveBarTick,
      onQuote: applyLiveQuoteTick,
    });
  }, [
    applyLiveBarTick,
    applyLiveQuoteTick,
    liveMarketData,
    setStreamStatus,
    symbol,
    timeframe,
    watchlistKey,
  ]);

  useEffect(() => {
    if (!liveMarketData) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshLivePrices();
      }
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [liveMarketData, refreshLivePrices]);

  // Throttled live evaluation of armed Auto Paper Trading bots
  useEffect(() => {
    const bots = paperAccount?.bots ?? [];
    if (paperAccount?.killSwitchActive) return;
    const hasArmedForChart = bots.some(
      (b) => b.status === 'armed' && b.symbol === symbol && b.timeframe === timeframe,
    );
    if (!hasArmedForChart || bars.length === 0) return;

    const now = Date.now();
    if (now - lastPaperEvalAtRef.current < 1500) return;
    lastPaperEvalAtRef.current = now;

    const latestClose = bars[bars.length - 1]?.close;
    let cancelled = false;
    void apiClient
      .evaluatePaperBots({
        symbol,
        timeframe,
        bars,
        livePrice: latestClose,
      })
      .then((res) => {
        if (!cancelled && res.ok) {
          setPaperAccount(res.state);
        }
      })
      .catch(() => {
        // Non-fatal background paper bot evaluation
      });
    return () => {
      cancelled = true;
    };
  }, [
    bars,
    liveTickCount,
    paperAccount?.bots,
    paperAccount?.killSwitchActive,
    setPaperAccount,
    symbol,
    timeframe,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (e.key === 'Escape') {
        setSymbolSearchOpen(false);
        setIndicatorsModalOpen(false);
        setChartSettingsOpen(false);
        closeConnectionsModal();
        setMainMenuOpen(false);
        return;
      }

      if (isTyping) return;

      if (e.key === '/') {
        e.preventDefault();
        setIndicatorsModalOpen(true);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    closeConnectionsModal,
    redo,
    setChartSettingsOpen,
    setIndicatorsModalOpen,
    setMainMenuOpen,
    setSymbolSearchOpen,
    undo,
  ]);

  const filteredSymbols = useMemo(() => {
    const q = symbolQuery.trim().toLowerCase();
    if (!q) return catalogSymbols;
    return catalogSymbols.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.exchange.toLowerCase().includes(q),
    );
  }, [catalogSymbols, symbolQuery]);

  const filteredIndicators = useMemo(() => {
    const q = indicatorQuery.trim().toLowerCase();
    if (!q) return FALLBACK_INDICATORS;
    return FALLBACK_INDICATORS.filter(
      (ind) =>
        ind.id.toLowerCase().includes(q) || ind.name.toLowerCase().includes(q),
    );
  }, [indicatorQuery]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[var(--tv-bg-gutter)] text-[var(--tv-text-primary)] p-[4px] flex flex-col gap-[4px]">
      {/* Zone 1: Top Toolbar */}
      <ShellTopToolbar slots={slots} />

      {/* Lower Workspace Row: Left Rail + Center Area + Right Sidebar */}
      <div className="flex-1 min-h-0 flex gap-[4px]">
        {/* Zone 2: Left Drawing Toolbar */}
        <ShellLeftToolbar slots={slots} />

        {/* Zone 3 + Zone 5: Main Chart Area + Collapsible Bottom Drawer */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-[4px]">
          <ShellChartArea slots={slots} />
          <ShellBottomDrawer slots={slots} />
        </div>

        {/* Zone 4: Right Panel + Far-Right Icon Rail */}
        <ShellRightSidebar slots={slots} />
      </div>

      {/* Modal Slot: Symbol Search */}
      {symbolSearchOpen &&
        (slots?.symbolSearchModal ? (
          slots.symbolSearchModal
        ) : (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div
              data-testid="symbol-search-modal"
              className="w-full max-w-[520px] rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--tv-border)] flex items-center justify-between">
                <span className="font-semibold text-[14px]">Symbol Search</span>
                <button
                  type="button"
                  aria-label="Close symbol search"
                  onClick={() => setSymbolSearchOpen(false)}
                  className="text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 border-b border-[var(--tv-border)]">
                <input
                  type="text"
                  data-testid="symbol-search-input"
                  aria-label="Search symbols"
                  autoFocus
                  value={symbolQuery}
                  onChange={(e) => setSymbolQuery(e.target.value)}
                  placeholder="Search symbol or company..."
                  className="w-full h-[34px] px-3 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[13px] text-[var(--tv-text-primary)] focus:outline-none focus:border-[var(--tv-accent)]"
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto divide-y divide-[var(--tv-border-subtle)]">
                {filteredSymbols.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => {
                      void setSymbol(item.symbol);
                      setSymbolSearchOpen(false);
                    }}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-[var(--tv-bg-hover)] text-left cursor-pointer"
                  >
                    <div>
                      <span className="font-semibold text-[var(--tv-text-primary)]">
                        {item.symbol}
                      </span>
                      <span className="ml-2 text-[12px] text-[var(--tv-text-muted)]">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-[11px] uppercase text-[var(--tv-text-muted)]">
                      {item.assetClass} · {item.exchange}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}

      {/* Modal Slot: Indicators */}
      {indicatorsModalOpen &&
        (slots?.indicatorsModal ? (
          slots.indicatorsModal
        ) : (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div
              data-testid="indicators-modal"
              className="w-full max-w-[500px] rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--tv-border)] flex items-center justify-between">
                <span className="font-semibold text-[14px]">
                  Indicators, Metrics &amp; Strategies
                </span>
                <button
                  type="button"
                  aria-label="Close indicators modal"
                  onClick={() => setIndicatorsModalOpen(false)}
                  className="text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 border-b border-[var(--tv-border)]">
                <input
                  type="text"
                  data-testid="indicators-search-input"
                  aria-label="Search indicators"
                  autoFocus
                  value={indicatorQuery}
                  onChange={(e) => setIndicatorQuery(e.target.value)}
                  placeholder="Search indicators (SMA, RSI, MACD, Bollinger)..."
                  className="w-full h-[34px] px-3 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[13px] text-[var(--tv-text-primary)] focus:outline-none focus:border-[var(--tv-accent)]"
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto divide-y divide-[var(--tv-border-subtle)]">
                {filteredIndicators.map((ind) => (
                  <button
                    key={ind.id}
                    type="button"
                    data-testid={`indicator-option-${ind.id}`}
                    onClick={() => {
                      addIndicator({
                        id: ind.id,
                        name: ind.name,
                        pane: ind.pane,
                        visible: true,
                        color: ind.color,
                        params: ind.params,
                      });
                      setIndicatorsModalOpen(false);
                    }}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-[var(--tv-bg-hover)] text-left cursor-pointer"
                  >
                    <span className="text-[13px] text-[var(--tv-text-primary)]">
                      {ind.name}
                    </span>
                    <span className="text-[11px] uppercase text-[var(--tv-text-muted)]">
                      {ind.pane === 'main' ? 'Overlay' : 'Sub-pane'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}

      {/* Modal Slot: Chart Settings */}
      {chartSettingsOpen &&
        (slots?.chartSettingsModal ? (
          slots.chartSettingsModal
        ) : (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="w-full max-w-[420px] rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--tv-border)] flex items-center justify-between">
                <span className="font-semibold text-[14px]">Chart Settings</span>
                <button
                  type="button"
                  aria-label="Close chart settings"
                  onClick={() => setChartSettingsOpen(false)}
                  className="text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-3 text-[13px]">
                <div className="flex items-center justify-between">
                  <span>Color Theme</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`px-3 py-1 rounded-[4px] border text-[12px] cursor-pointer ${
                        theme === 'dark'
                          ? 'border-[var(--tv-accent)] text-[var(--tv-accent)]'
                          : 'border-[var(--tv-border)] text-[var(--tv-text-secondary)]'
                      }`}
                    >
                      Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`px-3 py-1 rounded-[4px] border text-[12px] cursor-pointer ${
                        theme === 'light'
                          ? 'border-[var(--tv-accent)] text-[var(--tv-accent)]'
                          : 'border-[var(--tv-border)] text-[var(--tv-text-secondary)]'
                      }`}
                    >
                      Light
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

      {/* Modal Slot: Connections */}
      {connectionsModalOpen &&
        (slots?.connectionsModal ? (
          slots.connectionsModal
        ) : (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div
              data-testid="connections-modal"
              className="w-full max-w-[520px] rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--tv-border)] flex items-center justify-between">
                <span className="font-semibold text-[14px]">
                  Connections &amp; Integrations
                </span>
                <button
                  type="button"
                  aria-label="Close connections modal"
                  onClick={closeConnectionsModal}
                  className="text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 text-[13px] text-[var(--tv-text-secondary)] flex flex-col gap-3">
                <p>
                  Configure OpenCode, Gemini, and BigQuery AI/ML providers once the connectivity module is mounted.
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeConnectionsModal}
                    className="px-3 py-1.5 rounded-[4px] bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] text-[12px] cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
