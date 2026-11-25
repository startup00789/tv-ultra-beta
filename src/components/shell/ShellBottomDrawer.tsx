import { Maximize2, Minimize2, X } from 'lucide-react';
import { useWorkspaceStore, type BottomTab } from '../../state/workspaceStore';
import type { WorkspaceSlots } from './slots';

const BOTTOM_TABS: ReadonlyArray<{ id: BottomTab; label: string }> = [
  { id: 'backtester', label: 'Strategy Tester (Ultra 40K)' },
  { id: 'forward_test', label: 'Forward Test · Live Demo' },
  { id: 'script', label: 'Pine Script Editor' },
  { id: 'ai', label: 'AI Quant Console' },
  { id: 'alerts', label: 'Execution & Alerts Log' },
];

interface ShellBottomDrawerProps {
  slots?: WorkspaceSlots;
}

export function ShellBottomDrawer({ slots }: ShellBottomDrawerProps) {
  const bottomDrawerOpen = useWorkspaceStore((s) => s.bottomDrawerOpen);
  const bottomDrawerHeight = useWorkspaceStore((s) => s.bottomDrawerHeight);
  const bottomDrawerExpanded = useWorkspaceStore((s) => s.bottomDrawerExpanded);
  const activeBottomTab = useWorkspaceStore((s) => s.activeBottomTab);
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);

  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);
  const setBottomDrawerOpen = useWorkspaceStore((s) => s.setBottomDrawerOpen);
  const setBottomDrawerHeight = useWorkspaceStore((s) => s.setBottomDrawerHeight);
  const toggleBottomDrawerExpanded = useWorkspaceStore((s) => s.toggleBottomDrawerExpanded);
  const openConnectionsModal = useWorkspaceStore((s) => s.openConnectionsModal);

  if (!bottomDrawerOpen) return null;

  const slotPanel = slots?.bottomPanels?.[activeBottomTab];
  const effectiveHeight = bottomDrawerExpanded ? 510 : bottomDrawerHeight;
  const fullBleed =
    activeBottomTab === 'backtester' ||
    activeBottomTab === 'forward_test' ||
    activeBottomTab === 'autotrade';

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = effectiveHeight;
    if (bottomDrawerExpanded) toggleBottomDrawerExpanded();

    const onMove = (ev: PointerEvent) => {
      const nextH = Math.max(180, Math.min(620, startH + (startY - ev.clientY)));
      setBottomDrawerHeight(nextH);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      data-testid="bottom-drawer"
      style={{ height: `${effectiveHeight}px` }}
      className="shrink-0 tv-panel border border-[var(--tv-border)] flex flex-col overflow-hidden relative"
    >
      {/* Drag-to-resize top handle */}
      <div
        onPointerDown={handleResizePointerDown}
        title="Drag to resize bottom panel"
        className="h-[4px] w-full cursor-ns-resize hover:bg-[var(--tv-accent)]/60 transition-colors shrink-0"
      />

      {/* Tab Header */}
      <div className="h-[34px] shrink-0 border-b border-[var(--tv-border)] px-2 flex items-center justify-between bg-[var(--tv-bg-elevated)]">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {BOTTOM_TABS.map((tab) => {
            const active = activeBottomTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`bottom-tab-${tab.id}`}
                onClick={() => setActiveBottomTab(tab.id)}
                className={`h-[26px] px-2.5 rounded-[4px] text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] font-semibold'
                    : 'text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="bottom-drawer-expand-btn"
            aria-label={bottomDrawerExpanded ? 'Restore bottom drawer height' : 'Expand bottom drawer'}
            title={bottomDrawerExpanded ? 'Restore size' : 'Expand workspace height'}
            onClick={toggleBottomDrawerExpanded}
            className="w-[26px] h-[26px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
          >
            {bottomDrawerExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            aria-label="Close bottom drawer"
            onClick={() => setBottomDrawerOpen(false)}
            className="w-[26px] h-[26px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className={`flex-1 min-h-0 overflow-auto ${fullBleed ? '' : 'p-3'}`}>
        {slotPanel ? (
          slotPanel
        ) : (
          <div className="h-full flex flex-col items-start justify-center gap-2 text-[12px] text-[var(--tv-text-secondary)]">
            <div className="font-semibold text-[var(--tv-text-primary)]">
              {BOTTOM_TABS.find((t) => t.id === activeBottomTab)?.label} — {symbol} ({timeframe})
            </div>
            <button
              type="button"
              onClick={() =>
                openConnectionsModal(
                  activeBottomTab === 'bigquery' ? 'bigquery' : 'opencode',
                )
              }
              className="px-3 py-1.5 rounded-[4px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white text-[12px] font-medium cursor-pointer"
            >
              Configure Connections
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
