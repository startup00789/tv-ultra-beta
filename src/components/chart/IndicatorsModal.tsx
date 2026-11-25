import { useMemo, useState } from 'react';
import { Activity, Search, X } from 'lucide-react';
import { INDICATOR_CATALOG, type IndicatorCatalogItem } from '../../lib/indicators';
import { useWorkspaceStore } from '../../state/workspaceStore';

type IndCategory = 'All' | IndicatorCatalogItem['category'];

const CATEGORIES: readonly IndCategory[] = ['All', 'Overlays', 'Oscillators', 'Volatility'];

export function IndicatorsModal() {
  const addIndicator = useWorkspaceStore((s) => s.addIndicator);
  const setIndicatorsModalOpen = useWorkspaceStore((s) => s.setIndicatorsModalOpen);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<IndCategory>('All');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INDICATOR_CATALOG.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.shortName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  const handleSelect = (ind: IndicatorCatalogItem) => {
    addIndicator({
      id: ind.id,
      name: ind.shortName,
      pane: ind.pane,
      visible: true,
      color: ind.defaultColor,
      secondaryColor: ind.secondaryColor,
      tertiaryColor: ind.tertiaryColor,
      params: { ...ind.defaultParams },
    });
    setIndicatorsModalOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
      onClick={() => setIndicatorsModalOpen(false)}
    >
      <div
        data-testid="indicators-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[620px] rounded-[8px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="px-4 py-3 border-b border-[var(--tv-border)] flex items-center justify-between">
          <span className="font-semibold text-[15px] text-[var(--tv-text-primary)]">
            Indicators, Metrics &amp; Strategies
          </span>
          <button
            type="button"
            aria-label="Close indicators modal"
            onClick={() => setIndicatorsModalOpen(false)}
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-[var(--tv-border)] flex items-center gap-2 bg-[var(--tv-bg-panel)]">
          <Search className="w-4 h-4 text-[var(--tv-text-muted)] shrink-0" />
          <input
            type="text"
            data-testid="indicators-search-input"
            aria-label="Search indicators"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search technicals (SMA, EMA, Bollinger Bands, VWAP, RSI, MACD, ATR)..."
            className="flex-1 bg-transparent text-[13px] text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-muted)] focus:outline-none"
          />
        </div>

        <div className="flex flex-1 min-h-[280px] overflow-hidden">
          {/* Left Category Sidebar */}
          <div className="w-[150px] shrink-0 border-r border-[var(--tv-border)] bg-[var(--tv-bg-panel)] p-2 flex flex-col gap-1">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
              Built-In Technicals
            </div>
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1.5 rounded-[4px] text-left text-[12px] cursor-pointer transition-colors ${
                    active
                      ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)] font-semibold'
                      : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Right Indicator List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--tv-border-subtle)]">
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[var(--tv-text-muted)]">
                No indicators match &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((ind) => (
                <button
                  key={ind.id}
                  type="button"
                  data-testid={`indicator-option-${ind.id}`}
                  onClick={() => handleSelect(ind)}
                  className="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--tv-bg-hover)] text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Activity
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: ind.defaultColor }}
                    />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[var(--tv-text-primary)]">
                        {ind.name} ({ind.shortName})
                      </div>
                      <div className="text-[11px] text-[var(--tv-text-muted)] truncate">
                        {ind.description}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[10px] uppercase text-[var(--tv-text-muted)]">
                    {ind.pane === 'main' ? 'Overlay' : 'Sub-pane'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
