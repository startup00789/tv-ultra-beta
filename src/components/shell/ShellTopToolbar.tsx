import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Camera,
  CandlestickChart,
  ChevronDown,
  Clock,
  Cpu,
  Database,
  FlaskConical,
  Maximize2,
  Menu,
  Moon,
  Plug,
  Plus,
  Redo2,
  Rewind,
  Search,
  Settings,
  Sparkles,
  Sun,
  Undo2,
} from 'lucide-react';
import {
  useWorkspaceStore,
  type ChartStyle,
  type ProviderConnectionStatus,
  type Timeframe,
} from '../../state/workspaceStore';
import type { WorkspaceSlots } from './slots';

const PINNED_TIMEFRAMES: readonly Timeframe[] = [
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1D',
  '1W',
  '1M',
];

const TIMEFRAME_GROUPS: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ tf: Timeframe; title: string }>;
}> = [
  {
    label: 'MINUTES',
    items: [
      { tf: '1m', title: '1 minute' },
      { tf: '5m', title: '5 minutes' },
      { tf: '15m', title: '15 minutes' },
    ],
  },
  {
    label: 'HOURS',
    items: [
      { tf: '1h', title: '1 hour' },
      { tf: '4h', title: '4 hours' },
    ],
  },
  {
    label: 'DAYS / WEEKS / MONTHS',
    items: [
      { tf: '1D', title: '1 day' },
      { tf: '1W', title: '1 week' },
      { tf: '1M', title: '1 month' },
    ],
  },
];

const CHART_STYLE_OPTIONS: ReadonlyArray<{ id: ChartStyle; label: string }> = [
  { id: 'candles', label: 'Candles' },
  { id: 'hollow_candles', label: 'Hollow candles' },
  { id: 'bars', label: 'Bars' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
];

function statusDotColor(status: ProviderConnectionStatus): string {
  switch (status) {
    case 'connected':
      return '#089981';
    case 'sandbox':
      return '#2962ff';
    case 'testing':
      return '#f59e0b';
    case 'error':
      return '#f23645';
    default:
      return '#787b86';
  }
}

interface ShellTopToolbarProps {
  slots?: WorkspaceSlots;
}

export function ShellTopToolbar({ slots }: ShellTopToolbarProps) {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const symbolInfo = useWorkspaceStore((s) => s.symbolInfo);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const chartStyle = useWorkspaceStore((s) => s.chartStyle);
  const theme = useWorkspaceStore((s) => s.theme);
  const undoCount = useWorkspaceStore((s) => s.undoStack.length);
  const redoCount = useWorkspaceStore((s) => s.redoStack.length);
  const connectionStatuses = useWorkspaceStore((s) => s.connectionStatuses);
  const mainMenuOpen = useWorkspaceStore((s) => s.mainMenuOpen);
  const liveMarketData = useWorkspaceStore((s) => s.liveMarketData);
  const barsSource = useWorkspaceStore((s) => s.barsSource);
  const streamStatus = useWorkspaceStore((s) => s.streamStatus);
  const liveTickCount = useWorkspaceStore((s) => s.liveTickCount);
  const lastDataUpdatedAt = useWorkspaceStore((s) => s.lastDataUpdatedAt);

  const setTimeframe = useWorkspaceStore((s) => s.setTimeframe);
  const setLiveMarketData = useWorkspaceStore((s) => s.setLiveMarketData);
  const setChartStyle = useWorkspaceStore((s) => s.setChartStyle);
  const toggleTheme = useWorkspaceStore((s) => s.toggleTheme);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);
  const setSymbolSearchOpen = useWorkspaceStore((s) => s.setSymbolSearchOpen);
  const setIndicatorsModalOpen = useWorkspaceStore((s) => s.setIndicatorsModalOpen);
  const setChartSettingsOpen = useWorkspaceStore((s) => s.setChartSettingsOpen);
  const setMainMenuOpen = useWorkspaceStore((s) => s.setMainMenuOpen);
  const openConnectionsModal = useWorkspaceStore((s) => s.openConnectionsModal);
  const toggleRightTab = useWorkspaceStore((s) => s.toggleRightTab);
  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);
  const replayActive = useWorkspaceStore((s) => s.replayActive);
  const startReplay = useWorkspaceStore((s) => s.startReplay);
  const stopReplay = useWorkspaceStore((s) => s.stopReplay);
  const forwardTestActive = useWorkspaceStore((s) => s.forwardTestActive);

  const [tfMenuOpen, setTfMenuOpen] = useState(false);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setTfMenuOpen(false);
        setStyleMenuOpen(false);
        if (mainMenuOpen) setMainMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [mainMenuOpen, setMainMenuOpen]);

  const anyAiConnected =
    connectionStatuses.opencode === 'connected' ||
    connectionStatuses.gemini === 'connected';
  const aiDot = anyAiConnected
    ? '#089981'
    : connectionStatuses.opencode === 'error' || connectionStatuses.gemini === 'error'
      ? '#f23645'
      : '#787b86';

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleSnapshot = () => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="chart-canvas-pane"] canvas',
    );
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${symbol}-${timeframe}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // Ignore tainted/unmounted canvas errors
    }
  };

  return (
    <header
      ref={toolbarRef}
      className="h-[38px] shrink-0 flex items-center gap-[4px] w-full"
    >
      {/* Top-Left Main Menu Button (52x38 matching TradingView layout__area--topleft) */}
      <div className="relative w-[52px] h-full shrink-0 tv-panel flex items-center justify-center">
        <button
          type="button"
          onClick={() => {
            setMainMenuOpen(!mainMenuOpen);
            setTfMenuOpen(false);
            setStyleMenuOpen(false);
          }}
          aria-label="Main menu"
          title="Main menu"
          className="w-[34px] h-[28px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-primary)] hover:bg-[var(--tv-bg-hover)] transition-colors cursor-pointer"
        >
          <Menu className="w-4 h-4" strokeWidth={1.6} />
        </button>

        {mainMenuOpen && (
          <div className="absolute top-[42px] left-0 z-50 w-[230px] rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-xl py-1.5 text-[13px]">
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
              TradingView Workspace
            </div>
            <button
              type="button"
              onClick={() => {
                toggleTheme();
                setMainMenuOpen(false);
              }}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] cursor-pointer"
            >
              <span>Color Theme</span>
              <span className="text-[11px] text-[var(--tv-text-muted)] uppercase">
                {theme}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                openConnectionsModal('opencode');
                setMainMenuOpen(false);
              }}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] cursor-pointer"
            >
              <span>AI &amp; BigQuery Connections</span>
              <Plug className="w-3.5 h-3.5 text-[var(--tv-text-muted)]" />
            </button>
            <button
              type="button"
              onClick={() => {
                setChartSettingsOpen(true);
                setMainMenuOpen(false);
              }}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] cursor-pointer"
            >
              <span>Chart Settings</span>
              <Settings className="w-3.5 h-3.5 text-[var(--tv-text-muted)]" />
            </button>
            <div className="my-1 tv-divider-h" />
            <div className="px-3 py-1.5 text-[11px] text-[var(--tv-text-muted)] flex items-center justify-between">
              <span>Indicators Search</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--tv-bg-hover)] text-[10px]">
                /
              </kbd>
            </div>
          </div>
        )}
      </div>

      {/* Main Top Toolbar */}
      <div
        data-testid="top-toolbar"
        className="flex-1 min-w-0 h-full tv-panel flex items-center px-1.5 gap-1"
      >
        {/* Symbol Search Trigger */}
        <button
          type="button"
          data-testid="symbol-search-trigger"
          aria-label="Symbol search"
          onClick={() => setSymbolSearchOpen(true)}
          className="h-[28px] px-2 rounded-[4px] flex items-center gap-1.5 hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] transition-colors shrink-0 cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 text-[var(--tv-text-muted)]" strokeWidth={1.75} />
          <span className="font-semibold tracking-tight">{symbol}</span>
          {symbolInfo?.exchange && (
            <span className="hidden sm:inline text-[11px] text-[var(--tv-text-muted)] font-medium">
              {symbolInfo.exchange}
            </span>
          )}
        </button>

        {/* Compare / Add Symbol */}
        <button
          type="button"
          aria-label="Compare or add symbol"
          title="Compare or add symbol"
          onClick={() => setSymbolSearchOpen(true, true)}
          className="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <div className="tv-divider-v mx-0.5" />

        {/* Pinned Timeframes + Dropdown */}
        <div className="relative flex items-center gap-0.5 shrink-0">
          {PINNED_TIMEFRAMES.map((tf) => {
            const active = timeframe === tf;
            return (
              <button
                key={tf}
                type="button"
                data-testid={`timeframe-btn-${tf}`}
                aria-label={`Timeframe ${tf}`}
                aria-pressed={active}
                onClick={() => {
                  void setTimeframe(tf);
                }}
                className={`h-[26px] px-1.5 rounded-[4px] text-[12px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)] font-semibold'
                    : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                }`}
              >
                {tf}
              </button>
            );
          })}

          <button
            type="button"
            data-testid="timeframe-dropdown-trigger"
            aria-label="More intervals"
            aria-expanded={tfMenuOpen}
            onClick={() => {
              setTfMenuOpen((v) => !v);
              setStyleMenuOpen(false);
            }}
            className="w-[22px] h-[26px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {tfMenuOpen && (
            <div className="absolute top-[34px] left-0 z-50 w-[210px] rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-xl py-1.5">
              {TIMEFRAME_GROUPS.map((group) => (
                <div key={group.label} className="mb-1 last:mb-0">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const active = timeframe === item.tf;
                    return (
                      <button
                        key={item.tf}
                        type="button"
                        onClick={() => {
                          void setTimeframe(item.tf);
                          setTfMenuOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 flex items-center justify-between text-[12px] hover:bg-[var(--tv-bg-hover)] cursor-pointer ${
                          active
                            ? 'text-[var(--tv-accent)] font-semibold'
                            : 'text-[var(--tv-text-primary)]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-[var(--tv-text-muted)]" />
                          {item.title}
                        </span>
                        <span className="text-[11px] text-[var(--tv-text-muted)]">
                          {item.tf}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tv-divider-v mx-0.5" />

        {/* Chart Style Selector */}
        <div className="relative shrink-0">
          <button
            type="button"
            data-testid="chart-style-trigger"
            aria-label="Chart style"
            aria-expanded={styleMenuOpen}
            title={`Chart style: ${chartStyle}`}
            onClick={() => {
              setStyleMenuOpen((v) => !v);
              setTfMenuOpen(false);
            }}
            className="h-[28px] px-1.5 rounded-[4px] flex items-center gap-1 text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors cursor-pointer"
          >
            <CandlestickChart className="w-4 h-4" strokeWidth={1.6} />
            <ChevronDown className="w-3 h-3 text-[var(--tv-text-muted)]" />
          </button>

          {styleMenuOpen && (
            <div className="absolute top-[34px] left-0 z-50 w-[180px] rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-xl py-1">
              {CHART_STYLE_OPTIONS.map((opt) => {
                const active = chartStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`chart-style-option-${opt.id}`}
                    onClick={() => {
                      setChartStyle(opt.id);
                      setStyleMenuOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 flex items-center justify-between text-[12px] hover:bg-[var(--tv-bg-hover)] cursor-pointer ${
                      active
                        ? 'text-[var(--tv-accent)] font-semibold bg-[var(--tv-bg-hover)]/60'
                        : 'text-[var(--tv-text-primary)]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--tv-accent)]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="tv-divider-v mx-0.5" />

        {/* Indicators Trigger */}
        <button
          type="button"
          data-testid="indicators-trigger"
          aria-label="Indicators"
          onClick={() => setIndicatorsModalOpen(true)}
          className="h-[28px] px-2 rounded-[4px] flex items-center gap-1.5 text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors shrink-0 cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5" strokeWidth={1.7} />
          <span className="text-[12px] font-medium">Indicators</span>
        </button>

        <div className="hidden lg:block tv-divider-v mx-0.5" />

        {/* Alert & Replay */}
        <button
          type="button"
          aria-label="Alert"
          title="Alerts"
          onClick={() => toggleRightTab('alerts')}
          className="hidden lg:flex h-[28px] px-2 rounded-[4px] items-center gap-1 text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors shrink-0 cursor-pointer"
        >
          <Bell className="w-3.5 h-3.5" strokeWidth={1.6} />
          <span className="text-[12px]">Alert</span>
        </button>

        <button
          type="button"
          data-testid="topbar-replay-btn"
          aria-label="Bar Replay"
          aria-pressed={replayActive}
          title="Interactive Bar Replay (Zero-Lookahead)"
          onClick={() => (replayActive ? stopReplay() : startReplay())}
          className={`hidden lg:flex h-[26px] px-2 rounded-[4px] items-center gap-1 transition-colors shrink-0 cursor-pointer text-[11px] font-medium ${
            replayActive
              ? 'bg-[var(--tv-accent)]/20 text-[var(--tv-accent)] font-semibold'
              : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
          }`}
        >
          <Rewind className="w-3.5 h-3.5" strokeWidth={1.6} />
          <span>Replay</span>
        </button>

        <button
          type="button"
          data-testid="topbar-strategy-btn"
          aria-label="Strategy Tester"
          title="AI Strategy Compiler & Backtester"
          onClick={() => setActiveBottomTab('backtester')}
          className="flex h-[26px] px-2 rounded-[4px] items-center gap-1 text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors shrink-0 cursor-pointer text-[11px] font-medium"
        >
          <FlaskConical className="w-3.5 h-3.5 text-[var(--tv-accent)]" strokeWidth={1.7} />
          <span>Strategy</span>
        </button>

        <button
          type="button"
          data-testid="topbar-autotrade-btn"
          aria-label="Live Demo Forward Test"
          title="Live Demo Forward Test (Backtested Strategy -> Real-Time Demo Execution)"
          onClick={() => setActiveBottomTab('forward_test')}
          className={`flex h-[26px] px-2 rounded-[4px] items-center gap-1 transition-colors shrink-0 cursor-pointer text-[11px] font-medium ${
            forwardTestActive
              ? 'bg-[#089981]/15 text-[#089981] border border-[#089981]/40 font-semibold'
              : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
          }`}
        >
          <Bot
            className={`w-3.5 h-3.5 ${forwardTestActive ? 'text-[#089981]' : 'text-[var(--tv-text-secondary)]'}`}
            strokeWidth={1.7}
          />
          <span>{forwardTestActive ? 'Forward LIVE' : 'Forward Demo'}</span>
        </button>

        <div className="tv-divider-v mx-0.5" />

        {/* Undo / Redo */}
        <button
          type="button"
          data-testid="undo-btn"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={undoCount === 0}
          onClick={undo}
          className="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0 cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" strokeWidth={1.65} />
        </button>

        <button
          type="button"
          data-testid="redo-btn"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          disabled={redoCount === 0}
          onClick={redo}
          className="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0 cursor-pointer"
        >
          <Redo2 className="w-3.5 h-3.5" strokeWidth={1.65} />
        </button>

        {/* Right Cluster */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="market-feed-toggle"
            aria-label="Toggle live market data"
            aria-pressed={liveMarketData}
            title={
              !liveMarketData
                ? 'Simulated deterministic market data (click to enable live quotes)'
                : barsSource === 'seeded' && streamStatus !== 'live'
                  ? 'Live mode enabled — using deterministic fallback while upstream feed reconnects'
                  : `${
                      streamStatus === 'live'
                        ? 'Real-time WebSocket stream connected (Binance & Yahoo Finance)'
                        : 'Live market data (Binance & Yahoo Finance)'
                    }${liveTickCount > 0 ? ` · ${liveTickCount} ticks` : ''}${
                      lastDataUpdatedAt
                        ? ` · Updated ${new Date(lastDataUpdatedAt).toLocaleTimeString()}`
                        : ''
                    }`
            }
            onClick={() => {
              void setLiveMarketData(!liveMarketData);
            }}
            className={`h-[26px] px-2 rounded-[4px] border flex items-center gap-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              !liveMarketData
                ? 'border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                : streamStatus === 'live' || barsSource === 'live'
                  ? 'border-[#089981]/40 bg-[#089981]/10 text-[#089981] hover:bg-[#089981]/15'
                  : 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b] hover:bg-[#f59e0b]/15'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                !liveMarketData
                  ? 'bg-[#787b86]'
                  : streamStatus === 'live' || barsSource === 'live'
                    ? 'bg-[#089981] animate-pulse'
                    : 'bg-[#f59e0b]'
              }`}
            />
            <span>{liveMarketData ? 'LIVE' : 'SIM'}</span>
          </button>

          {slots?.topBarPills ? (
            slots.topBarPills
          ) : (
            <>
              <button
                type="button"
                aria-label="Open AI Assistant"
                onClick={() => toggleRightTab('ai')}
                className="h-[26px] px-2 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] flex items-center gap-1.5 text-[11px] font-medium text-[var(--tv-text-primary)] transition-colors cursor-pointer"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: aiDot }}
                />
                <Sparkles className="w-3 h-3 text-[var(--tv-accent)]" />
                <span className="hidden lg:inline">AI Copilot</span>
              </button>

              <button
                type="button"
                aria-label="Open BigQuery ML"
                onClick={() => toggleRightTab('bigquery')}
                className="h-[26px] px-2 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] flex items-center gap-1.5 text-[11px] font-medium text-[var(--tv-text-primary)] transition-colors cursor-pointer"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: statusDotColor(connectionStatuses.bigquery),
                  }}
                />
                <Database className="w-3 h-3 text-[#089981]" />
                <span className="hidden lg:inline">BQ ML</span>
              </button>
            </>
          )}

          <div className="tv-divider-v mx-0.5" />

          {/* Theme Toggle */}
          <button
            type="button"
            data-testid="theme-toggle-btn"
            aria-label="Toggle theme"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={toggleTheme}
            className="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" strokeWidth={1.6} />
            ) : (
              <Moon className="w-4 h-4" strokeWidth={1.6} />
            )}
          </button>

          {/* Connections & Settings */}
          <button
            type="button"
            data-testid="connections-trigger"
            aria-label="Connections and settings"
            title="OpenCode, Gemini & BigQuery Connections"
            onClick={() => openConnectionsModal()}
            className="relative h-[28px] px-2 rounded-[4px] flex items-center gap-1 text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5" strokeWidth={1.6} />
            <span className="hidden xl:inline text-[12px]">Connections</span>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: aiDot }}
            />
          </button>

          <button
            type="button"
            aria-label="Chart settings"
            title="Chart settings"
            onClick={() => setChartSettingsOpen(true)}
            className="hidden sm:flex w-[28px] h-[28px] rounded-[4px] items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>

          <button
            type="button"
            aria-label="Fullscreen"
            title="Toggle fullscreen"
            onClick={handleFullscreen}
            className="hidden md:flex w-[28px] h-[28px] rounded-[4px] items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>

          <button
            type="button"
            aria-label="Snapshot"
            title="Download chart snapshot"
            onClick={handleSnapshot}
            className="hidden lg:flex w-[28px] h-[28px] rounded-[4px] items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </header>
  );
}
