import type { ComponentType } from 'react';
import {
  ArrowUpRight,
  Brush,
  Crosshair,
  Eye,
  EyeOff,
  GitCommitHorizontal,
  Lock,
  Magnet,
  Minus,
  PencilRuler,
  Repeat,
  Ruler,
  SeparatorVertical,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  TrendingUp,
  Type,
  Unlock,
} from 'lucide-react';
import { useWorkspaceStore, type DrawingToolId } from '../../state/workspaceStore';
import type { WorkspaceSlots } from './slots';

interface ToolButtonDef {
  id: DrawingToolId;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

const DRAWING_TOOLS: readonly ToolButtonDef[] = [
  { id: 'crosshair', label: 'Crosshair', icon: Crosshair },
  { id: 'trendline', label: 'Trend Line', icon: TrendingUp },
  { id: 'hline', label: 'Horizontal Line', icon: Minus },
  { id: 'vline', label: 'Vertical Line', icon: SeparatorVertical },
  { id: 'ray', label: 'Ray', icon: ArrowUpRight },
  { id: 'fib', label: 'Fib Retracement', icon: SlidersHorizontal },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'brush', label: 'Brush', icon: Brush },
  { id: 'text', label: 'Text Annotation', icon: Type },
  { id: 'measure', label: 'Measure', icon: Ruler },
  { id: 'ai-range', label: 'AI Range', icon: Sparkles },
];

interface ShellLeftToolbarProps {
  slots?: WorkspaceSlots;
}

export function ShellLeftToolbar({ slots }: ShellLeftToolbarProps) {
  const activeTool = useWorkspaceStore((s) => s.activeTool);
  const magnetMode = useWorkspaceStore((s) => s.magnetMode);
  const keepDrawing = useWorkspaceStore((s) => s.keepDrawing);
  const lockDrawings = useWorkspaceStore((s) => s.lockDrawings);
  const hideDrawings = useWorkspaceStore((s) => s.hideDrawings);
  const drawingCount = useWorkspaceStore((s) => s.drawings.length);

  const setActiveTool = useWorkspaceStore((s) => s.setActiveTool);
  const toggleMagnetMode = useWorkspaceStore((s) => s.toggleMagnetMode);
  const toggleKeepDrawing = useWorkspaceStore((s) => s.toggleKeepDrawing);
  const toggleLockDrawings = useWorkspaceStore((s) => s.toggleLockDrawings);
  const toggleHideDrawings = useWorkspaceStore((s) => s.toggleHideDrawings);
  const removeAllDrawings = useWorkspaceStore((s) => s.removeAllDrawings);

  if (slots?.leftDrawingToolbar) {
    return <>{slots.leftDrawingToolbar}</>;
  }

  return (
    <aside
      data-testid="left-drawing-toolbar"
      aria-label="Drawing tools"
      className="w-[52px] shrink-0 tv-panel flex flex-col items-center justify-between py-1.5 overflow-y-auto no-scrollbar"
    >
      {/* Primary Drawing Tools */}
      <div className="flex flex-col items-center gap-0.5 w-full px-1">
        {DRAWING_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              data-testid={`draw-tool-${tool.id}`}
              aria-label={tool.label}
              aria-pressed={active}
              title={tool.label}
              onClick={() => setActiveTool(tool.id)}
              className={`relative w-[36px] h-[34px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
                active
                  ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)]'
                  : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.6} />
              {tool.id === 'ai-range' && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--tv-accent)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom State Modifiers */}
      <div className="flex flex-col items-center gap-0.5 w-full px-1 pt-1.5">
        <div className="tv-divider-h mb-1" />

        <button
          type="button"
          data-testid="draw-toggle-magnet"
          aria-label="Magnet mode"
          aria-pressed={magnetMode}
          title="Weak Magnet (Snap to OHLC)"
          onClick={toggleMagnetMode}
          className={`w-[36px] h-[32px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
            magnetMode
              ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)]'
              : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
          }`}
        >
          <Magnet className="w-4 h-4" strokeWidth={1.6} />
        </button>

        <button
          type="button"
          data-testid="draw-toggle-keep"
          aria-label="Keep drawing"
          aria-pressed={keepDrawing}
          title="Stay in Drawing Mode"
          onClick={toggleKeepDrawing}
          className={`w-[36px] h-[32px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
            keepDrawing
              ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)]'
              : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
          }`}
        >
          {keepDrawing ? (
            <Repeat className="w-4 h-4" strokeWidth={1.6} />
          ) : (
            <PencilRuler className="w-4 h-4" strokeWidth={1.6} />
          )}
        </button>

        <button
          type="button"
          data-testid="draw-toggle-lock"
          aria-label="Lock all drawings"
          aria-pressed={lockDrawings}
          title="Lock All Drawing Tools"
          onClick={toggleLockDrawings}
          className={`w-[36px] h-[32px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
            lockDrawings
              ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)]'
              : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
          }`}
        >
          {lockDrawings ? (
            <Lock className="w-4 h-4" strokeWidth={1.6} />
          ) : (
            <Unlock className="w-4 h-4" strokeWidth={1.6} />
          )}
        </button>

        <button
          type="button"
          data-testid="draw-toggle-hide"
          aria-label="Hide all drawings"
          aria-pressed={hideDrawings}
          title="Hide All Drawings"
          onClick={toggleHideDrawings}
          className={`w-[36px] h-[32px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
            hideDrawings
              ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-accent)]'
              : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
          }`}
        >
          {hideDrawings ? (
            <EyeOff className="w-4 h-4" strokeWidth={1.6} />
          ) : (
            <Eye className="w-4 h-4" strokeWidth={1.6} />
          )}
        </button>

        <button
          type="button"
          data-testid="draw-remove-all"
          aria-label="Remove all drawings"
          title={`Remove all drawings (${drawingCount})`}
          onClick={removeAllDrawings}
          className="w-[36px] h-[32px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-bear)] transition-colors cursor-pointer"
        >
          {drawingCount > 0 ? (
            <Trash2 className="w-4 h-4" strokeWidth={1.6} />
          ) : (
            <GitCommitHorizontal className="w-4 h-4 opacity-50" strokeWidth={1.6} />
          )}
        </button>
      </div>
    </aside>
  );
}
