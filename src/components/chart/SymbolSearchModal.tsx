import { useEffect, useMemo, useState } from 'react';
import { GitCompare, Search, X } from 'lucide-react';
import type { AssetClass, SymbolInfo } from '../../../shared/types';
import { apiClient } from '../../lib/apiClient';
import { useWorkspaceStore } from '../../state/workspaceStore';

type FilterTab = 'All' | 'Stocks' | 'Crypto' | 'Forex' | 'Metals' | 'Indices';

const FILTER_TABS: ReadonlyArray<{ label: FilterTab; value: AssetClass | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Forex', value: 'forex' },
  { label: 'Metals', value: 'metals' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'Stocks', value: 'stocks' },
  { label: 'Indices', value: 'indices' },
];

export function SymbolSearchModal() {
  const catalogSymbols = useWorkspaceStore((s) => s.catalogSymbols);
  const activeSymbol = useWorkspaceStore((s) => s.symbol);
  const compareModalMode = useWorkspaceStore((s) => s.compareModalMode);
  const liveMarketData = useWorkspaceStore((s) => s.liveMarketData);
  const setSymbol = useWorkspaceStore((s) => s.setSymbol);
  const addCompareSymbol = useWorkspaceStore((s) => s.addCompareSymbol);
  const setSymbolSearchOpen = useWorkspaceStore((s) => s.setSymbolSearchOpen);

  const [query, setQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState<AssetClass | 'all'>('all');
  const [remoteResults, setRemoteResults] = useState<SymbolInfo[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!liveMarketData || trimmed.length < 2) {
      setRemoteResults([]);
      setSearchingRemote(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setSearchingRemote(true);

    const timer = window.setTimeout(async () => {
      try {
        const res = await apiClient.getSymbols(
          { q: trimmed, assetClass: assetFilter, live: true },
          controller.signal,
        );
        if (!cancelled) {
          setRemoteResults(res.symbols);
          setSearchingRemote(false);
        }
      } catch {
        if (!cancelled) {
          setSearchingRemote(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [assetFilter, liveMarketData, query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = catalogSymbols.filter((item) => {
      if (assetFilter !== 'all' && item.assetClass !== assetFilter) return false;
      if (!q) return true;
      return (
        item.symbol.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.exchange.toLowerCase().includes(q)
      );
    });

    if (remoteResults.length === 0 || q.length < 2) {
      return local;
    }

    const seen = new Set(local.map((s) => s.symbol.toUpperCase()));
    const combined = [...local];
    for (const remote of remoteResults) {
      if (assetFilter !== 'all' && remote.assetClass !== assetFilter) continue;
      const upper = remote.symbol.toUpperCase();
      if (!seen.has(upper)) {
        seen.add(upper);
        combined.push(remote);
      }
    }
    return combined;
  }, [assetFilter, catalogSymbols, query, remoteResults]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
      onClick={() => setSymbolSearchOpen(false)}
    >
      <div
        data-testid="symbol-search-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[640px] rounded-[8px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--tv-border)] flex items-center justify-between">
          <span className="font-semibold text-[15px] text-[var(--tv-text-primary)]">
            {compareModalMode ? 'Compare or Add Symbol' : 'Symbol Search'}
          </span>
          <button
            type="button"
            aria-label="Close symbol search"
            onClick={() => setSymbolSearchOpen(false)}
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-2.5 border-b border-[var(--tv-border)] flex items-center gap-2 bg-[var(--tv-bg-panel)]">
          <Search className="w-4 h-4 text-[var(--tv-text-muted)] shrink-0" />
          <input
            type="text"
            data-testid="symbol-search-input"
            aria-label="Search symbols"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Forex (EURUSD, GBPJPY), Metals (XAUUSD, XAGUSD), Crypto, Stocks, Indices..."
            className="flex-1 bg-transparent text-[13px] text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-muted)] focus:outline-none"
          />
          {searchingRemote && (
            <span className="text-[11px] text-[var(--tv-text-muted)] shrink-0">
              Searching live markets...
            </span>
          )}
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-[11px] text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Asset Class Pills */}
        <div className="px-4 py-2 border-b border-[var(--tv-border)] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {FILTER_TABS.map((tab) => {
            const active = assetFilter === tab.value;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => setAssetFilter(tab.value)}
                className={`h-[26px] px-3 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--tv-text-primary)] text-[var(--tv-bg-canvas)] font-semibold'
                    : 'bg-[var(--tv-bg-panel)] text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Symbol Rows */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--tv-border-subtle)]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[var(--tv-text-muted)]">
              No symbols match your criteria
            </div>
          ) : (
            filtered.map((item) => {
              const isCurrent = item.symbol === activeSymbol;
              return (
                <div
                  key={item.symbol}
                  className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--tv-bg-hover)] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (compareModalMode && !isCurrent) {
                        addCompareSymbol(item.symbol);
                      } else {
                        void setSymbol(item.symbol);
                      }
                      setSymbolSearchOpen(false);
                    }}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                  >
                    <span
                      aria-hidden="true"
                      data-badge={item.symbol.slice(0, 3)}
                      className="w-7 h-7 rounded-full bg-[var(--tv-accent)]/15 text-[var(--tv-accent)] flex items-center justify-center text-[10px] font-bold shrink-0 before:content-[attr(data-badge)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] text-[var(--tv-text-primary)]">
                          {item.symbol}
                        </span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded bg-[var(--tv-accent)]/20 text-[var(--tv-accent)] text-[10px] font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      {' '}
                      <div className="text-[12px] text-[var(--tv-text-muted)] truncate">
                        {item.name}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] uppercase text-[var(--tv-text-muted)]">
                      {item.assetClass}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-secondary)]">
                      {item.exchange}
                    </span>
                    {!isCurrent && (
                      <button
                        type="button"
                        title={`Compare ${item.symbol}`}
                        aria-label={`Compare ${item.symbol}`}
                        onClick={() => {
                          addCompareSymbol(item.symbol);
                          setSymbolSearchOpen(false);
                        }}
                        className="h-7 px-2 rounded border border-[var(--tv-border)] hover:border-[var(--tv-accent)] text-[var(--tv-text-secondary)] hover:text-[var(--tv-accent)] flex items-center gap-1 text-[11px] cursor-pointer"
                      >
                        <GitCompare className="w-3 h-3" />
                        Compare
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
