import { useEffect, useState, type FormEvent } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Play,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import type { AssetClass, SymbolInfo } from '../../../shared/types';
import { useWorkspaceStore } from '../../state/workspaceStore';

const ASSET_GROUP_LABELS: ReadonlyArray<{ key: AssetClass; label: string }> = [
  { key: 'indices', label: 'INDICES' },
  { key: 'metals', label: 'METALS' },
  { key: 'forex', label: 'FOREX' },
  { key: 'crypto', label: 'CRYPTO' },
  { key: 'stocks', label: 'STOCKS' },
];

const BADGE_COLORS: Record<AssetClass, string> = {
  stocks: '#2962ff',
  crypto: '#f59e0b',
  indices: '#089981',
  forex: '#a855f7',
  metals: '#eab308',
};

function getDisplayDecimals(row: { symbol: string; assetClass: AssetClass; last: number }): number {
  const sym = row.symbol.toUpperCase();
  if (sym.endsWith('JPY') || sym === 'USDINR' || sym === 'XAGUSD' || sym === 'XAGEUR' || sym === 'DXY') {
    return 3;
  }
  if (row.assetClass === 'forex' || sym === 'XCUUSD' || Math.abs(row.last) < 10) {
    return 4;
  }
  return 2;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRowPrice(row: SymbolInfo): string {
  return row.last.toFixed(getDisplayDecimals(row));
}

export function WatchlistPanel() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const symbolInfo = useWorkspaceStore((s) => s.symbolInfo);
  const barsSource = useWorkspaceStore((s) => s.barsSource);
  const tickFlashBySymbol = useWorkspaceStore((s) => s.tickFlashBySymbol);
  const watchlist = useWorkspaceStore((s) => s.watchlist);
  const catalogSymbols = useWorkspaceStore((s) => s.catalogSymbols);
  const setSymbol = useWorkspaceStore((s) => s.setSymbol);
  const addToWatchlist = useWorkspaceStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useWorkspaceStore((s) => s.removeFromWatchlist);
  const setActiveRightTab = useWorkspaceStore((s) => s.setActiveRightTab);
  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);
  const setBottomDrawerOpen = useWorkspaceStore((s) => s.setBottomDrawerOpen);

  const [addInput, setAddInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'default' | 'symbol' | 'changePercent'>('default');
  const [flashNowMs, setFlashNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timestamps = Object.values(tickFlashBySymbol).map((f) => f.at);
    if (timestamps.length === 0) return;
    const now = Date.now();
    setFlashNowMs(now);
    const timer = window.setTimeout(() => setFlashNowMs(Date.now()), 750);
    return () => window.clearTimeout(timer);
  }, [tickFlashBySymbol]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const raw = addInput.trim().toUpperCase();
    if (!raw) return;
    setAddError(null);

    const known = catalogSymbols.some((c) => c.symbol === raw);
    const prevLen = watchlist.length;
    await addToWatchlist(raw);
    const nextWatchlist = useWorkspaceStore.getState().watchlist;
    if (!known && nextWatchlist.length === prevLen && !nextWatchlist.some((w) => w.symbol === raw)) {
      setAddError(`Symbol "${raw}" not found.`);
      return;
    }
    setAddInput('');
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeDetails =
    symbolInfo ?? watchlist.find((w) => w.symbol === symbol) ?? null;

  const volRatioPct = activeDetails && activeDetails.avgVolume30d > 0
    ? Math.min(100, Math.round((activeDetails.volume / activeDetails.avgVolume30d) * 50))
    : 50;

  return (
    <div data-testid="watchlist-panel" className="h-full flex flex-col min-h-0">
      {/* Header + Add Symbol Input */}
      <div className="px-3 py-2 border-b border-[var(--tv-border)] flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--tv-text-primary)]">
            Watchlist
          </span>
          <span className="text-[11px] text-[var(--tv-text-muted)] tabular-nums">
            {watchlist.length} symbols
          </span>
        </div>

        <form onSubmit={(e) => void handleAdd(e)} className="flex items-center gap-1">
          <input
            type="text"
            data-testid="watchlist-add-input"
            value={addInput}
            onChange={(e) => {
              setAddInput(e.target.value);
              if (addError) setAddError(null);
            }}
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

        {addError && (
          <div className="text-[11px] text-[#f23645]">{addError}</div>
        )}
      </div>

      {/* Column Headers */}
      <div className="px-3 py-1.5 border-b border-[var(--tv-border)] grid grid-cols-[1fr_68px_52px_54px] text-[11px] text-[var(--tv-text-muted)] shrink-0">
        <button
          type="button"
          onClick={() => setSortBy((s) => (s === 'symbol' ? 'default' : 'symbol'))}
          className="text-left hover:text-[var(--tv-text-primary)] cursor-pointer"
        >
          Symbol
        </button>
        <span className="text-right">Last</span>
        <span className="text-right">Chg</span>
        <button
          type="button"
          onClick={() =>
            setSortBy((s) => (s === 'changePercent' ? 'default' : 'changePercent'))
          }
          className="text-right hover:text-[var(--tv-text-primary)] cursor-pointer"
        >
          Chg%
        </button>
      </div>

      {/* Scrollable Grouped Watchlist Table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {ASSET_GROUP_LABELS.map((group) => {
          let items = watchlist.filter((w) => w.assetClass === group.key);
          if (items.length === 0) return null;
          if (sortBy === 'symbol') {
            items = [...items].sort((a, b) => a.symbol.localeCompare(b.symbol));
          } else if (sortBy === 'changePercent') {
            items = [...items].sort((a, b) => b.changePercent - a.changePercent);
          }
          const isCollapsed = Boolean(collapsedGroups[group.key]);

          return (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                className="w-full px-2.5 py-1 flex items-center gap-1 text-[10px] font-semibold tracking-wider text-[var(--tv-text-muted)] bg-[var(--tv-bg-elevated)]/45 hover:text-[var(--tv-text-primary)] cursor-pointer"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                <span>{group.label}</span>
              </button>

              {!isCollapsed &&
                items.map((row) => {
                  const isSelected = row.symbol === symbol;
                  const pos = row.change >= 0;
                  const flash = tickFlashBySymbol[row.symbol.toUpperCase()];
                  const isFlashing = flash !== undefined && flashNowMs - flash.at < 700;
                  const lastPriceClass = isFlashing
                    ? flash.dir === 'up'
                      ? 'bg-[#089981]/20 text-[#089981] rounded px-1'
                      : 'bg-[#f23645]/20 text-[#f23645] rounded px-1'
                    : 'text-[var(--tv-text-primary)]';
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
                      className={`group relative px-2.5 py-1.5 grid grid-cols-[1fr_68px_52px_54px] items-center text-[12px] cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--tv-bg-hover)] ring-1 ring-inset ring-[var(--tv-text-muted)]/40'
                          : 'hover:bg-[var(--tv-bg-elevated)]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                          style={{ backgroundColor: BADGE_COLORS[row.assetClass] }}
                        >
                          {row.symbol.slice(0, 2)}
                        </span>
                        <span className="font-semibold text-[var(--tv-text-primary)] truncate">
                          {row.symbol}
                        </span>
                      </div>
                      <span
                        className={`text-right tabular-nums transition-colors duration-300 ${lastPriceClass}`}
                      >
                        {formatRowPrice(row)}
                      </span>
                      <span
                        className={`text-right tabular-nums ${
                          pos ? 'text-[#089981]' : 'text-[#f23645]'
                        }`}
                      >
                        {pos ? '+' : ''}
                        {row.change.toFixed(getDisplayDecimals(row))}
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
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex absolute right-1 top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] items-center justify-center text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer transition-opacity"
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
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: BADGE_COLORS[activeDetails.assetClass] }}
                >
                  {activeDetails.symbol.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-[var(--tv-text-primary)] truncate">
                    {activeDetails.symbol}
                  </div>
                  <div className="text-[11px] text-[var(--tv-text-muted)] truncate">
                    {activeDetails.name} · {activeDetails.exchange}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(activeDetails.dataSource ?? barsSource) && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                      (activeDetails.dataSource ?? barsSource) === 'live'
                        ? 'bg-[#089981]/15 text-[#089981]'
                        : 'bg-[var(--tv-bg-hover)] text-[var(--tv-text-muted)]'
                    }`}
                  >
                    {(activeDetails.dataSource ?? barsSource) === 'live' ? 'Live' : 'Sim'}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 text-[11px] ${
                    activeDetails.marketOpen !== false ? 'text-[#089981]' : 'text-[#787b86]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      activeDetails.marketOpen !== false ? 'bg-[#089981]' : 'bg-[#787b86]'
                    }`}
                  />
                  {activeDetails.marketOpen !== false ? 'Open' : 'Closed'}
                </span>
              </div>
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
                {activeDetails.change.toFixed(getDisplayDecimals(activeDetails))}{' '}
                ({activeDetails.change >= 0 ? '+' : ''}
                {activeDetails.changePercent.toFixed(2)}%)
              </span>
            </div>

            {/* Volume vs Avg 30D Bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--tv-text-muted)]">
                  Vol {formatNumber(activeDetails.volume)}
                </span>
                <span className="text-[var(--tv-text-muted)]">
                  Avg 30D {formatNumber(activeDetails.avgVolume30d)}
                </span>
              </div>
              <div className="w-full h-1 rounded-full bg-[var(--tv-bg-hover)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--tv-accent)]"
                  style={{ width: `${volRatioPct}%` }}
                />
              </div>
            </div>

            {/* TradingView Ultra AI & Forward Demo Card */}
            <div className="rounded-[6px] border border-[var(--tv-accent)]/30 bg-[var(--tv-accent)]/10 p-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--tv-accent)]">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Ultra Quant &amp; Forward Demo
                </span>
                <span className="text-[10px] font-normal text-[var(--tv-text-muted)]">
                  {activeDetails.sector ?? activeDetails.assetClass}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveRightTab('ai')}
                  className="flex-1 h-[24px] rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-[var(--tv-accent)]" />
                  AI Copilot
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveBottomTab('forward_test');
                    setBottomDrawerOpen(true);
                  }}
                  className="flex-1 h-[24px] rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Play className="w-3 h-3 text-[#089981]" />
                  Forward Demo
                </button>
              </div>
            </div>

            {/* Key Stats */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] pt-1 border-t border-[var(--tv-border-subtle)]">
              {activeDetails.dayLow !== undefined && activeDetails.dayHigh !== undefined && (
                <div className="col-span-2 flex justify-between">
                  <span className="text-[var(--tv-text-muted)]">Day Range</span>
                  <span className="tabular-nums text-[var(--tv-text-primary)]">
                    {activeDetails.dayLow.toFixed(getDisplayDecimals(activeDetails))} –{' '}
                    {activeDetails.dayHigh.toFixed(getDisplayDecimals(activeDetails))}
                  </span>
                </div>
              )}
              {activeDetails.fiftyTwoWeekLow !== undefined &&
                activeDetails.fiftyTwoWeekHigh !== undefined && (
                  <div className="col-span-2 flex justify-between">
                    <span className="text-[var(--tv-text-muted)]">52W Range</span>
                    <span className="tabular-nums text-[var(--tv-text-primary)]">
                      {activeDetails.fiftyTwoWeekLow.toFixed(
                        getDisplayDecimals(activeDetails),
                      )}{' '}
                      –{' '}
                      {activeDetails.fiftyTwoWeekHigh.toFixed(
                        getDisplayDecimals(activeDetails),
                      )}
                    </span>
                  </div>
                )}
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
              {activeDetails.dividendYield !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[var(--tv-text-muted)]">Div Yield</span>
                  <span className="tabular-nums text-[var(--tv-text-primary)]">
                    {activeDetails.dividendYield.toFixed(2)}%
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
