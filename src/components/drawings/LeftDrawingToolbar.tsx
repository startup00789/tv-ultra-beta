import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  Activity,
  ArrowUpRight,
  Brush,
  Circle,
  Crosshair,
  Eye,
  EyeOff,
  GitCommitHorizontal,
  Grid,
  Highlighter,
  Lock,
  Magnet,
  MessageSquare,
  Minus,
  MoveDiagonal,
  PencilRuler,
  Plus,
  Repeat,
  Ruler,
  SeparatorVertical,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Triangle,
  Type,
  Unlock,
} from 'lucide-react';
import { useWorkspaceStore, type DrawingToolId } from '../../state/workspaceStore';

interface FlyoutItem {
  id: DrawingToolId;
  label: string;
  shortcut?: string;
  section?: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

interface ToolButtonDef {
  id: DrawingToolId;
  label: string;
  flyoutGroup?: string;
  flyoutItems?: readonly FlyoutItem[];
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

const TOOL_CATALOG: ReadonlyArray<ToolButtonDef> = [
  {
    id: 'crosshair',
    label: 'Crosshair',
    icon: Crosshair,
  },
  {
    id: 'trendline',
    label: 'Trend Line Tools',
    flyoutGroup: 'trend',
    icon: TrendingUp,
    flyoutItems: [
      { id: 'trendline', label: 'Trendline', shortcut: 'Alt+T', section: 'Lines', icon: TrendingUp },
      { id: 'ray', label: 'Ray', section: 'Lines', icon: ArrowUpRight },
      { id: 'extended', label: 'Extended Line', section: 'Lines', icon: MoveDiagonal },
      { id: 'hray', label: 'Horizontal Ray', shortcut: 'Alt+J', section: 'Lines', icon: Minus },
      { id: 'hline', label: 'Horizontal Line', shortcut: 'Alt+H', section: 'Lines', icon: Minus },
      { id: 'vline', label: 'Vertical Line', shortcut: 'Alt+V', section: 'Lines', icon: SeparatorVertical },
      { id: 'crossline', label: 'Crossline', shortcut: 'Alt+C', section: 'Lines', icon: Plus },
      { id: 'arrow', label: 'Arrow', section: 'Lines', icon: ArrowUpRight },
      { id: 'path', label: 'Polyline Path (Multi-Pt)', section: 'Lines', icon: Activity },
      { id: 'channel', label: 'Parallel Channel (3-Pt)', section: 'Channels', icon: SlidersHorizontal },
      { id: 'regression', label: 'Regression Trend', section: 'Channels', icon: Activity },
      { id: 'pitchfork', label: 'Andrews / Schiff Pitchfork (3-Pt)', section: 'Pitchforks', icon: GitCommitHorizontal },
    ],
  },
  { id: 'hline', label: 'Horizontal Line (Alt+H)', icon: Minus },
  { id: 'vline', label: 'Vertical Line (Alt+V)', icon: SeparatorVertical },
  { id: 'ray', label: 'Ray', icon: ArrowUpRight },
  {
    id: 'fib',
    label: 'Gann, Fibonacci & Harmonic Tools',
    flyoutGroup: 'fib',
    icon: SlidersHorizontal,
    flyoutItems: [
      { id: 'fib', label: 'Fib Retracement (OTE)', shortcut: 'Alt+F', section: 'Fibonacci', icon: SlidersHorizontal },
      { id: 'fib_ext', label: 'Trend-Based Fib Extension (3-Pt)', section: 'Fibonacci', icon: TrendingUp },
      { id: 'fib_fan', label: 'Fib Speed Resistance Fan', section: 'Fibonacci', icon: MoveDiagonal },
      { id: 'gann_box', label: 'Gann Box', section: 'Gann', icon: Grid },
      { id: 'abcd', label: 'ABCD Harmonic Pattern (4-Pt)', section: 'Patterns', icon: Activity },
      { id: 'xabcd', label: 'XABCD Harmonic Pattern (5-Pt)', section: 'Patterns', icon: Activity },
      { id: 'head_shoulders', label: 'Head & Shoulders (7-Pt)', section: 'Patterns', icon: Activity },
      { id: 'elliott_wave', label: 'Elliott Impulse Wave (0-5)', section: 'Patterns', icon: Activity },
    ],
  },
  {
    id: 'long_position',
    label: 'Forecasting, Position & Volume Profile',
    flyoutGroup: 'forecasting',
    icon: TrendingUp,
    flyoutItems: [
      { id: 'long_position', label: 'Long Position (R:R)', section: 'Forecasting', icon: TrendingUp },
      { id: 'short_position', label: 'Short Position (R:R)', section: 'Forecasting', icon: TrendingDown },
      { id: 'anchored_vp', label: 'Fixed-Range Volume Profile (FRVP)', section: 'Volume-Based', icon: SlidersHorizontal },
      { id: 'anchored_vwap', label: 'Anchored VWAP', section: 'Volume-Based', icon: Activity },
      { id: 'price_range', label: 'Price Range', section: 'Measurers', icon: Ruler },
      { id: 'date_range', label: 'Date Range', section: 'Measurers', icon: SeparatorVertical },
    ],
  },
  {
    id: 'rect',
    label: 'Geometric Shapes',
    flyoutGroup: 'shapes',
    icon: Square,
    flyoutItems: [
      { id: 'rect', label: 'Rectangle', shortcut: 'Alt+Shift+R', section: 'Shapes', icon: Square },
      { id: 'circle', label: 'Circle', section: 'Shapes', icon: Circle },
      { id: 'triangle', label: 'Triangle', section: 'Shapes', icon: Triangle },
      { id: 'brush', label: 'Brush', section: 'Brushes', icon: Brush },
      { id: 'highlighter', label: 'Highlighter', section: 'Brushes', icon: Highlighter },
    ],
  },
  { id: 'brush', label: 'Brush', icon: Brush },
  {
    id: 'text',
    label: 'Annotation Tools',
    flyoutGroup: 'annotation',
    icon: Type,
    flyoutItems: [
      { id: 'text', label: 'Text Note', section: 'Annotations', icon: Type },
      { id: 'callout', label: 'Callout Bubble', section: 'Annotations', icon: MessageSquare },
    ],
  },
  { id: 'measure', label: 'Measure', icon: Ruler },
  { id: 'ai-range', label: 'AI Range (Send to DeepSeek / OpenCode / AI)', icon: Sparkles },
];

export function LeftDrawingToolbar() {
  const activeTool = useWorkspaceStore((s) => s.activeTool);
  const defaultToolStyles = useWorkspaceStore((s) => s.defaultToolStyles);
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
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);

  const [openFlyout, setOpenFlyout] = useState<{
    group: string;
    top: number;
    left: number;
    items: readonly FlyoutItem[];
  } | null>(null);
  const [selectedVariantByGroup, setSelectedVariantByGroup] = useState<
    Record<string, DrawingToolId>
  >({});

  const asideRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Close flyout on outside click or Escape
  useEffect(() => {
    if (!openFlyout) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        flyoutRef.current?.contains(target) ||
        asideRef.current?.contains(target)
      ) {
        return;
      }
      setOpenFlyout(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenFlyout(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openFlyout]);

  // TradingView-parity Alt+Hotkeys for core drawing tools
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }
        if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }
      if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && key === 'm') {
        e.preventDefault();
        toggleMagnetMode();
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (key === 't') {
        e.preventDefault();
        setActiveTool('trendline');
      } else if (key === 'h') {
        e.preventDefault();
        setActiveTool('hline');
      } else if (key === 'j') {
        e.preventDefault();
        setActiveTool('hray');
      } else if (key === 'v') {
        e.preventDefault();
        setActiveTool('vline');
      } else if (key === 'c') {
        e.preventDefault();
        setActiveTool('crossline');
      } else if (key === 'f') {
        e.preventDefault();
        setActiveTool('fib');
      } else if (key === 'r') {
        e.preventDefault();
        setActiveTool('rect');
      } else if (key === 'p') {
        e.preventDefault();
        setActiveTool('pitchfork');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, setActiveTool, toggleMagnetMode, undo]);

  const toggleFlyoutMenu = (
    group: string,
    items: readonly FlyoutItem[],
    anchorEl: HTMLElement | null,
  ) => {
    if (openFlyout?.group === group) {
      setOpenFlyout(null);
      return;
    }
    const rect = anchorEl?.getBoundingClientRect();
    setOpenFlyout({
      group,
      top: rect ? Math.max(44, Math.min(window.innerHeight - 280, rect.top)) : 120,
      left: rect ? rect.right + 6 : 58,
      items,
    });
  };

  return (
    <aside
      ref={asideRef}
      data-testid="left-drawing-toolbar"
      aria-label="Drawing tools"
      className="w-[52px] shrink-0 tv-panel flex flex-col items-center justify-between py-1.5 overflow-y-auto no-scrollbar"
    >
      {/* Primary Drawing Tools + Flyout Submenus */}
      <div className="flex flex-col items-center gap-0.5 w-full px-1">
        {TOOL_CATALOG.map((tool) => {
          const displayedId = tool.flyoutGroup
            ? (selectedVariantByGroup[tool.flyoutGroup] ?? tool.id)
            : tool.id;
          const activeVariant =
            tool.flyoutItems?.find((it) => it.id === displayedId) ?? null;
          const Icon = activeVariant?.icon ?? tool.icon;
          const isGroupActive =
            activeTool === tool.id ||
            Boolean(tool.flyoutItems?.some((it) => it.id === activeTool));

          return (
            <div key={tool.id} className="relative flex items-center justify-center w-full">
              <button
                type="button"
                data-testid={`draw-tool-${tool.id}`}
                aria-label={activeVariant?.label ?? tool.label}
                aria-pressed={isGroupActive}
                title={activeVariant?.label ?? tool.label}
                onClick={() => {
                  setActiveTool(displayedId);
                  setOpenFlyout(null);
                }}
                onContextMenu={(e) => {
                  if (tool.flyoutGroup && tool.flyoutItems) {
                    e.preventDefault();
                    toggleFlyoutMenu(tool.flyoutGroup, tool.flyoutItems, e.currentTarget);
                  }
                }}
                className={`group/tool relative w-[38px] h-[34px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
                  isGroupActive
                    ? 'bg-[#2962ff]/18 text-[#2962ff]'
                    : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                }`}
              >
                <Icon className="w-[17px] h-[17px]" strokeWidth={1.6} />
                {tool.id !== 'crosshair' &&
                  tool.id !== 'ai-range' &&
                  defaultToolStyles[displayedId]?.color && (
                    <span
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3.5 h-[2px] rounded-full"
                      style={{ backgroundColor: defaultToolStyles[displayedId]?.color }}
                    />
                  )}
                {tool.id === 'ai-range' && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--tv-accent)]" />
                )}
              </button>

              {tool.flyoutGroup && tool.flyoutItems && (
                <button
                  type="button"
                  data-testid={`draw-flyout-${tool.flyoutGroup}`}
                  aria-label={`Open ${tool.label} menu`}
                  title={`More ${tool.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFlyoutMenu(
                      tool.flyoutGroup!,
                      tool.flyoutItems!,
                      e.currentTarget.parentElement,
                    );
                  }}
                  className="absolute right-0 bottom-0.5 w-[13px] h-[14px] rounded-[2px] flex items-center justify-center text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] hover:bg-[var(--tv-bg-hover)] cursor-pointer"
                >
                  <span className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[3.5px] border-t-current rotate-[-45deg]" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Fixed-positioned TradingView Flyout Popover */}
      {openFlyout && (
        <div
          ref={flyoutRef}
          data-testid={`draw-flyout-menu-${openFlyout.group}`}
          style={{ top: `${openFlyout.top}px`, left: `${openFlyout.left}px` }}
          className="fixed z-50 w-[236px] rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl py-1.5 max-h-[360px] overflow-y-auto text-[12px]"
        >
          {openFlyout.items.map((item, idx) => {
            const Icon = item.icon;
            const prevSection = idx > 0 ? openFlyout.items[idx - 1].section : null;
            const showSection = item.section && item.section !== prevSection;
            const isSelected = activeTool === item.id;
            return (
              <div key={item.id}>
                {showSection && (
                  <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                    {item.section}
                  </div>
                )}
                <button
                  type="button"
                  data-testid={`flyout-item-${item.id}`}
                  onClick={() => {
                    setActiveTool(item.id);
                    setSelectedVariantByGroup((prev) => ({
                      ...prev,
                      [openFlyout.group]: item.id,
                    }));
                    setOpenFlyout(null);
                  }}
                  className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-[var(--tv-bg-hover)] cursor-pointer ${
                    isSelected
                      ? 'bg-[#2962ff]/15 text-[#2962ff] font-medium'
                      : 'text-[var(--tv-text-primary)]'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.shortcut && (
                    <span className="text-[10px] text-[var(--tv-text-muted)] shrink-0">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Drawing State Modifiers */}
      <div className="flex flex-col items-center gap-0.5 w-full px-1 pt-1.5">
        <div className="tv-divider-h mb-1" />

        <button
          type="button"
          data-testid="draw-toggle-magnet"
          aria-label="Magnet mode"
          aria-pressed={magnetMode}
          title="Weak Magnet (Snap to OHLC)"
          onClick={toggleMagnetMode}
          className={`w-[38px] h-[32px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
            magnetMode
              ? 'bg-[#2962ff]/18 text-[#2962ff]'
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
          className={`w-[38px] h-[32px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
            keepDrawing
              ? 'bg-[#2962ff]/18 text-[#2962ff]'
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
          className={`w-[38px] h-[32px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
            lockDrawings
              ? 'bg-[#2962ff]/18 text-[#2962ff]'
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
          className={`w-[38px] h-[32px] rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
            hideDrawings
              ? 'bg-[#2962ff]/18 text-[#2962ff]'
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
          className="w-[38px] h-[32px] rounded-[4px] flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[#f23645] transition-colors cursor-pointer"
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
