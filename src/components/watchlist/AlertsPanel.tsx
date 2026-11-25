import { useEffect, useState, type FormEvent } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { useWorkspaceStore } from '../../state/workspaceStore';

export function AlertsPanel() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const bars = useWorkspaceStore((s) => s.bars);
  const alerts = useWorkspaceStore((s) => s.alerts);
  const addAlert = useWorkspaceStore((s) => s.addAlert);
  const removeAlert = useWorkspaceStore((s) => s.removeAlert);

  const lastClose = bars[bars.length - 1]?.close ?? 100;
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [priceStr, setPriceStr] = useState(() =>
    (lastClose * 1.02).toFixed(lastClose < 10 ? 4 : 2),
  );
  const [note, setNote] = useState('');

  useEffect(() => {
    const decimals = lastClose < 10 ? 4 : 2;
    setPriceStr((lastClose * 1.02).toFixed(decimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const targetPrice = Number(priceStr);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) return;
    addAlert({
      symbol,
      condition,
      targetPrice,
      note: note.trim() || undefined,
    });
    setNote('');
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 py-2.5 border-b border-[var(--tv-border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 font-semibold text-[13px] text-[var(--tv-text-primary)]">
          <Bell className="w-4 h-4 text-[var(--tv-accent)]" />
          <span>Price Alerts</span>
        </div>
        <span className="text-[11px] text-[var(--tv-text-muted)]">
          {alerts.length} active
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-3 border-b border-[var(--tv-border)] flex flex-col gap-2 text-[12px]"
      >
        <div className="text-[11px] font-medium text-[var(--tv-text-secondary)]">
          Create alert for <span className="text-[var(--tv-text-primary)] font-semibold">{symbol}</span>
        </div>
        <div className="flex gap-1.5">
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
            aria-label="Alert condition"
            className="h-[28px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
          >
            <option value="above">Crossing Up</option>
            <option value="below">Crossing Down</option>
          </select>
          <input
            type="number"
            step="any"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            aria-label="Alert price"
            className="flex-1 min-w-0 h-[28px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] tabular-nums"
          />
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note..."
            className="flex-1 min-w-0 h-[28px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-muted)]"
          />
          <button
            type="submit"
            className="h-[28px] px-2.5 rounded-[4px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white font-medium flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </form>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5 text-[12px]">
        {alerts.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-[var(--tv-text-muted)]">
            No price alerts set yet.
          </div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className="px-2.5 py-2 rounded-[4px] bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-semibold text-[var(--tv-text-primary)]">
                  <span>
                    {a.symbol} {a.condition === 'above' ? '≥' : '≤'} {a.targetPrice}
                  </span>
                  {a.triggered && (
                    <span className="px-1.5 py-0.2 rounded bg-[#089981]/15 text-[#089981] text-[10px] font-semibold uppercase">
                      Triggered
                    </span>
                  )}
                </div>
                {a.note && (
                  <div className="text-[11px] text-[var(--tv-text-muted)] truncate">
                    {a.note}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label={`Delete alert ${a.symbol}`}
                onClick={() => removeAlert(a.id)}
                className="p-1 rounded text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
