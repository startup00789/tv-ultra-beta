import { useState, type FormEvent } from 'react';
import { Bell, Bot, CheckCircle2, Plus, Trash2, Zap } from 'lucide-react';
import { useWorkspaceStore } from '../../state/workspaceStore';

export function StrategyAlertsLogDrawer() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const bars = useWorkspaceStore((s) => s.bars);
  const alerts = useWorkspaceStore((s) => s.alerts);
  const backtestReport = useWorkspaceStore((s) => s.backtestReport);
  const paperAccount = useWorkspaceStore((s) => s.paperAccount);
  const addAlert = useWorkspaceStore((s) => s.addAlert);
  const removeAlert = useWorkspaceStore((s) => s.removeAlert);

  const lastClose = bars[bars.length - 1]?.close ?? 100;
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [priceInput, setPriceInput] = useState(() => (lastClose * 1.01).toFixed(2));
  const [noteInput, setNoteInput] = useState('');

  const handleCreateAlert = (e: FormEvent) => {
    e.preventDefault();
    const target = Number(priceInput);
    if (!Number.isFinite(target) || target <= 0) return;
    addAlert({
      symbol,
      condition,
      targetPrice: target,
      note: noteInput.trim() || `${symbol} ${condition} ${target}`,
    });
    setNoteInput('');
  };

  const recentSignals = backtestReport?.trades.slice(-15).reverse() ?? [];
  const paperOrders = paperAccount?.orders.slice(0, 15) ?? [];

  return (
    <div
      data-testid="strategy-alerts-log-drawer"
      className="h-full grid grid-cols-1 lg:grid-cols-12 gap-3 text-[12px] text-[var(--tv-text-primary)] min-h-0 overflow-hidden"
    >
      {/* Left: Price Alerts Manager */}
      <div className="lg:col-span-5 border border-[var(--tv-border)] rounded bg-[var(--tv-bg-canvas)] p-2.5 flex flex-col min-h-0 gap-2">
        <div className="flex items-center justify-between font-semibold text-[12px]">
          <span className="flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-[var(--tv-accent)]" />
            <span>Price &amp; Condition Alerts ({alerts.length})</span>
          </span>
          <span className="text-[10px] text-[#089981]">
            {alerts.filter((a) => a.triggered).length} triggered
          </span>
        </div>

        <form onSubmit={handleCreateAlert} className="flex items-center gap-1.5">
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
            className="h-[26px] px-1.5 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px]"
          >
            <option value="above">≥ Above</option>
            <option value="below">≤ Below</option>
          </select>
          <input
            type="number"
            step="any"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder="Price"
            className="w-[95px] h-[26px] px-2 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px] font-mono"
          />
          <input
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Webhook / alert note..."
            className="flex-1 min-w-0 h-[26px] px-2 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px]"
          />
          <button
            type="submit"
            className="h-[26px] px-2.5 rounded bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="w-3 h-3" />
            <span>Alert</span>
          </button>
        </form>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
          {alerts.length === 0 ? (
            <div className="py-4 text-center text-[11px] text-[var(--tv-text-muted)]">
              No price alerts set yet. Add an alert above to monitor live market ticks.
            </div>
          ) : (
            alerts.map((a) => (
              <div
                key={a.id}
                className="px-2 py-1.5 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] flex items-center justify-between gap-2 text-[11px]"
              >
                <div className="min-w-0 flex items-center gap-2">
                  {a.triggered ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#089981] shrink-0" />
                  ) : (
                    <Bell className="w-3.5 h-3.5 text-[#f59e0b] shrink-0" />
                  )}
                  <span className="font-mono font-semibold">
                    {a.symbol} {a.condition === 'above' ? '≥' : '≤'} {a.targetPrice}
                  </span>
                  {a.note && <span className="text-[var(--tv-text-muted)] truncate">· {a.note}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => removeAlert(a.id)}
                  className="text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Unified Strategy Signal & Paper Bot Event Stream */}
      <div className="lg:col-span-7 border border-[var(--tv-border)] rounded bg-[var(--tv-bg-canvas)] p-2.5 flex flex-col min-h-0 gap-2">
        <div className="flex items-center justify-between font-semibold text-[12px]">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#089981]" />
            <span>Live Strategy &amp; Bot Event Stream</span>
          </span>
          <span className="text-[10px] text-[var(--tv-text-muted)]">
            {paperOrders.length} bot events · {recentSignals.length} backtest signals
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 font-mono text-[11px]">
          {paperOrders.map((o) => (
            <div
              key={o.id}
              className="px-2 py-1 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-1.5 truncate">
                <Bot className="w-3 h-3 text-[var(--tv-accent)] shrink-0" />
                <span className="uppercase font-bold text-[#089981]">[{o.action}]</span>
                <span>
                  {o.symbol} {o.quantity} @ {o.price} — {o.reason}
                </span>
              </span>
              <span className="text-[10px] text-[var(--tv-text-muted)] shrink-0">
                {o.timestamp.slice(11, 19)}
              </span>
            </div>
          ))}
          {recentSignals.map((t) => (
            <div
              key={`bt-${t.tradeNumber}`}
              className="px-2 py-1 rounded bg-[var(--tv-bg-elevated)]/65 border border-[var(--tv-border)]/70 flex items-center justify-between gap-2"
            >
              <span>
                [BACKTEST #{t.tradeNumber}] {t.side.toUpperCase()} Entry {t.entryPrice.toFixed(2)} → Exit{' '}
                {t.exitPrice.toFixed(2)} ({t.exitReason})
              </span>
              <span className={t.netProfit >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                {t.netProfit >= 0 ? '+' : ''}${t.netProfit.toFixed(2)}
              </span>
            </div>
          ))}
          {paperOrders.length === 0 && recentSignals.length === 0 && (
            <div className="py-6 text-center font-sans text-[var(--tv-text-muted)]">
              Run a backtest or deploy an Auto Paper Bot to stream real-time strategy signals here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
