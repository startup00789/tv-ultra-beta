import { Eye, EyeOff, Layers, Lock, Sliders, Trash2, Unlock } from 'lucide-react';
import { useWorkspaceStore } from '../../state/workspaceStore';

export function ObjectTreePanel() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const indicators = useWorkspaceStore((s) => s.indicators);
  const drawings = useWorkspaceStore((s) => s.drawings);
  const selectedDrawingId = useWorkspaceStore((s) => s.selectedDrawingId);

  const toggleIndicatorVisibility = useWorkspaceStore((s) => s.toggleIndicatorVisibility);
  const removeIndicator = useWorkspaceStore((s) => s.removeIndicator);
  const selectDrawing = useWorkspaceStore((s) => s.selectDrawing);
  const openDrawingSettings = useWorkspaceStore((s) => s.openDrawingSettings);
  const updateDrawing = useWorkspaceStore((s) => s.updateDrawing);
  const deleteSelectedDrawing = useWorkspaceStore((s) => s.deleteSelectedDrawing);

  const symbolDrawings = drawings.filter((d) => d.symbol === symbol);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 py-2.5 border-b border-[var(--tv-border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 font-semibold text-[13px] text-[var(--tv-text-primary)]">
          <Layers className="w-4 h-4 text-[var(--tv-accent)]" />
          <span>Object Tree ({symbol})</span>
        </div>
        <span className="text-[11px] text-[var(--tv-text-muted)]">
          {indicators.length + symbolDrawings.length} items
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-3 text-[12px]">
        {/* Indicators */}
        <div>
          <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
            Indicators ({indicators.length})
          </div>
          {indicators.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-[var(--tv-text-muted)]">
              No active indicators
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {indicators.map((ind) => (
                <div
                  key={ind.instanceId}
                  className="px-2 py-1.5 rounded-[4px] bg-[var(--tv-bg-elevated)] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: ind.color }}
                    />
                    <span className="truncate text-[var(--tv-text-primary)]">
                      {ind.name} ({Object.values(ind.params).join(', ') || 'default'})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleIndicatorVisibility(ind.instanceId)}
                      className="p-1 rounded hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
                    >
                      {ind.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeIndicator(ind.instanceId)}
                      className="p-1 rounded hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drawings */}
        <div>
          <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
            Drawings ({symbolDrawings.length})
          </div>
          {symbolDrawings.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-[var(--tv-text-muted)]">
              No drawings on {symbol}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {symbolDrawings.map((d) => {
                const selected = d.id === selectedDrawingId;
                return (
                  <div
                    key={d.id}
                    onClick={() => selectDrawing(d.id)}
                    className={`px-2 py-1.5 rounded-[4px] flex items-center justify-between gap-2 cursor-pointer ${
                      selected
                        ? 'bg-[var(--tv-bg-hover)] border border-[var(--tv-accent)]/60'
                        : 'bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="capitalize truncate text-[var(--tv-text-primary)]">
                        {d.title || d.tool.replace(/_/g, ' ')}
                        {d.text ? `: ${d.text}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Customize drawing style & coordinates"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawingSettings(d.id);
                        }}
                        className="p-1 rounded hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-muted)] hover:text-[var(--tv-accent)] cursor-pointer"
                      >
                        <Sliders className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateDrawing(d.id, { locked: !d.locked });
                        }}
                        className="p-1 rounded hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-muted)] cursor-pointer"
                      >
                        {d.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateDrawing(d.id, { visible: !d.visible });
                        }}
                        className="p-1 rounded hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-muted)] cursor-pointer"
                      >
                        {d.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectDrawing(d.id);
                          deleteSelectedDrawing();
                        }}
                        className="p-1 rounded hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
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
