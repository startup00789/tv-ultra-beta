import { useState, type ComponentType, type FormEvent } from 'react';
import {
  Bell,
  Layers,
  List,
  Plug,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useWorkspaceStore,
  type AssetClass,
  type RightTab,
  type SymbolInfo,
} from '../../state/workspaceStore';
import type { WorkspaceSlots } from './slots';

const ASSET_GROUP_LABELS: ReadonlyArray<{ key: AssetClass; label: string }> = [
  { key: 'indices', label: 'INDICES' },
  { key: 'metals', label: 'METALS' },
  { key: 'forex', label: 'FOREX' },
  { key: 'stocks', label: 'STOCKS' },
  { key: 'crypto', label: 'CRYPTO' },
];

const RAIL_TABS: ReadonlyArray<{
  id: Exclude<RightTab, null>;
  label: string;
  testId: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  {
    id: 'watchlist',
    label: 'Watchlist and details',
    testId: 'rail-tab-watchlist',
    icon: List,
  },
  {
    id: 'ai',
    label: 'AI Strategy & Forward Copilot (DeepSeek / OpenCode / BYOK)',
    testId: 'rail-tab-ai',
    icon: Sparkles,
  },
  {
    id: 'objects',
    label: 'Object Tree',
    testId: 'rail-tab-objects',
    icon: Layers,
  },
  {
    id: 'alerts',
    label: 'Alerts',
    testId: 'rail-tab-alerts',
    icon: Bell,
  },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRowPrice(row: SymbolInfo): string {
  if (row.assetClass === 'forex') return row.last.toFixed(4);
  return row.last.toFixed(2);
}

function WatchlistFallbackPanel() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const symbolInfo = useWorkspaceStore((s) => s.symbolInfo);
  const watchlist = useWorkspaceStore((s) => s.watchlist);
  const setSymbol = useWorkspaceStore((s) => s.setSymbol);
  const addToWatchlist = useWorkspaceStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useWorkspaceStore((s) => s.removeFromWatchlist);

  const [addInput, setAddInput] = useState('');

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!addInput.trim()) return;
    await addToWatchlist(addInput);
    setAddInput('');
  };

  const activeDetails =
    symbolInfo ?? watchlist.find((w) => w.symbol === symbol) ?? null;

  return (
    <div data-testid="watchlist-panel" className="h-full flex flex-col min-h-0">
      {/* Watchlist Header & Add Input */}
      <div className="px-3 py-2 border-b border-[var(--tv-border)] flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--tv-text-primary)]">
            Watchlist
          </span>
          <span className="text-[11px] text-[var(--tv-text-muted)]">
            {watchlist.length} symbols
          </span>
        </div>

        <form onSubmit={(e) => void handleAdd(e)} className="flex items-center gap-1">
          <input
            type="text"
            data-testid="watchlist-add-input"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            placeholder="Add symbol (e.g. AMZN)..."
            aria-label="Add symbol to watchlist"
            className="flex-1 min-w-0 h-[26px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[12px] text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-muted)] focus:outline-none focus:border-[var(--tv-accent)]"
          />
          <button
            type="submit"
            data-testid="watchlist-add-btn"
            aria-label="Add to watchlist"
            className="w-[26px] h-[26px] rounded-[4px] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] flex items-center justify-center text-[var(--tv-text-primary)] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Column Headers */}
      <div className="px-3 py-1.5 border-b border-[var(--tv-border)] grid grid-cols-[1fr_68px_54px_54px] text-[11px] text-[var(--tv-text-muted)] shrink-0">
        <span>Symbol</span>
        <span className="text-right">Last</span>
        <span className="text-right">Chg</span>
        <span className="text-right">Chg%</span>
      </div>

      {/* Scrollable Symbol Rows */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {ASSET_GROUP_LABELS.map((group) => {
          const items = watchlist.filter((w) => w.assetClass === group.key);
          if (items.length === 0) return null;
          return (
            <div key={group.key}>
              <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-[var(--tv-text-muted)] bg-[var(--tv-bg-elevated)]/50">
                {group.label}
              </div>
              {items.map((row) => {
                const isSelected = row.symbol === symbol;
                const pos = row.change >= 0;
                return (
                  <div
                    key={row.symbol}
                    data-testid={`watchlist-row-${row.symbol}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => void setSymbol(row.symbol)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void setSymbol(row.symbol);
                      }
                    }}
                    className={`group relative px-3 py-1.5 grid grid-cols-[1fr_68px_54px_54px] items-center text-[12px] cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--tv-bg-hover)]'
                        : 'hover:bg-[var(--tv-bg-elevated)]'
                    }`}
                  >
                    <span className="font-semibold text-[var(--tv-text-primary)] truncate">
                      {row.symbol}
                    </span>
                    <span className="text-right tabular-nums text-[var(--tv-text-primary)]">
                      {formatRowPrice(row)}
                    </span>
                    <span
                      className={`text-right tabular-nums ${
                        pos ? 'text-[#089981]' : 'text-[#f23645]'
                      }`}
                    >
                      {pos ? '+' : ''}
                      {row.assetClass === 'forex'
                        ? row.change.toFixed(4)
                        : row.change.toFixed(2)}
                    </span>
                    <span
                      className={`text-right tabular-nums ${
                        pos ? 'text-[#089981]' : 'text-[#f23645]'
                      }`}
                    >
                      {pos ? '+' : ''}
                      {row.changePercent.toFixed(2)}%
                    </span>

                    <button
                      type="button"
                      data-testid={`watchlist-remove-${row.symbol}`}
                      aria-label={`Remove ${row.symbol}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromWatchlist(row.symbol);
                      }}
                      className="hidden group-hover:flex absolute right-1 top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] items-center justify-center text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Lower Symbol Details Card */}
      <div
        data-testid="symbol-details-card"
        className="shrink-0 border-t border-[var(--tv-border)] p-3 bg-[var(--tv-bg-panel)] flex flex-col gap-2"
      >
        {activeDetails ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[14px] font-bold text-[var(--tv-text-primary)]">
                  {activeDetails.symbol}
                </div>
                <div className="text-[11px] text-[var(--tv-text-muted)]">
                  {activeDetails.name} · {activeDetails.exchange}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] text-[#089981]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#089981]" />
                Open
              </span>
            </div>

            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-[20px] font-bold text-[var(--tv-text-primary)]">
                {formatRowPrice(activeDetails)}
              </span>
              <span className="text-[11px] text-[var(--tv-text-muted)]">
                {activeDetails.currency ?? 'USD'}
              </span>
              <span
                className={`text-[12px] font-medium ${
                  activeDetails.change >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                }`}
              >
                {activeDetails.change >= 0 ? '+' : ''}
                {activeDetails.change.toFixed(2)} (
                {activeDetails.change >= 0 ? '+' : ''}
                {activeDetails.changePercent.toFixed(2)}%)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] pt-1 border-t border-[var(--tv-border-subtle)]">
              <div className="flex justify-between">
                <span className="text-[var(--tv-text-muted)]">Volume</span>
                <span className="tabular-nums text-[var(--tv-text-primary)]">
                  {formatNumber(activeDetails.volume)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--tv-text-muted)]">Avg 30D</span>
                <span className="tabular-nums text-[var(--tv-text-primary)]">
                  {formatNumber(activeDetails.avgVolume30d)}
                </span>
              </div>
              {activeDetails.marketCap && (
                <div className="flex justify-between">
                  <span className="text-[var(--tv-text-muted)]">Mkt Cap</span>
                  <span className="tabular-nums text-[var(--tv-text-primary)]">
                    {activeDetails.marketCap}
                  </span>
                </div>
              )}
              {activeDetails.peRatio !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[var(--tv-text-muted)]">P/E</span>
                  <span className="tabular-nums text-[var(--tv-text-primary)]">
                    {activeDetails.peRatio.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-[12px] text-[var(--tv-text-muted)]">
            Loading symbol details...
          </div>
        )}
      </div>
    </div>
  );
}

interface ShellRightSidebarProps {
  slots?: WorkspaceSlots;
}

export function ShellRightSidebar({ slots }: ShellRightSidebarProps) {
  const activeRightTab = useWorkspaceStore((s) => s.activeRightTab);
  const rightPanelWidth = useWorkspaceStore((s) => s.rightPanelWidth);
  const connectionStatuses = useWorkspaceStore((s) => s.connectionStatuses);
  const drawings = useWorkspaceStore((s) => s.drawings);
  const indicators = useWorkspaceStore((s) => s.indicators);

  const toggleRightTab = useWorkspaceStore((s) => s.toggleRightTab);
  const openConnectionsModal = useWorkspaceStore((s) => s.openConnectionsModal);

  const renderFallbackTabContent = (tab: Exclude<RightTab, null>) => {
    if (tab === 'watchlist') {
      return <WatchlistFallbackPanel />;
    }

    if (tab === 'objects') {
      return (
        <div className="p-3 flex flex-col gap-2 text-[12px]">
          <div className="font-semibold text-[var(--tv-text-primary)]">
            Object Tree
          </div>
          <div className="text-[var(--tv-text-muted)]">
            Indicators ({indicators.length}) · Drawings ({drawings.length})
          </div>
        </div>
      );
    }

    if (tab === 'alerts') {
      return (
        <div className="p-3 flex flex-col gap-2 text-[12px]">
          <div className="font-semibold text-[var(--tv-text-primary)]">
            Price Alerts
          </div>
          <p className="text-[var(--tv-text-muted)]">
            No active alerts configured yet.
          </p>
        </div>
      );
    }

    const isBq = tab === 'bigquery';
    return (
      <div className="p-3 flex flex-col gap-3 text-[12px]">
        <div className="font-semibold text-[var(--tv-text-primary)]">
          {isBq ? 'BigQuery AI/ML Analytics' : 'AI Assistant (OpenCode & Gemini)'}
        </div>
        <div className="px-2.5 py-2 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] text-[var(--tv-text-secondary)]">
          Status:{' '}
          <span className="font-semibold">
            {isBq
              ? connectionStatuses.bigquery
              : `OpenCode: ${connectionStatuses.opencode} · Gemini: ${connectionStatuses.gemini}`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => openConnectionsModal(isBq ? 'bigquery' : 'opencode')}
          className="px-3 py-1.5 rounded-[4px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white font-medium cursor-pointer"
        >
          Configure Connection
        </button>
      </div>
    );
  };

  return (
    <div className="shrink-0 flex gap-[4px] min-h-0">
      {/* Collapsible 300px Right Panel */}
      {activeRightTab !== null && (
        <aside
          data-testid="right-sidebar-panel"
          style={{ width: `${rightPanelWidth}px` }}
          className="shrink-0 tv-panel overflow-hidden flex flex-col"
        >
          {slots?.rightPanels?.[activeRightTab]
            ? slots.rightPanels[activeRightTab]
            : renderFallbackTabContent(activeRightTab)}
        </aside>
      )}

      {/* Far-Right 46px Icon Rail */}
      {slots?.rightIconRail ? (
        slots.rightIconRail
      ) : (
        <nav
          data-testid="right-icon-rail"
          aria-label="Right utility rail"
          className="w-[46px] shrink-0 tv-panel flex flex-col items-center justify-between py-2"
        >
          <div className="flex flex-col items-center gap-1">
            {RAIL_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeRightTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={tab.testId}
                  aria-label={tab.label}
                  aria-pressed={active}
                  title={tab.label}
                  onClick={() => toggleRightTab(tab.id)}
                  className={`w-[34px] h-[34px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)]'
                      : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                  }`}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.6} />
                </button>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              data-testid="rail-tab-connections"
              aria-label="Connections and settings"
              title="Connections & Settings"
              onClick={() => openConnectionsModal()}
              className="w-[34px] h-[34px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors cursor-pointer"
            >
              <Plug className="w-4 h-4" strokeWidth={1.6} />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
