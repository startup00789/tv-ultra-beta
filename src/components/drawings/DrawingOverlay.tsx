import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, Logical, SeriesType, UTCTimestamp } from 'lightweight-charts';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Copy,
  GripVertical,
  Lock,
  RotateCcw,
  Sliders,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  TV_DRAWING_PALETTE,
  type ChartOverlayData,
  type DrawingLineStyle,
  type DrawingObject,
  type DrawingPoint,
  type DrawingStyleTemplate,
  type DrawingToolType,
  type OHLCVBar,
  type Timeframe,
} from '../../../shared/types';
import {
  computeSessionAndLiquidityLevels,
  computeSmartMoneyConcepts,
  computeVolumeProfile,
} from '../../lib/technicalOverlays';
import { useWorkspaceStore } from '../../state/workspaceStore';

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000,
};

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1] as const;
const FIB_EXT_LEVELS = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618] as const;
const GANN_LEVELS = [0, 0.25, 0.5, 0.75, 1] as const;

const REQUIRED_ANCHORS: Partial<Record<DrawingToolType, number>> = {
  channel: 3,
  pitchfork: 3,
  fib_ext: 3,
  abcd: 4,
  xabcd: 5,
  elliott_wave: 6,
  head_shoulders: 7,
  path: 12,
};

const BOX_RESIZE_TOOLS = new Set<DrawingToolType>([
  'rect',
  'gann_box',
  'measure',
  'price_range',
  'date_range',
  'anchored_vp',
]);

const BORDER_CAPABLE_TOOLS = new Set<DrawingToolType>([
  'rect',
  'channel',
  'circle',
  'triangle',
  'callout',
  'text',
  'gann_box',
  'measure',
  'price_range',
  'date_range',
  'long_position',
  'short_position',
  'anchored_vp',
]);

const FILL_CAPABLE_TOOLS = new Set<DrawingToolType>([
  'rect',
  'channel',
  'circle',
  'triangle',
  'gann_box',
  'pitchfork',
  'fib',
  'fib_ext',
  'xabcd',
  'abcd',
  'head_shoulders',
  'callout',
  'text',
  'price_range',
  'date_range',
  'measure',
  'long_position',
  'short_position',
  'regression',
]);

type BoxHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const BOX_HANDLE_CURSORS: Record<BoxHandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

function isBoxHandleId(val: unknown): val is BoxHandleId {
  return (
    typeof val === 'string' &&
    (val === 'nw' ||
      val === 'n' ||
      val === 'ne' ||
      val === 'e' ||
      val === 'se' ||
      val === 's' ||
      val === 'sw' ||
      val === 'w')
  );
}

function getRequiredPoints(tool: DrawingToolType): number {
  return REQUIRED_ANCHORS[tool] ?? 2;
}

function getDefaultColorForTool(tool: DrawingToolType): string {
  if (tool === 'long_position') return '#089981';
  if (tool === 'short_position') return '#f23645';
  if (tool === 'fib' || tool === 'fib_ext' || tool === 'anchored_vp' || tool === 'highlighter') {
    return '#f59e0b';
  }
  if (tool === 'gann_box' || tool === 'xabcd' || tool === 'anchored_vwap') {
    return '#a855f7';
  }
  if (tool === 'text') return '#d1d4dc';
  return '#2962ff';
}

function getDashPattern(
  style: DrawingLineStyle | undefined,
  width: number,
): string | undefined {
  const s = style ?? 'solid';
  const w = Math.max(1, width);
  if (s === 'dashed') {
    return `${Math.max(6, w * 2.8).toFixed(1)} ${Math.max(4, w * 1.9).toFixed(1)}`;
  }
  if (s === 'dotted') {
    return `${Math.max(1.2, w * 0.55).toFixed(1)} ${Math.max(3.6, w * 2.25).toFixed(1)}`;
  }
  return undefined;
}

function formatToolDisplayName(tool: string): string {
  const names: Record<string, string> = {
    trendline: 'Trend Line',
    hline: 'Horizontal Line',
    hray: 'Horizontal Ray',
    vline: 'Vertical Line',
    crossline: 'Cross Line',
    ray: 'Ray',
    extended: 'Extended Line',
    arrow: 'Arrow',
    path: 'Path',
    channel: 'Parallel Channel',
    regression: 'Regression Trend',
    pitchfork: 'Pitchfork',
    fib: 'Fib Retracement',
    fib_ext: 'Fib Extension',
    fib_fan: 'Fib Fan',
    gann_box: 'Gann Box',
    abcd: 'ABCD Pattern',
    xabcd: 'XABCD Harmonic',
    head_shoulders: 'Head & Shoulders',
    elliott_wave: 'Elliott Wave',
    long_position: 'Long Position',
    short_position: 'Short Position',
    anchored_vp: 'Fixed Range VP',
    anchored_vwap: 'Anchored VWAP',
    price_range: 'Price Range',
    date_range: 'Date Range',
    rect: 'Rectangle',
    circle: 'Circle',
    triangle: 'Triangle',
    brush: 'Brush',
    highlighter: 'Highlighter',
    text: 'Text Note',
    callout: 'Callout',
    measure: 'Measure',
  };
  return names[tool] ?? tool.replace(/_/g, ' ');
}

function hexToRgba(hexColor: string | undefined, alpha: number, fallback = '#2962ff'): string {
  const c = (hexColor && hexColor.startsWith('#') ? hexColor : fallback).replace('#', '');
  const full =
    c.length === 3
      ? `${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`
      : c.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 41;
  const g = parseInt(full.slice(2, 4), 16) || 98;
  const b = parseInt(full.slice(4, 6), 16) || 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function formatPriceSmart(val: number, symbolHint: string): string {
  const sym = symbolHint.toUpperCase();
  if (sym.endsWith('JPY') || sym === 'USDINR' || sym === 'XAGUSD' || sym === 'XAGEUR' || sym === 'DXY') {
    return val.toFixed(3);
  }
  if (Math.abs(val) < 10) return val.toFixed(4);
  return val.toFixed(2);
}

function formatDeltaWithPips(dp: number, refPrice: number, symbolHint: string): string {
  const sym = symbolHint.toUpperCase();
  const sign = dp >= 0 ? '+' : '';
  if (sym.endsWith('JPY')) {
    const pips = dp * 100;
    return `${sign}${dp.toFixed(3)} (${sign}${pips.toFixed(1)}p)`;
  }
  if (Math.abs(refPrice) < 10 && !sym.endsWith('USDT')) {
    const pips = dp * 10_000;
    return `${sign}${dp.toFixed(4)} (${sign}${pips.toFixed(1)}p)`;
  }
  return `${sign}${dp.toFixed(2)}`;
}

function renderArrowHead(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
): React.ReactNode {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 4) return null;
  const ux = dx / len;
  const uy = dy / len;
  const ax1 = toX - ux * 10 - uy * 5;
  const ay1 = toY - uy * 10 + ux * 5;
  const ax2 = toX - ux * 10 + uy * 5;
  const ay2 = toY - uy * 10 - ux * 5;
  return <polygon points={`${toX},${toY} ${ax1},${ay1} ${ax2},${ay2}`} fill={color} />;
}

function classifyHarmonicPattern(pts: DrawingPoint[]): string {
  if (pts.length < 5) return 'Harmonic';
  const xa = Math.abs(pts[1].price - pts[0].price);
  if (xa <= 1e-8) return 'Harmonic';
  const ab = Math.abs(pts[2].price - pts[1].price) / xa;
  const xd = Math.abs(pts[4].price - pts[1].price) / xa;
  if (Math.abs(ab - 0.618) <= 0.08 && Math.abs(xd - 0.786) <= 0.08) return 'Gartley';
  if (ab >= 0.34 && ab <= 0.54 && Math.abs(xd - 0.886) <= 0.08) return 'Bat';
  if (Math.abs(ab - 0.786) <= 0.09 && xd >= 1.2 && xd <= 1.68) return 'Butterfly';
  if (ab >= 0.34 && ab <= 0.66 && xd >= 1.52 && xd <= 1.72) return 'Crab';
  return `XABCD (B:${ab.toFixed(2)} D:${xd.toFixed(2)})`;
}

function snapAngleCoords(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: x2, y: y2 };
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: x1 + Math.cos(snapped) * dist,
    y: y1 + Math.sin(snapped) * dist,
  };
}

interface DraftState {
  points: DrawingPoint[];
  startX: number;
  startY: number;
  current: DrawingPoint;
  dragMoved: boolean;
  brushPoints?: DrawingPoint[];
}

interface DragMoveState {
  drawingId: string;
  handleIndex: number | 'all' | 'stop' | 'target' | BoxHandleId;
  originAnchor: DrawingPoint;
  initialPoints: DrawingPoint[];
  undoRecorded: boolean;
}

export interface DrawingOverlayProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<SeriesType> | null;
  bars: OHLCVBar[];
  symbol: string;
  timeframe: Timeframe;
  chartOverlay: ChartOverlayData | null;
  overlayVisible: boolean;
  plotWidth: number;
  paneHeight: number;
  revision: number;
}

function findClosestBar(bars: OHLCVBar[], time: number): OHLCVBar | null {
  if (bars.length === 0) return null;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(bars[lo - 1].time - time) < Math.abs(bars[lo].time - time)) {
    return bars[lo - 1];
  }
  return bars[lo];
}

function timeToLogicalIndex(bars: OHLCVBar[], time: number, stepSec: number): number {
  if (bars.length === 0) return 0;
  const firstTime = bars[0].time;
  const lastIdx = bars.length - 1;
  const lastTime = bars[lastIdx].time;
  if (time <= firstTime) {
    return (time - firstTime) / stepSec;
  }
  if (time >= lastTime) {
    return lastIdx + (time - lastTime) / stepSec;
  }
  let lo = 0;
  let hi = lastIdx;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time === time) return mid;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid - 1;
  }
  const left = Math.max(0, hi);
  const right = Math.min(lastIdx, lo);
  const dt = bars[right].time - bars[left].time;
  if (dt <= 0) return left;
  return left + (time - bars[left].time) / dt;
}

export function DrawingOverlay({
  chart,
  mainSeries,
  bars,
  symbol,
  timeframe,
  chartOverlay,
  overlayVisible,
  plotWidth,
  paneHeight,
  revision,
}: DrawingOverlayProps) {
  const activeTool = useWorkspaceStore((s) => s.activeTool);
  const drawings = useWorkspaceStore((s) => s.drawings);
  const selectedDrawingId = useWorkspaceStore((s) => s.selectedDrawingId);
  const defaultToolStyles = useWorkspaceStore((s) => s.defaultToolStyles);
  const magnetMode = useWorkspaceStore((s) => s.magnetMode);
  const lockDrawings = useWorkspaceStore((s) => s.lockDrawings);
  const hideDrawings = useWorkspaceStore((s) => s.hideDrawings);
  const showVolumeProfile = useWorkspaceStore((s) => s.showVolumeProfile);
  const showSmcOverlay = useWorkspaceStore((s) => s.showSmcOverlay);
  const showSessionsOverlay = useWorkspaceStore((s) => s.showSessionsOverlay);

  const addDrawing = useWorkspaceStore((s) => s.addDrawing);
  const updateDrawing = useWorkspaceStore((s) => s.updateDrawing);
  const selectDrawing = useWorkspaceStore((s) => s.selectDrawing);
  const openDrawingSettings = useWorkspaceStore((s) => s.openDrawingSettings);
  const drawingTemplates = useWorkspaceStore((s) => s.drawingTemplates);
  const applyDrawingTemplate = useWorkspaceStore((s) => s.applyDrawingTemplate);
  const setDefaultToolStyle = useWorkspaceStore((s) => s.setDefaultToolStyle);
  const reorderDrawing = useWorkspaceStore((s) => s.reorderDrawing);
  const deleteSelectedDrawing = useWorkspaceStore((s) => s.deleteSelectedDrawing);
  const setAIRangeSelection = useWorkspaceStore((s) => s.setAIRangeSelection);
  const setActiveRightTab = useWorkspaceStore((s) => s.setActiveRightTab);
  const setActiveTool = useWorkspaceStore((s) => s.setActiveTool);

  const svgRef = useRef<SVGSVGElement>(null);
  const floatingToolbarRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [dragMove, setDragMove] = useState<DragMoveState | null>(null);
  const [hoverSnap, setHoverSnap] = useState<DrawingPoint | null>(null);
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null);
  const [hoveredHandleKey, setHoveredHandleKey] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<'color' | 'fill' | 'border' | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    drawingId: string;
    x: number;
    y: number;
  } | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const toolbarDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextVal, setEditingTextVal] = useState('');

  const stepSec = TIMEFRAME_SECONDS[timeframe] ?? 86400;

  // Cancel active draft and close floating popovers on tool/symbol/selection change
  useEffect(() => {
    setDraft(null);
    setOpenPopover(null);
  }, [activeTool, symbol]);

  useEffect(() => {
    setOpenPopover(null);
  }, [selectedDrawingId]);

  // Close floating toolbar popovers when clicking outside
  useEffect(() => {
    if (!openPopover) return;
    const onPointerDownOutside = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      if (target && floatingToolbarRef.current?.contains(target)) {
        return;
      }
      setOpenPopover(null);
    };
    document.addEventListener('mousedown', onPointerDownOutside);
    return () => document.removeEventListener('mousedown', onPointerDownOutside);
  }, [openPopover]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'Escape') {
        if (openPopover) {
          setOpenPopover(null);
          return;
        }
        setDraft(null);
        setEditingTextId(null);
        setContextMenu(null);
        selectDrawing(null);
        if (activeTool !== 'crosshair') {
          setActiveTool('crosshair');
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        e.preventDefault();
        deleteSelectedDrawing();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, deleteSelectedDrawing, openPopover, selectDrawing, selectedDrawingId, setActiveTool]);

  const pixelToAnchor = useCallback(
    (x: number, y: number, applyMagnet: boolean): DrawingPoint | null => {
      if (!chart || !mainSeries || bars.length === 0) return null;
      const clampedX = Math.max(0, Math.min(plotWidth, x));
      const clampedY = Math.max(0, Math.min(paneHeight, y));

      const rawPrice = mainSeries.coordinateToPrice(clampedY);
      if (rawPrice === null || !Number.isFinite(rawPrice)) return null;

      let timeVal: number | null = null;
      const coordTime = chart.timeScale().coordinateToTime(clampedX);
      if (typeof coordTime === 'number' && Number.isFinite(coordTime)) {
        timeVal = coordTime;
      } else {
        const logical = chart.timeScale().coordinateToLogical(clampedX);
        if (logical !== null && Number.isFinite(logical)) {
          const roundedIdx = Math.round(logical);
          if (roundedIdx >= 0 && roundedIdx < bars.length) {
            timeVal = bars[roundedIdx].time;
          } else if (roundedIdx < 0) {
            timeVal = bars[0].time + roundedIdx * stepSec;
          } else {
            const lastIdx = bars.length - 1;
            timeVal = bars[lastIdx].time + (roundedIdx - lastIdx) * stepSec;
          }
        }
      }

      if (timeVal === null) return null;

      let price = Number(rawPrice);
      if (applyMagnet) {
        const nearest = findClosestBar(bars, timeVal);
        if (nearest) {
          const candidates = [nearest.open, nearest.high, nearest.low, nearest.close];
          let best = candidates[0];
          let minDist = Math.abs(price - best);
          for (const c of candidates) {
            const d = Math.abs(price - c);
            if (d < minDist) {
              minDist = d;
              best = c;
            }
          }
          price = best;
        }
      }

      return { time: timeVal, price };
    },
    [bars, chart, mainSeries, paneHeight, plotWidth, stepSec],
  );

  const anchorToPixel = useCallback(
    (pt: DrawingPoint): { x: number; y: number } | null => {
      if (!chart || !mainSeries || bars.length === 0) return null;
      const yCoord = mainSeries.priceToCoordinate(pt.price);
      if (yCoord === null || !Number.isFinite(yCoord)) return null;

      let xCoord = chart.timeScale().timeToCoordinate(pt.time as UTCTimestamp);
      if (xCoord === null || !Number.isFinite(xCoord)) {
        const logical = timeToLogicalIndex(bars, pt.time, stepSec);
        xCoord = chart.timeScale().logicalToCoordinate(logical as Logical);
      }
      if (xCoord === null || !Number.isFinite(xCoord)) return null;

      return { x: Number(xCoord), y: Number(yCoord) };
    },
    [bars, chart, mainSeries, stepSec],
  );

  const getLocalCoords = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const commitMultiPointTool = useCallback(
    (tool: DrawingToolType, pts: DrawingPoint[], brushPts?: DrawingPoint[]) => {
      if (pts.length < 2) return;
      const p1 = pts[0];
      const p2 = pts[1];

      if (tool === 'ai-range') {
        const startTime = Math.min(p1.time, p2.time);
        const endTime = Math.max(p1.time, p2.time);
        const rangeBars = bars.filter((b) => b.time >= startTime && b.time <= endTime);
        setAIRangeSelection({
          symbol,
          timeframe,
          startTime,
          endTime,
          startPrice: p1.price,
          endPrice: p2.price,
          barCount: Math.max(1, rangeBars.length),
          bars: rangeBars,
        });
        setActiveRightTab('ai');
        setActiveTool('crosshair');
        return;
      }

      if (tool === 'crosshair') return;

      const id = `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const color = getDefaultColorForTool(tool);

      const isBrushLike = tool === 'brush' || tool === 'highlighter';
      const points =
        isBrushLike && brushPts && brushPts.length >= 2 ? brushPts : pts;

      let stopPrice: number | undefined;
      let targetPrice: number | undefined;
      if (tool === 'long_position') {
        const delta = Math.abs(p2.price - p1.price) || p1.price * 0.02;
        targetPrice = p2.price >= p1.price ? p2.price : p1.price + delta;
        stopPrice = p1.price - delta * 0.5;
      } else if (tool === 'short_position') {
        const delta = Math.abs(p2.price - p1.price) || p1.price * 0.02;
        targetPrice = p2.price <= p1.price ? p2.price : p1.price - delta;
        stopPrice = p1.price + delta * 0.5;
      }

      addDrawing({
        id,
        tool,
        symbol,
        timeframe,
        points,
        color,
        lineWidth: tool === 'highlighter' ? 12 : 2,
        text: tool === 'callout' ? 'Callout' : undefined,
        stopPrice,
        targetPrice,
        showMidline: tool === 'rect' || tool === 'channel' ? true : undefined,
        extendRight: false,
        visible: true,
        locked: false,
      });

      if (tool === 'callout') {
        setEditingTextId(id);
        setEditingTextVal('Callout');
      }
    },
    [addDrawing, bars, setAIRangeSelection, setActiveRightTab, setActiveTool, symbol, timeframe],
  );

  // Enter commits an in-progress multi-point tool early if >= 2 points are placed
  useEffect(() => {
    if (!draft || draft.points.length < 2) return;
    const onEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && activeTool !== 'crosshair') {
        e.preventDefault();
        commitMultiPointTool(activeTool, draft.points);
        setDraft(null);
      }
    };
    window.addEventListener('keydown', onEnter);
    return () => window.removeEventListener('keydown', onEnter);
  }, [activeTool, commitMultiPointTool, draft]);

  // Draggable floating toolbar window listeners
  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const drag = toolbarDragRef.current;
      if (!drag) return;
      const nx = Math.max(8, Math.min(plotWidth - 260, drag.origX + (ev.clientX - drag.startClientX)));
      const ny = Math.max(6, Math.min(paneHeight - 44, drag.origY + (ev.clientY - drag.startClientY)));
      setToolbarPos({ x: nx, y: ny });
    };
    const onUp = () => {
      toolbarDragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [paneHeight, plotWidth]);

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (contextMenu) setContextMenu(null);
    if (openPopover) setOpenPopover(null);
    if (e.button !== 0) return;
    if (activeTool === 'crosshair') {
      if (e.target === svgRef.current) {
        selectDrawing(null);
      }
      return;
    }

    const { x, y } = getLocalCoords(e.clientX, e.clientY);
    const anchor = pixelToAnchor(x, y, magnetMode);
    if (!anchor) return;

    // Single-click tools: hline, vline, crossline, hray, anchored_vwap, text
    if (
      activeTool === 'hline' ||
      activeTool === 'vline' ||
      activeTool === 'crossline' ||
      activeTool === 'hray' ||
      activeTool === 'anchored_vwap' ||
      activeTool === 'text'
    ) {
      const id = `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      addDrawing({
        id,
        tool: activeTool,
        symbol,
        timeframe,
        points: [anchor],
        color: getDefaultColorForTool(activeTool),
        lineWidth: 2,
        text: activeTool === 'text' ? 'Note' : undefined,
        visible: true,
        locked: false,
      });
      if (activeTool === 'text') {
        setEditingTextId(id);
        setEditingTextVal('Note');
      }
      return;
    }

    if (activeTool === 'brush' || activeTool === 'highlighter') {
      setDraft({
        points: [anchor],
        startX: x,
        startY: y,
        current: anchor,
        dragMoved: true,
        brushPoints: [anchor],
      });
      return;
    }

    const requiredPts = getRequiredPoints(activeTool);

    // Multi-point & 2-point progressive click placement
    if (draft) {
      const pt =
        e.shiftKey
          ? (() => {
              const s = snapAngleCoords(draft.startX, draft.startY, x, y);
              return pixelToAnchor(s.x, s.y, magnetMode) ?? anchor;
            })()
          : anchor;
      const nextPts = [...draft.points, pt];
      if (nextPts.length >= requiredPts) {
        commitMultiPointTool(activeTool, nextPts);
        setDraft(null);
      } else {
        setDraft({
          points: nextPts,
          startX: x,
          startY: y,
          current: pt,
          dragMoved: false,
        });
      }
      return;
    }

    setDraft({
      points: [anchor],
      startX: x,
      startY: y,
      current: anchor,
      dragMoved: false,
    });
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = getLocalCoords(e.clientX, e.clientY);
    if (magnetMode && activeTool !== 'crosshair') {
      setHoverSnap(pixelToAnchor(raw.x, raw.y, true));
    } else if (hoverSnap !== null) {
      setHoverSnap(null);
    }

    const { x, y } =
      draft && e.shiftKey ? snapAngleCoords(draft.startX, draft.startY, raw.x, raw.y) : raw;

    if (dragMove) {
      const nextAnchor = pixelToAnchor(raw.x, raw.y, magnetMode);
      if (!nextAnchor) return;
      const skipUndo = dragMove.undoRecorded;
      if (!dragMove.undoRecorded) {
        setDragMove((prev) => (prev ? { ...prev, undoRecorded: true } : null));
      }

      if (dragMove.handleIndex === 'stop') {
        updateDrawing(dragMove.drawingId, { stopPrice: nextAnchor.price }, { skipUndo });
        return;
      }
      if (dragMove.handleIndex === 'target') {
        updateDrawing(dragMove.drawingId, { targetPrice: nextAnchor.price }, { skipUndo });
        return;
      }

      if (isBoxHandleId(dragMove.handleIndex) && dragMove.initialPoints.length >= 2) {
        const p0 = dragMove.initialPoints[0];
        const p1 = dragMove.initialPoints[1];
        const leftIdx = p0.time <= p1.time ? 0 : 1;
        const rightIdx = 1 - leftIdx;
        const topIdx = p0.price >= p1.price ? 0 : 1;
        const botIdx = 1 - topIdx;
        const nextPoints = dragMove.initialPoints.map((pt) => ({ ...pt }));
        const h = dragMove.handleIndex;

        if (h === 'w' || h === 'nw' || h === 'sw') {
          nextPoints[leftIdx].time = nextAnchor.time;
        }
        if (h === 'e' || h === 'ne' || h === 'se') {
          nextPoints[rightIdx].time = nextAnchor.time;
        }
        if (h === 'n' || h === 'nw' || h === 'ne') {
          nextPoints[topIdx].price = nextAnchor.price;
        }
        if (h === 's' || h === 'sw' || h === 'se') {
          nextPoints[botIdx].price = nextAnchor.price;
        }

        updateDrawing(dragMove.drawingId, { points: nextPoints }, { skipUndo });
        return;
      }

      const dt = nextAnchor.time - dragMove.originAnchor.time;
      const dp = nextAnchor.price - dragMove.originAnchor.price;
      const nextPoints =
        dragMove.handleIndex === 'all'
          ? dragMove.initialPoints.map((pt) => ({
              time: pt.time + dt,
              price: pt.price + dp,
            }))
          : dragMove.initialPoints.map((pt, idx) =>
              idx === dragMove.handleIndex ? nextAnchor : pt,
            );
      updateDrawing(dragMove.drawingId, { points: nextPoints }, { skipUndo });
      return;
    }

    if (!draft) return;
    const anchor = pixelToAnchor(x, y, magnetMode);
    if (!anchor) return;

    if (activeTool === 'brush' || activeTool === 'highlighter') {
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              current: anchor,
              brushPoints: [...(prev.brushPoints ?? prev.points), anchor],
            }
          : null,
      );
      return;
    }

    const moved =
      draft.dragMoved || Math.hypot(x - draft.startX, y - draft.startY) > 8;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            current: anchor,
            dragMoved: moved,
          }
        : null,
    );
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragMove) {
      setDragMove(null);
      return;
    }

    if (!draft) return;
    const raw = getLocalCoords(e.clientX, e.clientY);
    const { x, y } = e.shiftKey ? snapAngleCoords(draft.startX, draft.startY, raw.x, raw.y) : raw;
    const endAnchor = pixelToAnchor(x, y, magnetMode) ?? draft.current;

    if (activeTool === 'brush' || activeTool === 'highlighter') {
      commitMultiPointTool(
        activeTool,
        [draft.points[0], endAnchor],
        draft.brushPoints ?? [draft.points[0], endAnchor],
      );
      setDraft(null);
      return;
    }

    const requiredPts = getRequiredPoints(activeTool);
    if (draft.dragMoved) {
      if (requiredPts === 2) {
        commitMultiPointTool(activeTool, [draft.points[0], endAnchor]);
        setDraft(null);
      } else if (draft.points.length === 1) {
        // Lock dragged baseline P1->P2 so user can place P3+ cleanly
        setDraft({
          points: [draft.points[0], endAnchor],
          startX: x,
          startY: y,
          current: endAnchor,
          dragMoved: false,
        });
      }
    }
  };

  const symbolDrawings = useMemo(
    () =>
      drawings.filter(
        (d) =>
          d.symbol === symbol &&
          (!d.visibleTimeframes ||
            d.visibleTimeframes.length === 0 ||
            d.visibleTimeframes.includes(timeframe)),
      ),
    [drawings, symbol, timeframe],
  );

  const selectedDrawing = useMemo(
    () => symbolDrawings.find((d) => d.id === selectedDrawingId) ?? null,
    [selectedDrawingId, symbolDrawings],
  );

  const vpvr = useMemo(
    () => (showVolumeProfile ? computeVolumeProfile(bars, 24) : null),
    [bars, showVolumeProfile],
  );

  const smc = useMemo(
    () => (showSmcOverlay ? computeSmartMoneyConcepts(bars) : null),
    [bars, showSmcOverlay],
  );

  const sessionsData = useMemo(
    () => (showSessionsOverlay ? computeSessionAndLiquidityLevels(bars, timeframe) : null),
    [bars, showSessionsOverlay, timeframe],
  );

  // Shaded BigQuery confidence polygon path synced to Pane 0 coordinates
  const forecastBandPath = useMemo(() => {
    if (!overlayVisible || !chartOverlay?.forecast?.points?.length) return null;
    const pts = chartOverlay.forecast.points;
    const upperCoords: string[] = [];
    const lowerCoords: string[] = [];
    for (const pt of pts) {
      const up = anchorToPixel({ time: pt.time, price: pt.upperBound });
      const lo = anchorToPixel({ time: pt.time, price: pt.lowerBound });
      if (up && lo) {
        upperCoords.push(`${up.x.toFixed(1)},${up.y.toFixed(1)}`);
        lowerCoords.unshift(`${lo.x.toFixed(1)},${lo.y.toFixed(1)}`);
      }
    }
    if (upperCoords.length < 2) return null;
    return `M ${upperCoords.join(' L ')} L ${lowerCoords.join(' L ')} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorToPixel, chartOverlay, overlayVisible, revision, plotWidth, paneHeight]);

  if (plotWidth <= 0 || paneHeight <= 0) return null;

  const activeDragCursor = dragMove
    ? isBoxHandleId(dragMove.handleIndex)
      ? BOX_HANDLE_CURSORS[dragMove.handleIndex]
      : dragMove.handleIndex === 'stop' || dragMove.handleIndex === 'target'
        ? 'ns-resize'
        : 'grabbing'
    : null;

  const renderShape = (
    id: string,
    tool: Exclude<DrawingToolType, 'crosshair'>,
    points: DrawingPoint[],
    color: string,
    textVal: string | undefined,
    isSelected: boolean,
    isDraft: boolean,
    locked: boolean,
    meta?: Partial<DrawingObject>,
  ) => {
    const px = points
      .map((p) => anchorToPixel(p))
      .filter((c): c is { x: number; y: number } => c !== null);
    if (px.length === 0) return null;

    const isHovered = !isDraft && hoveredDrawingId === id;
    const baseW = meta?.lineWidth ?? 2;
    const strokeW = isSelected
      ? Math.max(2.2, baseW + 0.5)
      : isHovered
        ? Math.max(2, baseW + 0.3)
        : baseW;

    const resolvedLineStyle = meta?.lineStyle ?? 'solid';
    const dash = getDashPattern(resolvedLineStyle, strokeW);
    const lineCap: 'round' | undefined = resolvedLineStyle === 'dotted' ? 'round' : undefined;
    const lineAlpha = meta?.lineOpacity ?? 1;
    const effectiveLineColor = lineAlpha < 1 ? hexToRgba(color, lineAlpha, color) : color;

    // Independent Border resolution for shapes, channels, callouts, text, and zones
    const defaultBorderShown = tool === 'text' ? Boolean(meta?.showBorder ?? true) : meta?.showBorder !== false;
    const baseBorderW = meta?.borderWidth ?? (tool === 'text' ? 1.2 : baseW);
    const hasBorder = defaultBorderShown && baseBorderW > 0;
    const rawBorderCol = meta?.borderColor ?? color;
    const borderAlpha = meta?.borderOpacity ?? lineAlpha;
    const effectiveBorderColor = hasBorder
      ? borderAlpha < 1
        ? hexToRgba(rawBorderCol, borderAlpha, rawBorderCol)
        : rawBorderCol
      : 'none';
    const effectiveBorderW = !hasBorder
      ? 0
      : isSelected
        ? Math.max(1.8, baseBorderW + 0.45)
        : isHovered
          ? Math.max(1.5, baseBorderW + 0.25)
          : baseBorderW;
    const resolvedBorderStyle = meta?.borderStyle ?? resolvedLineStyle;
    const borderDash = getDashPattern(resolvedBorderStyle, effectiveBorderW || 1.5);
    const borderCap: 'round' | undefined = resolvedBorderStyle === 'dotted' ? 'round' : undefined;

    const fontSz = meta?.fontSize ?? (tool === 'text' ? 12 : 10.5);
    const resolvedTextCol = meta?.textColor ?? (tool === 'text' ? color : '#d1d4dc');
    const resolvedFontWeight = meta?.textBold === false ? 400 : meta?.textBold === true ? 700 : 600;
    const resolvedFontStyle = meta?.textItalic ? 'italic' : 'normal';

    const fillAlpha = meta?.showFill === false ? 0 : (meta?.fillOpacity ?? 0.14);
    const fillRgba = hexToRgba(meta?.fillColor ?? color, fillAlpha, color);
    // Transparent clickable interior so borderless/unfilled shapes stay effortless to select & move
    const interactiveFill = meta?.showFill === false ? 'rgba(0, 0, 0, 0.001)' : fillRgba;

    const isBoxResizeTool = BOX_RESIZE_TOOLS.has(tool) && px.length >= 2;

    const interactiveHandlers =
      !isDraft
        ? {
            onPointerEnter: () => {
              if (activeTool === 'crosshair') setHoveredDrawingId(id);
            },
            onPointerLeave: () => {
              setHoveredDrawingId((prev) => (prev === id ? null : prev));
            },
            onPointerDown: (ev: React.PointerEvent<SVGGElement>) => {
              if (ev.button === 2) return;
              if (activeTool !== 'crosshair') return;
              ev.stopPropagation();
              setContextMenu(null);
              setOpenPopover(null);
              selectDrawing(id);
              if (!lockDrawings && !locked) {
                const { x, y } = getLocalCoords(ev.clientX, ev.clientY);
                const originAnchor = pixelToAnchor(x, y, false);
                if (originAnchor) {
                  setDragMove({
                    drawingId: id,
                    handleIndex: 'all',
                    originAnchor,
                    initialPoints: points.map((p) => ({ ...p })),
                    undoRecorded: false,
                  });
                }
              }
            },
            onContextMenu: (ev: React.MouseEvent<SVGGElement>) => {
              ev.preventDefault();
              ev.stopPropagation();
              selectDrawing(id);
              const { x, y } = getLocalCoords(ev.clientX, ev.clientY);
              setContextMenu({
                drawingId: id,
                x: Math.max(12, Math.min(plotWidth - 210, x)),
                y: Math.max(12, Math.min(paneHeight - 210, y)),
              });
            },
            onDoubleClick: (ev: React.MouseEvent<SVGGElement>) => {
              ev.stopPropagation();
              if (tool === 'text' || tool === 'callout') {
                setEditingTextId(id);
                setEditingTextVal(textVal ?? (tool === 'callout' ? 'Callout' : 'Note'));
              } else {
                openDrawingSettings(id);
              }
            },
          }
        : {};

    const renderAnchorHandles = () => {
      if (isDraft) return null;

      if (isBoxResizeTool) {
        const xLeft = Math.min(px[0].x, px[1].x);
        const xRight = Math.max(px[0].x, px[1].x);
        const yTop = Math.min(px[0].y, px[1].y);
        const yBot = Math.max(px[0].y, px[1].y);
        const xMid = (xLeft + xRight) / 2;
        const yMid = (yTop + yBot) / 2;

        const boxHandles: ReadonlyArray<{ id: BoxHandleId; cx: number; cy: number }> = [
          { id: 'nw', cx: xLeft, cy: yTop },
          { id: 'n', cx: xMid, cy: yTop },
          { id: 'ne', cx: xRight, cy: yTop },
          { id: 'e', cx: xRight, cy: yMid },
          { id: 'se', cx: xRight, cy: yBot },
          { id: 's', cx: xMid, cy: yBot },
          { id: 'sw', cx: xLeft, cy: yBot },
          { id: 'w', cx: xLeft, cy: yMid },
        ];

        if (isHovered && !isSelected) {
          return boxHandles
            .filter((h) => h.id.length === 2)
            .map((h) => (
              <circle
                key={`${id}-ghost-${h.id}`}
                cx={h.cx}
                cy={h.cy}
                r={4.2}
                fill="#ffffff"
                stroke="#2962ff"
                strokeOpacity={0.85}
                strokeWidth={1.75}
                style={{ pointerEvents: 'none' }}
              />
            ));
        }

        if (isSelected && !lockDrawings && !locked) {
          return boxHandles.map((h) => {
            const hKey = `${id}-${h.id}`;
            const expanded = hoveredHandleKey === hKey;
            const cursor = BOX_HANDLE_CURSORS[h.id];
            return (
              <g
                key={hKey}
                onPointerEnter={() => setHoveredHandleKey(hKey)}
                onPointerLeave={() =>
                  setHoveredHandleKey((prev) => (prev === hKey ? null : prev))
                }
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  const { x, y } = getLocalCoords(ev.clientX, ev.clientY);
                  const originAnchor = pixelToAnchor(x, y, false);
                  if (originAnchor) {
                    setDragMove({
                      drawingId: id,
                      handleIndex: h.id,
                      originAnchor,
                      initialPoints: points.map((p) => ({ ...p })),
                      undoRecorded: false,
                    });
                  }
                }}
              >
                <circle cx={h.cx} cy={h.cy} r={11} fill="transparent" style={{ cursor }} />
                <circle
                  data-testid={`drawing-handle-${h.id}`}
                  cx={h.cx}
                  cy={h.cy}
                  r={expanded ? 7 : 5.5}
                  fill="#ffffff"
                  stroke="#2962ff"
                  strokeWidth={2}
                  style={{ cursor, transition: 'r 110ms ease' }}
                />
              </g>
            );
          });
        }
        return null;
      }

      if (isHovered && !isSelected) {
        return px.map((pt, idx) => (
          <circle
            key={`${id}-ghost-${idx}`}
            cx={pt.x}
            cy={pt.y}
            r={4.2}
            fill="#ffffff"
            stroke="#2962ff"
            strokeOpacity={0.85}
            strokeWidth={1.75}
            style={{ pointerEvents: 'none' }}
          />
        ));
      }

      if (isSelected && !lockDrawings && !locked) {
        return px.map((pt, idx) => {
          const hKey = `${id}-pt-${idx}`;
          const expanded = hoveredHandleKey === hKey;
          return (
            <g
              key={hKey}
              onPointerEnter={() => setHoveredHandleKey(hKey)}
              onPointerLeave={() =>
                setHoveredHandleKey((prev) => (prev === hKey ? null : prev))
              }
              onPointerDown={(ev) => {
                ev.stopPropagation();
                const { x, y } = getLocalCoords(ev.clientX, ev.clientY);
                const originAnchor = pixelToAnchor(x, y, false);
                if (originAnchor) {
                  setDragMove({
                    drawingId: id,
                    handleIndex: idx,
                    originAnchor,
                    initialPoints: points.map((p) => ({ ...p })),
                    undoRecorded: false,
                  });
                }
              }}
            >
              <circle cx={pt.x} cy={pt.y} r={11} fill="transparent" style={{ cursor: 'grab' }} />
              <circle
                data-testid={`drawing-handle-${idx}`}
                cx={pt.x}
                cy={pt.y}
                r={expanded ? 7 : 5.5}
                fill="#ffffff"
                stroke="#2962ff"
                strokeWidth={2}
                style={{ cursor: 'grab', transition: 'r 110ms ease' }}
              />
            </g>
          );
        });
      }

      return null;
    };

    const wrapGroup = (children: React.ReactNode) =>
      isDraft ? (
        <g style={{ pointerEvents: 'none', opacity: 0.92 }}>{children}</g>
      ) : (
        <g
          key={id}
          data-testid={`drawing-item-${id}`}
          data-tool={tool}
          data-selected={isSelected ? 'true' : 'false'}
          style={{
            pointerEvents: activeTool === 'crosshair' ? 'auto' : 'none',
            cursor: lockDrawings || locked ? 'default' : 'move',
          }}
          {...interactiveHandlers}
        >
          {children}
          {renderAnchorHandles()}
        </g>
      );

    if (tool === 'hline' || tool === 'hray') {
      const xStart = tool === 'hray' ? px[0].x : 0;
      const y = px[0].y;
      const lblX =
        meta?.textAlign === 'center'
          ? (xStart + plotWidth) / 2
          : meta?.textAlign === 'right'
            ? plotWidth - 10
            : Math.max(8, xStart + 6);
      const lblAnchor =
        meta?.textAlign === 'center' ? 'middle' : meta?.textAlign === 'right' ? 'end' : 'start';
      return wrapGroup(
        <>
          <line x1={xStart} y1={y} x2={plotWidth} y2={y} stroke="transparent" strokeWidth={16} />
          <line
            x1={xStart}
            y1={y}
            x2={plotWidth}
            y2={y}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          {textVal && (
            <text
              x={lblX}
              y={y - 6}
              textAnchor={lblAnchor}
              fill={meta?.textColor ?? color}
              fontSize={fontSz}
              fontWeight={resolvedFontWeight}
              fontStyle={resolvedFontStyle}
            >
              {textVal}
            </text>
          )}
        </>,
      );
    }

    if (tool === 'crossline') {
      const { x, y } = px[0];
      const crossDash = dash ?? '4 3';
      return wrapGroup(
        <>
          <line x1={0} y1={y} x2={plotWidth} y2={y} stroke="transparent" strokeWidth={16} />
          <line x1={x} y1={0} x2={x} y2={paneHeight} stroke="transparent" strokeWidth={16} />
          <line
            x1={0}
            y1={y}
            x2={plotWidth}
            y2={y}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={crossDash}
            strokeLinecap={lineCap}
          />
          <line
            x1={x}
            y1={0}
            x2={x}
            y2={paneHeight}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={crossDash}
            strokeLinecap={lineCap}
          />
          <circle cx={x} cy={y} r={3.5} fill={effectiveLineColor} />
        </>,
      );
    }

    if (tool === 'anchored_vwap') {
      const startTime = points[0].time;
      let cumPV = 0;
      let cumV = 0;
      const vwapPts: string[] = [];
      for (const b of bars) {
        if (b.time < startTime) continue;
        const typ = (b.high + b.low + b.close) / 3;
        const vol = Math.max(1, b.volume);
        cumPV += typ * vol;
        cumV += vol;
        const val = cumV > 0 ? cumPV / cumV : typ;
        const coord = anchorToPixel({ time: b.time, price: val });
        if (coord) vwapPts.push(`${coord.x.toFixed(1)},${coord.y.toFixed(1)}`);
      }
      if (vwapPts.length < 2) {
        return wrapGroup(<circle cx={px[0].x} cy={px[0].y} r={5} fill={effectiveLineColor} />);
      }
      const dPath = `M ${vwapPts.join(' L ')}`;
      return wrapGroup(
        <>
          <path d={dPath} fill="none" stroke="transparent" strokeWidth={16} />
          <path
            d={dPath}
            fill="none"
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          <circle cx={px[0].x} cy={px[0].y} r={4} fill={effectiveLineColor} />
          <text
            x={px[0].x + 6}
            y={px[0].y - 6}
            fill={meta?.textColor ?? color}
            fontSize={fontSz}
            fontWeight={resolvedFontWeight}
          >
            {textVal || 'AVWAP'}
          </text>
        </>,
      );
    }

    if (tool === 'vline') {
      const x = px[0].x;
      return wrapGroup(
        <>
          <line x1={x} y1={0} x2={x} y2={paneHeight} stroke="transparent" strokeWidth={16} />
          <line
            x1={x}
            y1={0}
            x2={x}
            y2={paneHeight}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          {textVal && (
            <text
              x={x + 6}
              y={18}
              fill={meta?.textColor ?? color}
              fontSize={fontSz}
              fontWeight={resolvedFontWeight}
              fontStyle={resolvedFontStyle}
            >
              {textVal}
            </text>
          )}
        </>,
      );
    }

    if (tool === 'text') {
      const p = px[0];
      const label = textVal || 'Note';
      const boxW = Math.max(54, label.length * (fontSz * 0.64) + 18);
      const boxH = Math.max(24, fontSz + 12);
      const boxBg =
        meta?.showFill === false
          ? 'rgba(0, 0, 0, 0.001)'
          : hexToRgba(meta?.fillColor ?? '#1e222d', meta?.fillOpacity ?? 0.88, '#1e222d');
      const boxStroke = hasBorder
        ? meta?.borderColor
          ? effectiveBorderColor
          : isSelected
            ? '#2962ff'
            : 'rgba(209,212,220,0.32)'
        : 'none';
      const textX =
        meta?.textAlign === 'center'
          ? p.x - 4 + boxW / 2
          : meta?.textAlign === 'right'
            ? p.x - 4 + boxW - 7
            : p.x + 4;
      const textAnchor =
        meta?.textAlign === 'center' ? 'middle' : meta?.textAlign === 'right' ? 'end' : 'start';
      return wrapGroup(
        <>
          <rect
            x={p.x - 4}
            y={p.y - boxH + 6}
            width={boxW}
            height={boxH}
            rx={4}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
          />
          <rect
            x={p.x - 4}
            y={p.y - boxH + 6}
            width={boxW}
            height={boxH}
            rx={4}
            fill={boxBg}
            stroke={boxStroke}
            strokeWidth={hasBorder ? effectiveBorderW : 0}
            strokeDasharray={borderDash}
            strokeLinecap={borderCap}
          />
          <text
            x={textX}
            y={p.y + 1}
            textAnchor={textAnchor}
            fill={resolvedTextCol}
            fontSize={fontSz}
            fontWeight={resolvedFontWeight}
            fontStyle={resolvedFontStyle}
            style={{ userSelect: 'none' }}
          >
            {label}
          </text>
        </>,
      );
    }

    if (tool === 'brush' || tool === 'highlighter') {
      if (px.length < 2) return null;
      const dPath = `M ${px.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`;
      const isHighlighter = tool === 'highlighter';
      return wrapGroup(
        <>
          <path d={dPath} fill="none" stroke="transparent" strokeWidth={16} />
          <path
            d={dPath}
            fill="none"
            stroke={effectiveLineColor}
            strokeOpacity={isHighlighter ? 0.38 : 1}
            strokeWidth={isHighlighter ? Math.max(10, strokeW) : strokeW}
            strokeDasharray={isHighlighter ? undefined : dash}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>,
      );
    }

    if (px.length < 2) return null;
    const p1 = px[0];
    const p2 = px[1];

    if (tool === 'trendline') {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const sx = meta?.extendLeft ? p1.x - (dx / len) * 3000 : p1.x;
      const sy = meta?.extendLeft ? p1.y - (dy / len) * 3000 : p1.y;
      const ex = meta?.extendRight ? p1.x + (dx / len) * 3000 : p2.x;
      const ey = meta?.extendRight ? p1.y + (dy / len) * 3000 : p2.y;
      const dp = points[1].price - points[0].price;
      const pct = points[0].price !== 0 ? (dp / points[0].price) * 100 : 0;
      const barDiff = Math.round(Math.abs(points[1].time - points[0].time) / stepSec);
      const deg = (-Math.atan2(dy, dx) * 180) / Math.PI;
      const deltaTxt = formatDeltaWithPips(dp, points[0].price, symbol);
      const anchorAlign =
        meta?.textAlign === 'left' ? 'start' : meta?.textAlign === 'right' ? 'end' : 'middle';
      return wrapGroup(
        <>
          <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="transparent" strokeWidth={16} />
          <line
            x1={sx}
            y1={sy}
            x2={ex}
            y2={ey}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          {meta?.arrowStart && renderArrowHead(p2.x, p2.y, p1.x, p1.y, effectiveLineColor)}
          {meta?.arrowEnd && renderArrowHead(p1.x, p1.y, p2.x, p2.y, effectiveLineColor)}
          {textVal && (
            <text
              x={(p1.x + p2.x) / 2}
              y={(p1.y + p2.y) / 2 - 8}
              textAnchor={anchorAlign}
              fill={meta?.textColor ?? color}
              fontSize={fontSz}
              fontWeight={resolvedFontWeight}
              fontStyle={resolvedFontStyle}
            >
              {textVal}
            </text>
          )}
          {(isSelected || isDraft || meta?.showStats) && (
            <g>
              <rect
                x={(p1.x + p2.x) / 2 - 86}
                y={Math.max(6, (p1.y + p2.y) / 2 + 8)}
                width={172}
                height={18}
                rx={3}
                fill="rgba(19, 23, 34, 0.92)"
                stroke={color}
                strokeWidth={0.8}
              />
              <text
                x={(p1.x + p2.x) / 2}
                y={Math.max(18, (p1.y + p2.y) / 2 + 20)}
                textAnchor="middle"
                fill="#d1d4dc"
                fontSize={9.5}
                fontWeight={600}
              >
                {`${deltaTxt} (${pct.toFixed(2)}%) · ${barDiff}b · ${deg.toFixed(0)}°`}
              </text>
            </g>
          )}
        </>,
      );
    }

    if (tool === 'path') {
      const polyPts = px.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const last = px[px.length - 1];
      const prev = px[px.length - 2];
      return wrapGroup(
        <>
          <polyline points={polyPts} fill="none" stroke="transparent" strokeWidth={16} />
          <polyline
            points={polyPts}
            fill="none"
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
            strokeLinejoin="round"
          />
          {meta?.arrowEnd && prev && last && renderArrowHead(prev.x, prev.y, last.x, last.y, effectiveLineColor)}
          {px.map((pt, idx) => (
            <circle key={idx} cx={pt.x} cy={pt.y} r={3} fill="#131722" stroke={effectiveLineColor} strokeWidth={1.5} />
          ))}
        </>,
      );
    }

    if (tool === 'ray') {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const scale = 3000 / len;
      const ex = p1.x + dx * scale;
      const ey = p1.y + dy * scale;
      return wrapGroup(
        <>
          <line x1={p1.x} y1={p1.y} x2={ex} y2={ey} stroke="transparent" strokeWidth={16} />
          <line
            x1={p1.x}
            y1={p1.y}
            x2={ex}
            y2={ey}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          {meta?.arrowStart && renderArrowHead(p2.x, p2.y, p1.x, p1.y, effectiveLineColor)}
        </>,
      );
    }

    if (tool === 'rect') {
      const rx = meta?.extendLeft ? 0 : Math.min(p1.x, p2.x);
      const ry = Math.min(p1.y, p2.y);
      const rightEdge = meta?.extendRight ? plotWidth : Math.max(p1.x, p2.x);
      const rw = Math.max(2, rightEdge - rx);
      const rh = Math.max(2, Math.abs(p2.y - p1.y));
      const midY = ry + rh / 2;
      const showMid = meta?.showMidline !== false;
      const dp = Math.abs(points[1].price - points[0].price);
      const alignX =
        meta?.textAlign === 'center'
          ? rx + rw / 2
          : meta?.textAlign === 'right'
            ? rx + rw - 6
            : rx + 6;
      const anchorAlign =
        meta?.textAlign === 'center'
          ? 'middle'
          : meta?.textAlign === 'right'
            ? 'end'
            : 'start';
      return wrapGroup(
        <>
          <rect
            x={rx}
            y={ry}
            width={rw}
            height={rh}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
          />
          <rect
            x={rx}
            y={ry}
            width={rw}
            height={rh}
            fill={interactiveFill}
            stroke={effectiveBorderColor}
            strokeWidth={effectiveBorderW}
            strokeDasharray={borderDash}
            strokeLinecap={borderCap}
          />
          {showMid && rh > 10 && (
            <line
              x1={rx}
              y1={midY}
              x2={rx + rw}
              y2={midY}
              stroke={effectiveLineColor}
              strokeOpacity={0.8}
              strokeWidth={Math.max(1, baseW * 0.6)}
              strokeDasharray="4 4"
            />
          )}
          {textVal && (
            <text
              x={alignX}
              y={ry + fontSz + 5}
              textAnchor={anchorAlign}
              fill={resolvedTextCol}
              fontSize={fontSz}
              fontWeight={resolvedFontWeight}
              fontStyle={resolvedFontStyle}
            >
              {textVal}
            </text>
          )}
          {meta?.showStats && (
            <text
              x={rx + 6}
              y={Math.max(12, ry - 4)}
              fill={rawBorderCol}
              fontSize={9.5}
              fontWeight={600}
            >
              {`Zone: ${formatDeltaWithPips(dp, points[0].price, symbol)}`}
            </text>
          )}
        </>,
      );
    }

    if (tool === 'ai-range') {
      const rx = Math.min(p1.x, p2.x);
      const rw = Math.max(4, Math.abs(p2.x - p1.x));
      return wrapGroup(
        <rect
          x={rx}
          y={0}
          width={rw}
          height={paneHeight}
          fill="rgba(41, 98, 255, 0.16)"
          stroke="#2962ff"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />,
      );
    }

    if (tool === 'measure') {
      const rx = Math.min(p1.x, p2.x);
      const ry = Math.min(p1.y, p2.y);
      const rw = Math.max(2, Math.abs(p2.x - p1.x));
      const rh = Math.max(2, Math.abs(p2.y - p1.y));
      const dp = points[1].price - points[0].price;
      const pct = points[0].price !== 0 ? (dp / points[0].price) * 100 : 0;
      const barDiff = Math.round(Math.abs(points[1].time - points[0].time) / stepSec);
      const isUp = dp >= 0;
      const defaultStroke = isUp ? '#089981' : '#f23645';
      const boxFill = meta?.fillColor
        ? interactiveFill
        : meta?.showFill === false
          ? 'rgba(0,0,0,0.001)'
          : isUp
            ? 'rgba(8, 153, 129, 0.18)'
            : 'rgba(242, 54, 69, 0.18)';
      const boxStroke = hasBorder ? (meta?.borderColor ? effectiveBorderColor : defaultStroke) : 'none';
      const badgeBg = meta?.borderColor ?? defaultStroke;
      const deltaTxt = formatDeltaWithPips(dp, points[0].price, symbol);
      return wrapGroup(
        <>
          <rect x={rx} y={ry} width={rw} height={rh} fill="none" stroke="transparent" strokeWidth={16} />
          <rect
            x={rx}
            y={ry}
            width={rw}
            height={rh}
            fill={boxFill}
            stroke={boxStroke}
            strokeWidth={hasBorder ? effectiveBorderW : 0}
            strokeDasharray={borderDash}
            strokeLinecap={borderCap}
          />
          <rect
            x={rx + rw / 2 - 80}
            y={Math.max(4, ry + rh + 4)}
            width={160}
            height={22}
            rx={4}
            fill={badgeBg}
          />
          <text
            x={rx + rw / 2}
            y={Math.max(19, ry + rh + 19)}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={10.5}
            fontWeight={600}
          >
            {`${deltaTxt} (${pct.toFixed(2)}%) · ${barDiff}b`}
          </text>
        </>,
      );
    }

    if (tool === 'fib_fan') {
      const fanLevels = meta?.fibLevels ?? [0.236, 0.382, 0.5, 0.618, 0.786];
      const dx = p2.x - p1.x || 60;
      const dy = p2.y - p1.y;
      return wrapGroup(
        <>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16} />
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={effectiveLineColor} strokeWidth={1.2} strokeDasharray="3 3" />
          {fanLevels.map((lvl) => {
            const targetY = p1.y + dy * lvl;
            const rdx = dx;
            const rdy = targetY - p1.y;
            const len = Math.hypot(rdx, rdy) || 1;
            const ex = p1.x + (rdx / len) * 2400;
            const ey = p1.y + (rdy / len) * 2400;
            return (
              <g key={lvl}>
                <line x1={p1.x} y1={p1.y} x2={ex} y2={ey} stroke="transparent" strokeWidth={16} />
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={ex}
                  y2={ey}
                  stroke={lvl === 0.5 || lvl === 0.618 ? '#2962ff' : effectiveLineColor}
                  strokeWidth={strokeW * 0.85}
                  strokeDasharray={dash}
                  strokeLinecap={lineCap}
                />
                <text x={p2.x + 6} y={targetY - 2} fill="#d1d4dc" fontSize={9.5} fontWeight={600}>
                  {lvl}
                </text>
              </g>
            );
          })}
        </>,
      );
    }

    if (tool === 'fib' || tool === 'fib_ext') {
      const p3 = px[2];
      const minX = meta?.extendLeft ? 0 : Math.min(...px.map((pt) => pt.x));
      const maxX = meta?.extendRight ? plotWidth : Math.max(...px.map((pt) => pt.x));
      const width = Math.max(90, maxX - minX);
      const anchorA = meta?.reverseFib ? points[1] : points[0];
      const anchorB = meta?.reverseFib ? points[0] : points[1];
      const swingDiff = anchorB.price - anchorA.price;
      const extBase = points[2]?.price ?? anchorA.price;
      const levels =
        meta?.fibLevels && meta.fibLevels.length > 0
          ? meta.fibLevels
          : tool === 'fib_ext'
            ? FIB_EXT_LEVELS
            : FIB_LEVELS;

      const oteTopPrice = tool === 'fib' ? anchorB.price - swingDiff * 0.618 : null;
      const oteBotPrice = tool === 'fib' ? anchorB.price - swingDiff * 0.786 : null;
      const oteY1 = oteTopPrice !== null ? mainSeries?.priceToCoordinate(oteTopPrice) : null;
      const oteY2 = oteBotPrice !== null ? mainSeries?.priceToCoordinate(oteBotPrice) : null;

      return wrapGroup(
        <>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16} />
          <line
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={effectiveLineColor}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {tool === 'fib_ext' && p3 && (
            <>
              <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y} stroke="transparent" strokeWidth={16} />
              <line
                x1={p2.x}
                y1={p2.y}
                x2={p3.x}
                y2={p3.y}
                stroke={effectiveLineColor}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            </>
          )}
          {meta?.showFill !== false &&
            oteY1 !== null &&
            oteY1 !== undefined &&
            oteY2 !== null &&
            oteY2 !== undefined &&
            Number.isFinite(oteY1) &&
            Number.isFinite(oteY2) && (
              <rect
                x={minX}
                y={Math.min(oteY1, oteY2)}
                width={width}
                height={Math.max(2, Math.abs(oteY2 - oteY1))}
                fill={hexToRgba(meta?.fillColor ?? '#f59e0b', meta?.fillOpacity ?? 0.14, '#f59e0b')}
                stroke="none"
              />
            )}
          {levels.map((lvl) => {
            const lvlPrice =
              tool === 'fib_ext'
                ? extBase + swingDiff * lvl
                : anchorB.price - swingDiff * lvl;
            const py = mainSeries?.priceToCoordinate(lvlPrice);
            if (py === null || py === undefined || !Number.isFinite(py)) return null;
            const isOte = Math.abs(lvl - 0.705) < 1e-4;
            const isGolden =
              Math.abs(lvl - 0.5) < 1e-4 ||
              Math.abs(lvl - 0.618) < 1e-4 ||
              Math.abs(lvl - 1.618) < 1e-4;
            const lineCol = isOte ? '#089981' : isGolden ? '#2962ff' : effectiveLineColor;
            return (
              <g key={lvl}>
                <line x1={minX} y1={py} x2={minX + width} y2={py} stroke="transparent" strokeWidth={16} />
                <line
                  x1={minX}
                  y1={py}
                  x2={minX + width}
                  y2={py}
                  stroke={lineCol}
                  strokeWidth={isOte || isGolden ? strokeW * 0.9 : strokeW * 0.7}
                  strokeDasharray={dash ?? (isOte ? '4 3' : undefined)}
                  strokeLinecap={lineCap}
                />
                {meta?.showPriceLabels !== false && (
                  <text
                    x={minX + 4}
                    y={py - 3}
                    fill={isOte ? '#089981' : meta?.textColor ?? '#d1d4dc'}
                    fontSize={9.5}
                    fontWeight={isOte ? 700 : 500}
                  >
                    {`${lvl}${isOte ? ' OTE' : ''} (${formatPriceSmart(lvlPrice, symbol)})`}
                  </text>
                )}
              </g>
            );
          })}
        </>,
      );
    }

    if (tool === 'extended' || tool === 'arrow') {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      if (tool === 'extended') {
        const sx = p1.x - ux * 3000;
        const sy = p1.y - uy * 3000;
        const ex = p2.x + ux * 3000;
        const ey = p2.y + uy * 3000;
        return wrapGroup(
          <>
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="transparent" strokeWidth={16} />
            <line
              x1={sx}
              y1={sy}
              x2={ex}
              y2={ey}
              stroke={effectiveLineColor}
              strokeWidth={strokeW}
              strokeDasharray={dash}
              strokeLinecap={lineCap}
            />
          </>,
        );
      }
      const ax1 = p2.x - ux * 10 - uy * 5;
      const ay1 = p2.y - uy * 10 + ux * 5;
      const ax2 = p2.x - ux * 10 + uy * 5;
      const ay2 = p2.y - uy * 10 - ux * 5;
      return wrapGroup(
        <>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16} />
          <line
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          <polygon points={`${p2.x},${p2.y} ${ax1},${ay1} ${ax2},${ay2}`} fill={effectiveLineColor} />
          {meta?.arrowStart && renderArrowHead(p2.x, p2.y, p1.x, p1.y, effectiveLineColor)}
        </>,
      );
    }

    if (tool === 'channel') {
      // Price-anchored 3-point Parallel Channel (immune to price-scale zoom distortion)
      let p1Opp = { x: p1.x, y: p1.y + 44 };
      let p2Opp = { x: p2.x, y: p2.y + 44 };
      if (points.length >= 3) {
        const dtBase = points[1].time - points[0].time;
        const tRatio = Math.abs(dtBase) > 1e-6 ? (points[2].time - points[0].time) / dtBase : 0;
        const basePriceAtP3 = points[0].price + (points[1].price - points[0].price) * tRatio;
        const priceOffset = points[2].price - basePriceAtP3;
        const c1Opp = anchorToPixel({ time: points[0].time, price: points[0].price + priceOffset });
        const c2Opp = anchorToPixel({ time: points[1].time, price: points[1].price + priceOffset });
        if (c1Opp && c2Opp) {
          p1Opp = c1Opp;
          p2Opp = c2Opp;
        }
      }
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const extRightX = meta?.extendRight ? (dx / len) * 2600 : 0;
      const extRightY = meta?.extendRight ? (dy / len) * 2600 : 0;
      const extLeftX = meta?.extendLeft ? (dx / len) * 2600 : 0;
      const extLeftY = meta?.extendLeft ? (dy / len) * 2600 : 0;
      const a1 = { x: p1.x - extLeftX, y: p1.y - extLeftY };
      const b1 = { x: p1Opp.x - extLeftX, y: p1Opp.y - extLeftY };
      const a2 = { x: p2.x + extRightX, y: p2.y + extRightY };
      const b2 = { x: p2Opp.x + extRightX, y: p2Opp.y + extRightY };
      const poly = `${a1.x},${a1.y} ${a2.x},${a2.y} ${b2.x},${b2.y} ${b1.x},${b1.y}`;
      const showMid = meta?.showMidline !== false;
      const railStroke = hasBorder ? effectiveBorderColor : 'none';
      const railW = hasBorder ? effectiveBorderW : 0;
      return wrapGroup(
        <>
          <polygon points={poly} fill={interactiveFill} stroke="none" />
          <line x1={a1.x} y1={a1.y} x2={a2.x} y2={a2.y} stroke="transparent" strokeWidth={16} />
          <line x1={b1.x} y1={b1.y} x2={b2.x} y2={b2.y} stroke="transparent" strokeWidth={16} />
          {hasBorder && (
            <>
              <line
                x1={a1.x}
                y1={a1.y}
                x2={a2.x}
                y2={a2.y}
                stroke={railStroke}
                strokeWidth={railW}
                strokeDasharray={borderDash}
                strokeLinecap={borderCap}
              />
              <line
                x1={b1.x}
                y1={b1.y}
                x2={b2.x}
                y2={b2.y}
                stroke={railStroke}
                strokeWidth={railW}
                strokeDasharray={borderDash}
                strokeLinecap={borderCap}
              />
            </>
          )}
          {showMid && (
            <>
              <line
                x1={(a1.x + b1.x) / 2}
                y1={(a1.y + b1.y) / 2}
                x2={(a2.x + b2.x) / 2}
                y2={(a2.y + b2.y) / 2}
                stroke="transparent"
                strokeWidth={16}
              />
              <line
                x1={(a1.x + b1.x) / 2}
                y1={(a1.y + b1.y) / 2}
                x2={(a2.x + b2.x) / 2}
                y2={(a2.y + b2.y) / 2}
                stroke={effectiveLineColor}
                strokeWidth={1.15}
                strokeDasharray="4 4"
              />
            </>
          )}
        </>,
      );
    }

    if (tool === 'regression') {
      const tMin = Math.min(points[0].time, points[1].time);
      const tMax = Math.max(points[0].time, points[1].time);
      const seg = bars.filter((b) => b.time >= tMin && b.time <= tMax);
      if (seg.length >= 2) {
        const n = seg.length;
        let sumX = 0;
        let sumY = 0;
        for (let i = 0; i < n; i += 1) {
          sumX += i;
          sumY += seg[i].close;
        }
        const meanX = sumX / n;
        const meanY = sumY / n;
        let num = 0;
        let den = 0;
        for (let i = 0; i < n; i += 1) {
          num += (i - meanX) * (seg[i].close - meanY);
          den += (i - meanX) * (i - meanX);
        }
        const slope = den > 0 ? num / den : 0;
        const intercept = meanY - slope * meanX;
        let sqErr = 0;
        for (let i = 0; i < n; i += 1) {
          const e = seg[i].close - (intercept + slope * i);
          sqErr += e * e;
        }
        const sd = Math.sqrt(sqErr / n) * 2;
        const yStart = intercept;
        const yEnd = intercept + slope * (n - 1);
        const c1 = anchorToPixel({ time: seg[0].time, price: yStart });
        const c2 = anchorToPixel({ time: seg[n - 1].time, price: yEnd });
        const u1 = anchorToPixel({ time: seg[0].time, price: yStart + sd });
        const u2 = anchorToPixel({ time: seg[n - 1].time, price: yEnd + sd });
        const l1 = anchorToPixel({ time: seg[0].time, price: yStart - sd });
        const l2 = anchorToPixel({ time: seg[n - 1].time, price: yEnd - sd });
        if (c1 && c2 && u1 && u2 && l1 && l2) {
          return wrapGroup(
            <>
              <polygon
                points={`${u1.x},${u1.y} ${u2.x},${u2.y} ${l2.x},${l2.y} ${l1.x},${l1.y}`}
                fill={meta?.fillColor ? interactiveFill : 'rgba(41, 98, 255, 0.11)'}
              />
              <line x1={u1.x} y1={u1.y} x2={u2.x} y2={u2.y} stroke="transparent" strokeWidth={16} />
              <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke="transparent" strokeWidth={16} />
              <line x1={l1.x} y1={l1.y} x2={l2.x} y2={l2.y} stroke="transparent" strokeWidth={16} />
              <line
                x1={u1.x}
                y1={u1.y}
                x2={u2.x}
                y2={u2.y}
                stroke={effectiveLineColor}
                strokeWidth={strokeW}
                strokeDasharray={dash}
                strokeLinecap={lineCap}
              />
              <line
                x1={c1.x}
                y1={c1.y}
                x2={c2.x}
                y2={c2.y}
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <line
                x1={l1.x}
                y1={l1.y}
                x2={l2.x}
                y2={l2.y}
                stroke={effectiveLineColor}
                strokeWidth={strokeW}
                strokeDasharray={dash}
                strokeLinecap={lineCap}
              />
            </>,
          );
        }
      }
      return wrapGroup(
        <>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16} />
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={effectiveLineColor} strokeWidth={strokeW} strokeDasharray={dash} />
        </>,
      );
    }

    if (tool === 'gann_box') {
      const rx = Math.min(p1.x, p2.x);
      const ry = Math.min(p1.y, p2.y);
      const rw = Math.max(8, Math.abs(p2.x - p1.x));
      const rh = Math.max(8, Math.abs(p2.y - p1.y));
      const boxFill = meta?.fillColor
        ? interactiveFill
        : meta?.showFill === false
          ? 'rgba(0,0,0,0.001)'
          : 'rgba(168, 85, 247, 0.08)';
      return wrapGroup(
        <>
          <rect x={rx} y={ry} width={rw} height={rh} fill="none" stroke="transparent" strokeWidth={16} />
          <rect
            x={rx}
            y={ry}
            width={rw}
            height={rh}
            fill={boxFill}
            stroke={effectiveBorderColor}
            strokeWidth={effectiveBorderW}
            strokeDasharray={borderDash}
            strokeLinecap={borderCap}
          />
          {GANN_LEVELS.slice(1, -1).map((lvl) => (
            <g key={lvl}>
              <line x1={rx} y1={ry + rh * lvl} x2={rx + rw} y2={ry + rh * lvl} stroke={effectiveLineColor} strokeOpacity={0.55} strokeDasharray="3 3" />
              <line x1={rx + rw * lvl} y1={ry} x2={rx + rw * lvl} y2={ry + rh} stroke={effectiveLineColor} strokeOpacity={0.55} strokeDasharray="3 3" />
            </g>
          ))}
          <line x1={rx} y1={ry + rh} x2={rx + rw} y2={ry} stroke={effectiveLineColor} strokeOpacity={0.75} strokeDasharray={dash} />
          <line x1={rx} y1={ry} x2={rx + rw} y2={ry + rh} stroke={effectiveLineColor} strokeOpacity={0.75} strokeDasharray={dash} />
        </>,
      );
    }

    if (tool === 'pitchfork') {
      // 3-Point Pitchfork supporting Original, Schiff, Modified Schiff, and Inside variants
      const p3 = px[2];
      const uStart = p3 ? p2 : { x: p2.x, y: p2.y - 42 };
      const lStart = p3 ? p3 : { x: p2.x, y: p2.y + 42 };
      const mid = { x: (uStart.x + lStart.x) / 2, y: (uStart.y + lStart.y) / 2 };
      const pStyle = meta?.pitchforkStyle ?? 'original';
      const origin =
        pStyle === 'schiff'
          ? { x: p1.x, y: (p1.y + uStart.y) / 2 }
          : pStyle === 'modified_schiff'
            ? { x: (p1.x + uStart.x) / 2, y: (p1.y + uStart.y) / 2 }
            : pStyle === 'inside'
              ? { x: mid.x - (lStart.x - p1.x) * 0.5, y: mid.y - (lStart.y - p1.y) * 0.5 }
              : p1;
      const dx = mid.x - origin.x || 60;
      const dy = mid.y - origin.y;
      const len = Math.hypot(dx, dy) || 1;
      const scale = 2400 / len;
      const ex = origin.x + dx * scale;
      const ey = origin.y + dy * scale;
      const uEnd = { x: uStart.x + dx * scale, y: uStart.y + dy * scale };
      const lEnd = { x: lStart.x + dx * scale, y: lStart.y + dy * scale };
      const q1Start = { x: (uStart.x + mid.x) / 2, y: (uStart.y + mid.y) / 2 };
      const q2Start = { x: (lStart.x + mid.x) / 2, y: (lStart.y + mid.y) / 2 };
      return wrapGroup(
        <>
          <polygon
            points={`${uStart.x},${uStart.y} ${uEnd.x},${uEnd.y} ${lEnd.x},${lEnd.y} ${lStart.x},${lStart.y}`}
            fill={interactiveFill}
          />
          <line x1={p1.x} y1={p1.y} x2={uStart.x} y2={uStart.y} stroke="transparent" strokeWidth={16} />
          <line x1={p1.x} y1={p1.y} x2={lStart.x} y2={lStart.y} stroke="transparent" strokeWidth={16} />
          <line x1={uStart.x} y1={uStart.y} x2={lStart.x} y2={lStart.y} stroke="transparent" strokeWidth={16} />
          <line x1={origin.x} y1={origin.y} x2={ex} y2={ey} stroke="transparent" strokeWidth={16} />
          <line x1={uStart.x} y1={uStart.y} x2={uEnd.x} y2={uEnd.y} stroke="transparent" strokeWidth={16} />
          <line x1={lStart.x} y1={lStart.y} x2={lEnd.x} y2={lEnd.y} stroke="transparent" strokeWidth={16} />
          <line x1={p1.x} y1={p1.y} x2={uStart.x} y2={uStart.y} stroke={effectiveLineColor} strokeWidth={1.15} strokeDasharray="3 3" />
          <line x1={p1.x} y1={p1.y} x2={lStart.x} y2={lStart.y} stroke={effectiveLineColor} strokeWidth={1.15} strokeDasharray="3 3" />
          <line x1={uStart.x} y1={uStart.y} x2={lStart.x} y2={lStart.y} stroke={effectiveLineColor} strokeWidth={1.25} />
          <line x1={origin.x} y1={origin.y} x2={ex} y2={ey} stroke="#f59e0b" strokeWidth={strokeW} strokeDasharray={dash ?? '5 4'} strokeLinecap={lineCap} />
          <line
            x1={q1Start.x}
            y1={q1Start.y}
            x2={q1Start.x + dx * scale}
            y2={q1Start.y + dy * scale}
            stroke={effectiveLineColor}
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <line
            x1={q2Start.x}
            y1={q2Start.y}
            x2={q2Start.x + dx * scale}
            y2={q2Start.y + dy * scale}
            stroke={effectiveLineColor}
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <line
            x1={uStart.x}
            y1={uStart.y}
            x2={uEnd.x}
            y2={uEnd.y}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          <line
            x1={lStart.x}
            y1={lStart.y}
            x2={lEnd.x}
            y2={lEnd.y}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
        </>,
      );
    }

    if (tool === 'abcd') {
      const labels = ['A', 'B', 'C', 'D'] as const;
      const polyPts = px.map((w) => `${w.x.toFixed(1)},${w.y.toFixed(1)}`).join(' ');
      const ab = points.length >= 2 ? Math.abs(points[1].price - points[0].price) : 0;
      const bc = points.length >= 3 && ab > 1e-8 ? Math.abs(points[2].price - points[1].price) / ab : null;
      const cd =
        points.length >= 4 && points.length >= 3 && Math.abs(points[2].price - points[1].price) > 1e-8
          ? Math.abs(points[3].price - points[2].price) / Math.abs(points[2].price - points[1].price)
          : null;
      return wrapGroup(
        <>
          {px.length >= 3 && (
            <polygon
              points={`${px[0].x},${px[0].y} ${px[1].x},${px[1].y} ${px[2].x},${px[2].y}`}
              fill={interactiveFill}
              stroke={effectiveLineColor}
              strokeOpacity={0.45}
              strokeDasharray="3 3"
            />
          )}
          {px.length >= 4 && (
            <polygon
              points={`${px[1].x},${px[1].y} ${px[2].x},${px[2].y} ${px[3].x},${px[3].y}`}
              fill="rgba(8, 153, 129, 0.16)"
              stroke="#089981"
              strokeOpacity={0.55}
              strokeDasharray="3 3"
            />
          )}
          <polyline points={polyPts} fill="none" stroke="transparent" strokeWidth={16} />
          <polyline
            points={polyPts}
            fill="none"
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          {px.map((w, idx) => (
            <g key={labels[idx] ?? idx}>
              <circle cx={w.x} cy={w.y} r={3.5} fill="#131722" stroke={effectiveLineColor} strokeWidth={1.75} />
              <text
                x={w.x}
                y={idx % 2 === 1 ? w.y - 8 : w.y + 14}
                textAnchor="middle"
                fill="#f59e0b"
                fontSize={10.5}
                fontWeight={700}
              >
                {labels[idx] ?? String(idx)}
              </text>
            </g>
          ))}
          {bc !== null && px[2] && (
            <text x={px[2].x + 6} y={px[2].y} fill="#d1d4dc" fontSize={9.5}>
              {`BC:${bc.toFixed(2)}`}
            </text>
          )}
          {cd !== null && px[3] && (
            <text x={px[3].x + 6} y={px[3].y} fill="#089981" fontSize={9.5} fontWeight={700}>
              {`CD:${cd.toFixed(2)}`}
            </text>
          )}
        </>,
      );
    }

    if (tool === 'head_shoulders') {
      const hsLabels = ['Start', 'LS', 'N1', 'Head', 'N2', 'RS', 'Break'] as const;
      const polyPts = px.map((w) => `${w.x.toFixed(1)},${w.y.toFixed(1)}`).join(' ');
      return wrapGroup(
        <>
          {px.length >= 3 && (
            <polygon
              points={`${px[0].x},${px[0].y} ${px[1].x},${px[1].y} ${px[2].x},${px[2].y}`}
              fill={interactiveFill}
            />
          )}
          {px.length >= 5 && (
            <polygon
              points={`${px[2].x},${px[2].y} ${px[3].x},${px[3].y} ${px[4].x},${px[4].y}`}
              fill="rgba(245, 158, 11, 0.18)"
            />
          )}
          {px.length >= 7 && (
            <polygon
              points={`${px[4].x},${px[4].y} ${px[5].x},${px[5].y} ${px[6].x},${px[6].y}`}
              fill={interactiveFill}
            />
          )}
          {px.length >= 5 && (
            <line
              x1={px[2].x - (px[4].x - px[2].x) * 0.4}
              y1={px[2].y - (px[4].y - px[2].y) * 0.4}
              x2={px[4].x + (px[4].x - px[2].x) * 1.4}
              y2={px[4].y + (px[4].y - px[2].y) * 1.4}
              stroke="#f23645"
              strokeWidth={1.4}
              strokeDasharray="5 4"
            />
          )}
          <polyline points={polyPts} fill="none" stroke="transparent" strokeWidth={16} />
          <polyline
            points={polyPts}
            fill="none"
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          {px.map((w, idx) => (
            <g key={idx}>
              <circle cx={w.x} cy={w.y} r={3.5} fill="#131722" stroke={effectiveLineColor} strokeWidth={1.75} />
              <text
                x={w.x}
                y={idx % 2 === 1 ? w.y - 8 : w.y + 14}
                textAnchor="middle"
                fill={idx === 3 ? '#f59e0b' : '#d1d4dc'}
                fontSize={9.5}
                fontWeight={700}
              >
                {hsLabels[idx] ?? `P${idx + 1}`}
              </text>
            </g>
          ))}
        </>,
      );
    }

    if (tool === 'xabcd') {
      const labels = ['X', 'A', 'B', 'C', 'D'] as const;
      const polyPts = px.map((w) => `${w.x.toFixed(1)},${w.y.toFixed(1)}`).join(' ');
      const patternName = classifyHarmonicPattern(points);
      return wrapGroup(
        <>
          {px.length >= 3 && (
            <polygon
              points={`${px[0].x},${px[0].y} ${px[1].x},${px[1].y} ${px[2].x},${px[2].y}`}
              fill={meta?.fillColor ? interactiveFill : 'rgba(168, 85, 247, 0.16)'}
              stroke={effectiveLineColor}
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />
          )}
          {px.length >= 5 && (
            <polygon
              points={`${px[2].x},${px[2].y} ${px[3].x},${px[3].y} ${px[4].x},${px[4].y}`}
              fill="rgba(8, 153, 129, 0.16)"
              stroke="#089981"
              strokeOpacity={0.6}
              strokeDasharray="3 3"
            />
          )}
          <polyline points={polyPts} fill="none" stroke="transparent" strokeWidth={16} />
          <polyline
            points={polyPts}
            fill="none"
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
            strokeLinejoin="round"
          />
          {px.length >= 4 && (
            <line x1={px[0].x} y1={px[0].y} x2={px[2].x} y2={px[2].y} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {px.length >= 5 && (
            <line x1={px[0].x} y1={px[0].y} x2={px[4].x} y2={px[4].y} stroke="#089981" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {px.map((w, idx) => (
            <g key={labels[idx] ?? idx}>
              <circle cx={w.x} cy={w.y} r={3.5} fill="#131722" stroke={effectiveLineColor} strokeWidth={1.75} />
              <text
                x={w.x}
                y={idx % 2 === 1 ? w.y - 8 : w.y + 14}
                textAnchor="middle"
                fill="#f59e0b"
                fontSize={10.5}
                fontWeight={700}
              >
                {labels[idx] ?? String(idx)}
              </text>
            </g>
          ))}
          {px.length >= 5 && (
            <text
              x={px[4].x + 8}
              y={px[4].y + 4}
              fill="#089981"
              fontSize={10}
              fontWeight={700}
            >
              {patternName}
            </text>
          )}
        </>,
      );
    }

    if (tool === 'anchored_vp') {
      const tMin = Math.min(points[0].time, points[1].time);
      const tMax = Math.max(points[0].time, points[1].time);
      const rx = Math.min(p1.x, p2.x);
      const rw = Math.max(36, Math.abs(p2.x - p1.x));
      const slice = bars.filter((b) => b.time >= tMin && b.time <= tMax);
      const frvp = computeVolumeProfile(slice, 20);
      if (!frvp) {
        return wrapGroup(
          <>
            <rect
              x={rx}
              y={Math.min(p1.y, p2.y)}
              width={rw}
              height={Math.max(16, Math.abs(p2.y - p1.y))}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
            />
            <rect
              x={rx}
              y={Math.min(p1.y, p2.y)}
              width={rw}
              height={Math.max(16, Math.abs(p2.y - p1.y))}
              fill="rgba(245, 158, 11, 0.08)"
              stroke={effectiveBorderColor}
              strokeWidth={effectiveBorderW}
              strokeDasharray={borderDash ?? '4 4'}
            />
          </>,
        );
      }
      const pocY = mainSeries?.priceToCoordinate(frvp.pocPrice);
      const vahY = mainSeries?.priceToCoordinate(frvp.vahPrice);
      const valY = mainSeries?.priceToCoordinate(frvp.valPrice);
      const boxTop = mainSeries?.priceToCoordinate(
        frvp.buckets[frvp.buckets.length - 1].priceHigh,
      );
      const boxBot = mainSeries?.priceToCoordinate(frvp.buckets[0].priceLow);
      const histMaxW = Math.max(24, rw * 0.72);

      return wrapGroup(
        <>
          {boxTop !== null &&
            boxTop !== undefined &&
            boxBot !== null &&
            boxBot !== undefined && (
              <>
                <rect
                  x={rx}
                  y={Math.min(boxTop, boxBot)}
                  width={rw}
                  height={Math.max(8, Math.abs(boxBot - boxTop))}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                />
                <rect
                  x={rx}
                  y={Math.min(boxTop, boxBot)}
                  width={rw}
                  height={Math.max(8, Math.abs(boxBot - boxTop))}
                  fill="rgba(41, 98, 255, 0.05)"
                  stroke={hasBorder ? (meta?.borderColor ? effectiveBorderColor : 'rgba(209, 212, 220, 0.28)') : 'none'}
                  strokeWidth={hasBorder ? (meta?.borderWidth ?? 1) : 0}
                  strokeDasharray={borderDash ?? '3 3'}
                />
              </>
            )}
          {frvp.buckets.map((b, idx) => {
            const yTop = mainSeries?.priceToCoordinate(b.priceHigh);
            const yBot = mainSeries?.priceToCoordinate(b.priceLow);
            if (
              yTop === null ||
              yTop === undefined ||
              yBot === null ||
              yBot === undefined ||
              !Number.isFinite(yTop) ||
              !Number.isFinite(yBot)
            ) {
              return null;
            }
            const top = Math.min(yTop, yBot);
            const h = Math.max(2, Math.abs(yBot - yTop) - 1);
            const totalW = (b.totalVolume / frvp.maxBucketVolume) * histMaxW;
            const upW = b.totalVolume > 0 ? (b.upVolume / b.totalVolume) * totalW : 0;
            const downW = Math.max(0, totalW - upW);
            const op = b.isPoc ? 0.68 : b.inValueArea ? 0.45 : 0.22;
            return (
              <g key={idx}>
                <rect x={rx} y={top} width={upW} height={h} fill="#089981" fillOpacity={op} />
                <rect x={rx + upW} y={top} width={downW} height={h} fill="#f23645" fillOpacity={op} />
              </g>
            );
          })}
          {pocY !== null && pocY !== undefined && Number.isFinite(pocY) && (
            <>
              <line
                x1={rx}
                y1={pocY}
                x2={meta?.extendRight ? plotWidth : rx + rw}
                y2={pocY}
                stroke="transparent"
                strokeWidth={16}
              />
              <line
                x1={rx}
                y1={pocY}
                x2={meta?.extendRight ? plotWidth : rx + rw}
                y2={pocY}
                stroke="#f59e0b"
                strokeWidth={1.8}
              />
              <text x={rx + 4} y={pocY - 3} fill="#f59e0b" fontSize={9.5} fontWeight={700}>
                {`FRVP POC ${frvp.pocPrice.toFixed(2)}`}
              </text>
            </>
          )}
          {vahY !== null && vahY !== undefined && Number.isFinite(vahY) && (
            <line
              x1={rx}
              y1={vahY}
              x2={meta?.extendRight ? plotWidth : rx + rw}
              y2={vahY}
              stroke="#2962ff"
              strokeWidth={1.1}
              strokeDasharray="4 3"
            />
          )}
          {valY !== null && valY !== undefined && Number.isFinite(valY) && (
            <line
              x1={rx}
              y1={valY}
              x2={meta?.extendRight ? plotWidth : rx + rw}
              y2={valY}
              stroke="#2962ff"
              strokeWidth={1.1}
              strokeDasharray="4 3"
            />
          )}
        </>,
      );
    }

    if (tool === 'elliott_wave') {
      const waveLabels = ['(0)', '(1)', '(2)', '(3)', '(4)', '(5)'] as const;
      const wPts =
        px.length >= 3
          ? px.map((pt, idx) => ({
              x: pt.x,
              y: pt.y,
              label: waveLabels[idx] ?? `(${idx})`,
            }))
          : [
              { x: p1.x, y: p1.y, label: '(0)' },
              { x: p1.x + (p2.x - p1.x) * 0.22, y: p1.y + (p2.y - p1.y) * 0.38, label: '(1)' },
              { x: p1.x + (p2.x - p1.x) * 0.36, y: p1.y + (p2.y - p1.y) * 0.16, label: '(2)' },
              { x: p1.x + (p2.x - p1.x) * 0.66, y: p1.y + (p2.y - p1.y) * 0.82, label: '(3)' },
              { x: p1.x + (p2.x - p1.x) * 0.8, y: p1.y + (p2.y - p1.y) * 0.56, label: '(4)' },
              { x: p2.x, y: p2.y, label: '(5)' },
            ];
      const polyPts = wPts.map((w) => `${w.x.toFixed(1)},${w.y.toFixed(1)}`).join(' ');
      return wrapGroup(
        <>
          <polyline points={polyPts} fill="none" stroke="transparent" strokeWidth={16} />
          <polyline
            points={polyPts}
            fill="none"
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
            strokeLinejoin="round"
          />
          {wPts.map((w, idx) => (
            <g key={w.label}>
              <circle cx={w.x} cy={w.y} r={3.2} fill="#131722" stroke={effectiveLineColor} strokeWidth={1.75} />
              <text
                x={w.x}
                y={idx % 2 === 1 ? w.y - 8 : w.y + 14}
                textAnchor="middle"
                fill="#f59e0b"
                fontSize={10}
                fontWeight={700}
              >
                {w.label}
              </text>
            </g>
          ))}
        </>,
      );
    }

    if (tool === 'long_position' || tool === 'short_position') {
      const isLong = tool === 'long_position';
      const entryPrice = points[0].price;
      const defaultDelta = Math.abs(points[1].price - entryPrice) || entryPrice * 0.02;
      const targetPrice =
        meta?.targetPrice ??
        (isLong ? Math.max(points[1].price, entryPrice + defaultDelta * 0.5) : Math.min(points[1].price, entryPrice - defaultDelta * 0.5));
      const stopPrice =
        meta?.stopPrice ?? (isLong ? entryPrice - defaultDelta * 0.5 : entryPrice + defaultDelta * 0.5);
      const targetCoord = anchorToPixel({ time: points[1].time, price: targetPrice });
      const stopCoord = anchorToPixel({ time: points[1].time, price: stopPrice });
      const rx = Math.min(p1.x, p2.x);
      const rw = Math.max(120, Math.abs(p2.x - p1.x));
      if (!targetCoord || !stopCoord) return null;
      const risk = Math.max(1e-6, Math.abs(entryPrice - stopPrice));
      const reward = Math.abs(targetPrice - entryPrice);
      const rr = reward / risk;
      const riskUsd = meta?.riskAmountUsd ?? 1500;
      const sizedQty = riskUsd / risk;
      const profitTop = Math.min(p1.y, targetCoord.y);
      const profitH = Math.max(2, Math.abs(targetCoord.y - p1.y));
      const stopTop = Math.min(p1.y, stopCoord.y);
      const stopH = Math.max(2, Math.abs(stopCoord.y - p1.y));
      const zoneAlpha = meta?.showFill === false ? 0.04 : (meta?.fillOpacity ?? 0.22);
      return wrapGroup(
        <>
          <rect
            x={rx}
            y={profitTop}
            width={rw}
            height={profitH}
            fill={hexToRgba('#089981', zoneAlpha, '#089981')}
            stroke={hasBorder ? (meta?.borderColor ?? '#089981') : 'none'}
            strokeWidth={hasBorder ? Math.max(1, baseBorderW * 0.75) : 0}
            strokeDasharray={borderDash}
          />
          <rect
            x={rx}
            y={stopTop}
            width={rw}
            height={stopH}
            fill={hexToRgba('#f23645', zoneAlpha, '#f23645')}
            stroke={hasBorder ? (meta?.borderColor ?? '#f23645') : 'none'}
            strokeWidth={hasBorder ? Math.max(1, baseBorderW * 0.75) : 0}
            strokeDasharray={borderDash}
          />
          <line x1={rx} y1={p1.y} x2={rx + rw} y2={p1.y} stroke="transparent" strokeWidth={16} />
          <line
            x1={rx}
            y1={p1.y}
            x2={rx + rw}
            y2={p1.y}
            stroke="#d1d4dc"
            strokeWidth={strokeW}
            strokeDasharray={dash}
          />
          <rect x={rx + 4} y={p1.y - 11} width={Math.max(162, rw - 8)} height={20} rx={3} fill="rgba(19, 23, 34, 0.92)" />
          <text x={rx + 8} y={p1.y + 3} fill="#d1d4dc" fontSize={9.5} fontWeight={600}>
            {`${isLong ? 'LONG' : 'SHORT'} · R:R 1:${rr.toFixed(2)} · Qty ${sizedQty.toFixed(2)}`}
          </text>
          <text x={rx + 6} y={targetCoord.y + (targetCoord.y < p1.y ? 11 : -4)} fill="#089981" fontSize={9.5} fontWeight={600}>
            {`TP ${formatPriceSmart(targetPrice, symbol)} (+$${(sizedQty * reward).toFixed(0)})`}
          </text>
          <text x={rx + 6} y={stopCoord.y + (stopCoord.y > p1.y ? -4 : 11)} fill="#f23645" fontSize={9.5} fontWeight={600}>
            {`SL ${formatPriceSmart(stopPrice, symbol)} (-$${riskUsd.toFixed(0)})`}
          </text>
          {isSelected && !lockDrawings && !locked && (
            <>
              <circle
                data-testid="drawing-target-handle"
                cx={rx + rw}
                cy={targetCoord.y}
                r={5.5}
                fill="#089981"
                stroke="#ffffff"
                strokeWidth={2}
                style={{ cursor: 'ns-resize' }}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  const { x, y } = getLocalCoords(ev.clientX, ev.clientY);
                  const originAnchor = pixelToAnchor(x, y, false);
                  if (originAnchor) {
                    setDragMove({
                      drawingId: id,
                      handleIndex: 'target',
                      originAnchor,
                      initialPoints: points.map((p) => ({ ...p })),
                      undoRecorded: false,
                    });
                  }
                }}
              />
              <circle
                data-testid="drawing-stop-handle"
                cx={rx + rw}
                cy={stopCoord.y}
                r={5.5}
                fill="#f23645"
                stroke="#ffffff"
                strokeWidth={2}
                style={{ cursor: 'ns-resize' }}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  const { x, y } = getLocalCoords(ev.clientX, ev.clientY);
                  const originAnchor = pixelToAnchor(x, y, false);
                  if (originAnchor) {
                    setDragMove({
                      drawingId: id,
                      handleIndex: 'stop',
                      originAnchor,
                      initialPoints: points.map((p) => ({ ...p })),
                      undoRecorded: false,
                    });
                  }
                }}
              />
            </>
          )}
        </>,
      );
    }

    if (tool === 'circle') {
      const rx = Math.abs(p2.x - p1.x);
      const ry = Math.abs(p2.y - p1.y);
      const r = Math.max(4, Math.hypot(rx, ry));
      return wrapGroup(
        <>
          <circle cx={p1.x} cy={p1.y} r={r} fill="none" stroke="transparent" strokeWidth={16} />
          <circle
            cx={p1.x}
            cy={p1.y}
            r={r}
            fill={interactiveFill}
            stroke={effectiveBorderColor}
            strokeWidth={effectiveBorderW}
            strokeDasharray={borderDash}
            strokeLinecap={borderCap}
          />
        </>,
      );
    }

    if (tool === 'triangle') {
      const midX = (p1.x + p2.x) / 2;
      const pts = `${midX},${Math.min(p1.y, p2.y)} ${p1.x},${Math.max(p1.y, p2.y)} ${p2.x},${Math.max(p1.y, p2.y)}`;
      return wrapGroup(
        <>
          <polygon points={pts} fill="none" stroke="transparent" strokeWidth={16} strokeLinejoin="round" />
          <polygon
            points={pts}
            fill={interactiveFill}
            stroke={effectiveBorderColor}
            strokeWidth={effectiveBorderW}
            strokeDasharray={borderDash}
            strokeLinecap={borderCap}
            strokeLinejoin="round"
          />
        </>,
      );
    }

    if (tool === 'callout') {
      const label = textVal || 'Callout';
      const w = Math.max(78, label.length * (fontSz * 0.65) + 20);
      const h = Math.max(26, fontSz + 15);
      const bubbleFill = meta?.fillColor
        ? interactiveFill
        : meta?.showFill === false
          ? 'rgba(0,0,0,0.001)'
          : 'rgba(30, 34, 45, 0.92)';
      return wrapGroup(
        <>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16} />
          <line
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={effectiveLineColor}
            strokeWidth={strokeW}
            strokeDasharray={dash}
            strokeLinecap={lineCap}
          />
          <circle cx={p1.x} cy={p1.y} r={3.5} fill={effectiveLineColor} />
          <rect
            x={p2.x - w / 2}
            y={p2.y - h / 2}
            width={w}
            height={h}
            rx={5}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
          />
          <rect
            x={p2.x - w / 2}
            y={p2.y - h / 2}
            width={w}
            height={h}
            rx={5}
            fill={bubbleFill}
            stroke={effectiveBorderColor}
            strokeWidth={effectiveBorderW}
            strokeDasharray={borderDash}
            strokeLinecap={borderCap}
          />
          <text
            x={p2.x}
            y={p2.y + fontSz * 0.35}
            textAnchor="middle"
            fill={resolvedTextCol}
            fontSize={fontSz}
            fontWeight={resolvedFontWeight}
            fontStyle={resolvedFontStyle}
          >
            {label}
          </text>
        </>,
      );
    }

    if (tool === 'price_range' || tool === 'date_range') {
      const rx = Math.min(p1.x, p2.x);
      const ry = Math.min(p1.y, p2.y);
      const rw = Math.max(2, Math.abs(p2.x - p1.x));
      const rh = Math.max(2, Math.abs(p2.y - p1.y));
      const dp = points[1].price - points[0].price;
      const pct = points[0].price !== 0 ? (dp / points[0].price) * 100 : 0;
      const barDiff = Math.round(Math.abs(points[1].time - points[0].time) / stepSec);
      const badgeText =
        tool === 'price_range'
          ? `${formatDeltaWithPips(dp, points[0].price, symbol)} (${pct.toFixed(2)}%)`
          : `${barDiff} bars`;
      return wrapGroup(
        <>
          <rect x={rx} y={ry} width={rw} height={rh} fill="none" stroke="transparent" strokeWidth={16} />
          <rect
            x={rx}
            y={ry}
            width={rw}
            height={rh}
            fill={interactiveFill}
            stroke={effectiveBorderColor}
            strokeWidth={effectiveBorderW}
            strokeDasharray={borderDash}
            strokeLinecap={borderCap}
          />
          <rect x={rx + rw / 2 - 70} y={Math.max(4, ry + rh + 4)} width={140} height={20} rx={4} fill={rawBorderCol} />
          <text x={rx + rw / 2} y={Math.max(18, ry + rh + 18)} textAnchor="middle" fill="#ffffff" fontSize={10.5} fontWeight={600}>
            {badgeText}
          </text>
        </>,
      );
    }

    return null;
  };

  return (
    <div
      className="absolute top-0 left-0 z-10 overflow-hidden"
      style={{ width: `${plotWidth}px`, height: `${paneHeight}px`, pointerEvents: 'none' }}
    >
      <svg
        ref={svgRef}
        width={plotWidth}
        height={paneHeight}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        style={{
          display: 'block',
          pointerEvents: activeTool !== 'crosshair' || dragMove !== null ? 'auto' : 'none',
          cursor: activeDragCursor ?? (activeTool !== 'crosshair' ? 'crosshair' : 'default'),
        }}
      >
        {/* BigQuery ML Shaded Forecast Confidence Band */}
        {forecastBandPath && (
          <path
            data-testid="bq-forecast-confidence-band"
            d={forecastBandPath}
            fill="rgba(41, 98, 255, 0.14)"
            stroke="none"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Visible-Range Volume Profile (VPVR) Overlay */}
        {vpvr && (
          <g data-testid="vpvr-overlay" style={{ pointerEvents: 'none' }}>
            {(() => {
              const maxW = Math.min(132, plotWidth * 0.22);
              const pocY = mainSeries?.priceToCoordinate(vpvr.pocPrice);
              const vahY = mainSeries?.priceToCoordinate(vpvr.vahPrice);
              const valY = mainSeries?.priceToCoordinate(vpvr.valPrice);
              return (
                <>
                  {vpvr.buckets.map((b, idx) => {
                    const yTop = mainSeries?.priceToCoordinate(b.priceHigh);
                    const yBot = mainSeries?.priceToCoordinate(b.priceLow);
                    if (
                      yTop === null ||
                      yTop === undefined ||
                      yBot === null ||
                      yBot === undefined ||
                      !Number.isFinite(yTop) ||
                      !Number.isFinite(yBot)
                    ) {
                      return null;
                    }
                    const top = Math.min(yTop, yBot);
                    const h = Math.max(2, Math.abs(yBot - yTop) - 1);
                    const totalW = (b.totalVolume / vpvr.maxBucketVolume) * maxW;
                    const upW =
                      b.totalVolume > 0 ? (b.upVolume / b.totalVolume) * totalW : 0;
                    const downW = Math.max(0, totalW - upW);
                    const opacity = b.isPoc ? 0.62 : b.inValueArea ? 0.4 : 0.18;
                    return (
                      <g key={idx}>
                        <rect
                          x={plotWidth - totalW}
                          y={top}
                          width={upW}
                          height={h}
                          fill="#089981"
                          fillOpacity={opacity}
                        />
                        <rect
                          x={plotWidth - downW}
                          y={top}
                          width={downW}
                          height={h}
                          fill="#f23645"
                          fillOpacity={opacity}
                        />
                      </g>
                    );
                  })}
                  {pocY !== null && pocY !== undefined && Number.isFinite(pocY) && (
                    <>
                      <line
                        x1={Math.max(0, plotWidth - maxW - 36)}
                        y1={pocY}
                        x2={plotWidth}
                        y2={pocY}
                        stroke="#f59e0b"
                        strokeWidth={1.6}
                      />
                      <text
                        x={Math.max(4, plotWidth - maxW - 34)}
                        y={pocY - 3}
                        fill="#f59e0b"
                        fontSize={9.5}
                        fontWeight={700}
                      >
                        {`POC ${vpvr.pocPrice.toFixed(2)}`}
                      </text>
                    </>
                  )}
                  {vahY !== null && vahY !== undefined && Number.isFinite(vahY) && (
                    <line
                      x1={Math.max(0, plotWidth - maxW - 18)}
                      y1={vahY}
                      x2={plotWidth}
                      y2={vahY}
                      stroke="#2962ff"
                      strokeWidth={1}
                      strokeDasharray="4 3"
                    />
                  )}
                  {valY !== null && valY !== undefined && Number.isFinite(valY) && (
                    <line
                      x1={Math.max(0, plotWidth - maxW - 18)}
                      y1={valY}
                      x2={plotWidth}
                      y2={valY}
                      stroke="#2962ff"
                      strokeWidth={1}
                      strokeDasharray="4 3"
                    />
                  )}
                </>
              );
            })()}
          </g>
        )}

        {/* Smart Money Concepts (BOS / CHoCH / FVG / Order Blocks) Overlay */}
        {smc && (
          <g data-testid="smc-overlay" style={{ pointerEvents: 'none' }}>
            {smc.zones.slice(-16).map((z) => {
              const c1 = anchorToPixel({ time: z.startTime, price: z.top });
              const c2 = anchorToPixel({ time: z.endTime, price: z.bottom });
              if (!c1 || !c2) return null;
              const rx = Math.min(c1.x, c2.x);
              const ry = Math.min(c1.y, c2.y);
              const rw = Math.max(18, Math.abs(c2.x - c1.x));
              const rh = Math.max(3, Math.abs(c2.y - c1.y));
              const isBull = z.direction === 'bullish';
              const strokeCol = isBull ? '#089981' : '#f23645';
              const fillCol = isBull
                ? z.mitigated
                  ? 'rgba(8, 153, 129, 0.06)'
                  : 'rgba(8, 153, 129, 0.16)'
                : z.mitigated
                  ? 'rgba(242, 54, 69, 0.06)'
                  : 'rgba(242, 54, 69, 0.16)';
              return (
                <g key={z.id}>
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill={fillCol}
                    stroke={strokeCol}
                    strokeOpacity={z.mitigated ? 0.3 : 0.65}
                    strokeWidth={0.9}
                  />
                  <text
                    x={rx + 4}
                    y={ry + 9}
                    fill={strokeCol}
                    fillOpacity={z.mitigated ? 0.55 : 0.9}
                    fontSize={8.5}
                    fontWeight={600}
                  >
                    {`${isBull ? 'Bull' : 'Bear'} ${z.kind}`}
                  </text>
                </g>
              );
            })}
            {smc.structures.slice(-14).map((s, idx) => {
              const c1 = anchorToPixel({ time: s.fromTime, price: s.price });
              const c2 = anchorToPixel({ time: s.toTime, price: s.price });
              if (!c1 || !c2) return null;
              const col = s.direction === 'bullish' ? '#089981' : '#f23645';
              const midX = (c1.x + c2.x) / 2;
              return (
                <g key={`${s.kind}-${s.fromTime}-${idx}`}>
                  <line
                    x1={c1.x}
                    y1={c1.y}
                    x2={c2.x}
                    y2={c2.y}
                    stroke={col}
                    strokeWidth={1.2}
                    strokeDasharray={s.kind === 'CHoCH' ? '2 2' : '5 3'}
                  />
                  <text
                    x={midX}
                    y={c1.y - 3}
                    textAnchor="middle"
                    fill={col}
                    fontSize={9}
                    fontWeight={700}
                  >
                    {s.kind}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Session Killzones & Institutional Liquidity Levels (PDH / PDL / PWH / PWL) */}
        {sessionsData && (
          <g data-testid="sessions-overlay" style={{ pointerEvents: 'none' }}>
            {sessionsData.sessions.map((s) => {
              const c1 = anchorToPixel({ time: s.startTime, price: s.high });
              const c2 = anchorToPixel({ time: s.endTime, price: s.low });
              if (!c1 || !c2) return null;
              const rx = Math.min(c1.x, c2.x);
              const ry = Math.min(c1.y, c2.y);
              const rw = Math.max(8, Math.abs(c2.x - c1.x));
              const rh = Math.max(4, Math.abs(c2.y - c1.y));
              return (
                <g key={s.id}>
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill={s.color}
                    fillOpacity={0.07}
                    stroke={s.color}
                    strokeOpacity={0.45}
                    strokeWidth={0.9}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={rx + 4}
                    y={Math.max(10, ry - 3)}
                    fill={s.color}
                    fontSize={8.5}
                    fontWeight={700}
                  >
                    {s.name}
                  </text>
                </g>
              );
            })}
            {sessionsData.levels.map((lvl) => {
              const c1 = anchorToPixel({ time: lvl.fromTime, price: lvl.price });
              const py = mainSeries?.priceToCoordinate(lvl.price);
              if (py === null || py === undefined || !Number.isFinite(py)) return null;
              const startX = c1 ? Math.max(0, c1.x) : 0;
              return (
                <g key={lvl.id}>
                  <line
                    x1={startX}
                    y1={py}
                    x2={plotWidth}
                    y2={py}
                    stroke={lvl.color}
                    strokeWidth={1.25}
                    strokeDasharray="6 4"
                  />
                  <text
                    x={Math.max(8, plotWidth - 94)}
                    y={py - 3}
                    fill={lvl.color}
                    fontSize={9.5}
                    fontWeight={700}
                  >
                    {`${lvl.label} ${lvl.price.toFixed(2)}`}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Saved Drawings */}
        {!hideDrawings &&
          symbolDrawings.map((d) =>
            d.visible
              ? renderShape(
                  d.id,
                  d.tool,
                  d.points,
                  d.color,
                  d.text,
                  d.id === selectedDrawingId,
                  false,
                  d.locked,
                  d,
                )
              : null,
          )}

        {/* Active Draft (live preview reflects Pre-Draw defaultToolStyles!) */}
        {draft &&
          activeTool !== 'crosshair' &&
          (() => {
            const draftDefaults = defaultToolStyles[activeTool] ?? {};
            const draftColor = draftDefaults.color ?? getDefaultColorForTool(activeTool);
            return renderShape(
              'draft',
              activeTool,
              (activeTool === 'brush' || activeTool === 'highlighter') && draft.brushPoints
                ? draft.brushPoints
                : [...draft.points, draft.current],
              draftColor,
              undefined,
              false,
              true,
              false,
              draftDefaults as Partial<DrawingObject>,
            );
          })()}

        {/* Visual OHLC Magnet Snap Ring */}
        {magnetMode &&
          hoverSnap &&
          activeTool !== 'crosshair' &&
          (() => {
            const snapPx = anchorToPixel(hoverSnap);
            if (!snapPx) return null;
            return (
              <g data-testid="magnet-snap-indicator" style={{ pointerEvents: 'none' }}>
                <circle
                  cx={snapPx.x}
                  cy={snapPx.y}
                  r={6}
                  fill="rgba(6, 182, 212, 0.16)"
                  stroke="#06b6d4"
                  strokeWidth={1.6}
                />
                <circle cx={snapPx.x} cy={snapPx.y} r={2} fill="#06b6d4" />
              </g>
            );
          })()}
      </svg>

      {/* Multi-Anchor Progressive Placement Guide Pill */}
      {draft && activeTool !== 'crosshair' && getRequiredPoints(activeTool) > 2 && (
        <div
          data-testid="multi-point-guide-pill"
          style={{ pointerEvents: 'none' }}
          className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 rounded-full border border-[var(--tv-accent)]/50 bg-[var(--tv-bg-elevated)]/95 text-[10.5px] font-medium text-[var(--tv-text-primary)] shadow-lg"
        >
          Placing <span className="text-[var(--tv-accent)] font-semibold uppercase">{activeTool}</span>: click point{' '}
          <span className="font-mono font-bold">{draft.points.length + 1}</span> of{' '}
          <span className="font-mono font-bold">{getRequiredPoints(activeTool)}</span> (Enter to finish · Esc to cancel)
        </div>
      )}

      {/* Pre-Draw + Selected TradingView Draggable Floating Style Toolbar */}
      {!hideDrawings &&
        (() => {
          const isPreDraw =
            !selectedDrawing && activeTool !== 'crosshair' && activeTool !== 'ai-range';
          const targetTool = selectedDrawing
            ? selectedDrawing.tool
            : isPreDraw
              ? (activeTool as Exclude<DrawingToolType, 'crosshair' | 'ai-range'>)
              : null;
          if (!targetTool) return null;

          const preDefaults = defaultToolStyles[targetTool] ?? {};
          const curColor =
            selectedDrawing?.color ?? preDefaults.color ?? getDefaultColorForTool(targetTool);
          const curLineOpacity = selectedDrawing?.lineOpacity ?? preDefaults.lineOpacity ?? 1;
          const curLineWidth =
            selectedDrawing?.lineWidth ??
            preDefaults.lineWidth ??
            (targetTool === 'highlighter' ? 12 : 2);
          const curLineStyle: DrawingLineStyle =
            selectedDrawing?.lineStyle ?? preDefaults.lineStyle ?? 'solid';

          const isFillCapable = FILL_CAPABLE_TOOLS.has(targetTool);
          const isBorderCapable = BORDER_CAPABLE_TOOLS.has(targetTool);

          const curShowFill = selectedDrawing
            ? selectedDrawing.showFill !== false
            : preDefaults.showFill !== false;
          const curFillColor =
            selectedDrawing?.fillColor ?? preDefaults.fillColor ?? curColor;
          const curFillOpacity =
            selectedDrawing?.fillOpacity ?? preDefaults.fillOpacity ?? 0.14;

          const curShowBorder = selectedDrawing
            ? selectedDrawing.showBorder !== false && (selectedDrawing.borderWidth ?? curLineWidth) > 0
            : preDefaults.showBorder !== false && (preDefaults.borderWidth ?? curLineWidth) > 0;
          const curBorderColor =
            selectedDrawing?.borderColor ?? preDefaults.borderColor ?? curColor;
          const curBorderWidth =
            selectedDrawing?.borderWidth ?? preDefaults.borderWidth ?? curLineWidth;
          const curBorderStyle: DrawingLineStyle =
            selectedDrawing?.borderStyle ?? preDefaults.borderStyle ?? curLineStyle;

          const curExtendRight = Boolean(
            selectedDrawing ? selectedDrawing.extendRight : preDefaults.extendRight,
          );
          const curShowMidline = selectedDrawing
            ? selectedDrawing.showMidline !== false
            : preDefaults.showMidline !== false;

          const applyStylePatch = (patch: Partial<DrawingObject>) => {
            if (selectedDrawing) {
              updateDrawing(selectedDrawing.id, patch);
            } else {
              setDefaultToolStyle(targetTool, patch as Partial<DrawingStyleTemplate>);
            }
          };

          const isActivelyGesturing = Boolean(draft?.dragMoved || dragMove);
          const popoverAlignRight = !toolbarPos || toolbarPos.x > plotWidth * 0.42;
          const popoverOpenUpward = Boolean(toolbarPos && toolbarPos.y > paneHeight - 310);
          const popoverPositionClass = `${popoverAlignRight ? 'right-0' : 'left-0'} ${
            popoverOpenUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`;

          return (
            <div
              ref={floatingToolbarRef}
              data-testid="drawing-floating-toolbar"
              data-mode={selectedDrawing ? 'selected' : 'pre-draw'}
              style={{
                pointerEvents: isActivelyGesturing ? 'none' : 'auto',
                ...(toolbarPos
                  ? { left: `${toolbarPos.x}px`, top: `${toolbarPos.y}px` }
                  : { right: '12px', top: '8px' }),
              }}
              className={`absolute z-20 flex items-center gap-1 px-2 py-1 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl transition-opacity ${
                isActivelyGesturing ? 'opacity-65' : 'opacity-100'
              }`}
            >
              {/* Drag Handle */}
              <span
                title="Drag floating toolbar"
                onPointerDown={(e) => {
                  e.preventDefault();
                  const rect = floatingToolbarRef.current?.getBoundingClientRect();
                  const svgRect = svgRef.current?.getBoundingClientRect();
                  const curX =
                    toolbarPos?.x ??
                    (rect && svgRect ? Math.max(8, rect.left - svgRect.left) : plotWidth - 480);
                  const curY =
                    toolbarPos?.y ??
                    (rect && svgRect ? Math.max(6, rect.top - svgRect.top) : 8);
                  toolbarDragRef.current = {
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    origX: curX,
                    origY: curY,
                  };
                }}
                className="text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-grab active:cursor-grabbing px-0.5"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>

              {/* Mode / Tool Label Pill */}
              <span
                data-testid="drawing-toolbar-mode-badge"
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-tight select-none max-w-[128px] truncate ${
                  isPreDraw
                    ? 'bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/30'
                    : 'bg-[var(--tv-bg-panel)] text-[var(--tv-text-secondary)] border border-[var(--tv-border)]'
                }`}
                title={
                  isPreDraw
                    ? `Pre-draw default style for ${formatToolDisplayName(targetTool)}`
                    : selectedDrawing?.title || formatToolDisplayName(targetTool)
                }
              >
                {isPreDraw
                  ? `Pre-Draw · ${formatToolDisplayName(targetTool)}`
                  : selectedDrawing?.title || formatToolDisplayName(targetTool)}
              </span>

              <div className="tv-divider-v !h-4" />

              {/* 1. Line / Stroke Color Swatch Popover Button */}
              <div className="relative">
                <button
                  type="button"
                  data-testid="drawing-color-popover-btn"
                  aria-label="Line stroke color and opacity"
                  title="Line / Stroke Color & Opacity"
                  onClick={() =>
                    setOpenPopover((prev) => (prev === 'color' ? null : 'color'))
                  }
                  className={`h-6 px-1.5 rounded flex items-center gap-1 border transition-colors cursor-pointer ${
                    openPopover === 'color'
                      ? 'border-[var(--tv-accent)] bg-[var(--tv-accent)]/12 text-[var(--tv-text-primary)]'
                      : 'border-transparent hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-secondary)]'
                  }`}
                >
                  <span className="flex flex-col items-center justify-center gap-0.5">
                    <svg width="13" height="11" viewBox="0 0 14 12" fill="none">
                      <path
                        d="M2 9.5L9.8 1.7L12.3 4.2L4.5 12H2V9.5Z"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      className="w-3.5 h-[3px] rounded-full"
                      style={{ backgroundColor: curColor, opacity: curLineOpacity }}
                    />
                  </span>
                  <ChevronDown className="w-2.5 h-2.5 opacity-70" />
                </button>

                {openPopover === 'color' && (
                  <div
                    data-testid="drawing-color-popover"
                    className={`absolute ${popoverPositionClass} z-40 w-[232px] p-2.5 rounded-[8px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl flex flex-col gap-2.5 text-[11px]`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--tv-text-primary)]">
                        Line / Stroke Color
                      </span>
                      <span className="font-mono text-[10px] text-[var(--tv-text-muted)] uppercase">
                        {curColor}
                      </span>
                    </div>
                    <div className="grid grid-cols-8 gap-1">
                      {TV_DRAWING_PALETTE.map((c) => {
                        const active = curColor.toLowerCase() === c.toLowerCase();
                        return (
                          <button
                            key={c}
                            type="button"
                            data-testid={`drawing-color-swatch-${c.slice(1)}`}
                            aria-label={`Color ${c}`}
                            onClick={() =>
                              applyStylePatch({
                                color: c,
                                ...(isBorderCapable &&
                                !(selectedDrawing?.borderColor ?? preDefaults.borderColor)
                                  ? { borderColor: c }
                                  : {}),
                              })
                            }
                            className={`w-[21px] h-[21px] rounded-[4px] border cursor-pointer transition-transform ${
                              active
                                ? 'border-white scale-110 ring-2 ring-[var(--tv-accent)]'
                                : 'border-white/15 hover:scale-105'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-1 pt-1 border-t border-[var(--tv-border)]">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="text-[var(--tv-text-muted)]">Opacity</span>
                        <span className="font-mono font-semibold text-[var(--tv-text-primary)]">
                          {Math.round(curLineOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        data-testid="drawing-line-opacity-slider"
                        min={10}
                        max={100}
                        step={5}
                        value={Math.round(curLineOpacity * 100)}
                        onChange={(e) =>
                          applyStylePatch({ lineOpacity: Number(e.target.value) / 100 })
                        }
                        className="w-full accent-[var(--tv-accent)] cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[var(--tv-border)]">
                      <span className="text-[10.5px] text-[var(--tv-text-muted)]">Custom Hex</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          aria-label="Custom color picker"
                          value={curColor.startsWith('#') ? curColor : '#2962ff'}
                          onChange={(e) => applyStylePatch({ color: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer bg-transparent border border-[var(--tv-border)] p-0"
                        />
                        <input
                          type="text"
                          data-testid="drawing-color-hex-input"
                          value={curColor}
                          onChange={(e) => applyStylePatch({ color: e.target.value })}
                          className="w-[76px] h-[22px] px-1.5 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] font-mono text-[10.5px] text-[var(--tv-text-primary)]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Background Fill Color & Opacity Popover Button */}
              {isFillCapable && (
                <div className="relative">
                  <button
                    type="button"
                    data-testid="drawing-fill-popover-btn"
                    aria-label="Background fill color and opacity"
                    title="Background Fill Color & Opacity"
                    onClick={() =>
                      setOpenPopover((prev) => (prev === 'fill' ? null : 'fill'))
                    }
                    className={`h-6 px-1.5 rounded flex items-center gap-1 border transition-colors cursor-pointer ${
                      openPopover === 'fill'
                        ? 'border-[var(--tv-accent)] bg-[var(--tv-accent)]/12 text-[var(--tv-text-primary)]'
                        : 'border-transparent hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-secondary)]'
                    }`}
                  >
                    <span className="flex flex-col items-center justify-center gap-0.5">
                      <svg width="13" height="11" viewBox="0 0 14 12" fill="none">
                        <rect
                          x="2"
                          y="1.5"
                          width="10"
                          height="8.5"
                          rx="1.5"
                          fill={curShowFill ? hexToRgba(curFillColor, 0.45) : 'none'}
                          stroke="currentColor"
                          strokeWidth="1.3"
                        />
                      </svg>
                      <span
                        className="w-3.5 h-[3px] rounded-full"
                        style={{
                          backgroundColor: curShowFill ? curFillColor : 'transparent',
                          border: curShowFill ? 'none' : '1px dashed #787b86',
                        }}
                      />
                    </span>
                    <ChevronDown className="w-2.5 h-2.5 opacity-70" />
                  </button>

                  {openPopover === 'fill' && (
                    <div
                      data-testid="drawing-fill-popover"
                      className={`absolute ${popoverPositionClass} z-40 w-[232px] p-2.5 rounded-[8px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl flex flex-col gap-2.5 text-[11px]`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 font-semibold text-[var(--tv-text-primary)] cursor-pointer">
                          <input
                            type="checkbox"
                            data-testid="drawing-fill-toggle"
                            checked={curShowFill}
                            onChange={(e) => applyStylePatch({ showFill: e.target.checked })}
                            className="accent-[var(--tv-accent)] cursor-pointer"
                          />
                          <span>Background Fill</span>
                        </label>
                        <span className="font-mono text-[10px] text-[var(--tv-text-muted)]">
                          {curShowFill ? `${Math.round(curFillOpacity * 100)}%` : 'Off'}
                        </span>
                      </div>
                      <div className="grid grid-cols-8 gap-1">
                        {TV_DRAWING_PALETTE.map((c) => {
                          const active = curFillColor.toLowerCase() === c.toLowerCase() && curShowFill;
                          return (
                            <button
                              key={c}
                              type="button"
                              data-testid={`drawing-fill-swatch-${c.slice(1)}`}
                              aria-label={`Fill color ${c}`}
                              onClick={() =>
                                applyStylePatch({ fillColor: c, showFill: true })
                              }
                              className={`w-[21px] h-[21px] rounded-[4px] border cursor-pointer transition-transform ${
                                active
                                  ? 'border-white scale-110 ring-2 ring-[var(--tv-accent)]'
                                  : 'border-white/15 hover:scale-105'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          );
                        })}
                      </div>
                      <div className="flex flex-col gap-1 pt-1 border-t border-[var(--tv-border)]">
                        <div className="flex items-center justify-between text-[10.5px]">
                          <span className="text-[var(--tv-text-muted)]">Fill Opacity</span>
                          <span className="font-mono font-semibold text-[var(--tv-text-primary)]">
                            {Math.round(curFillOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          data-testid="drawing-toolbar-fill-opacity-slider"
                          min={0}
                          max={90}
                          step={2}
                          value={Math.round(curFillOpacity * 100)}
                          onChange={(e) => {
                            const pct = Number(e.target.value);
                            applyStylePatch({
                              fillOpacity: pct / 100,
                              showFill: pct > 0,
                            });
                          }}
                          className="w-full accent-[var(--tv-accent)] cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[var(--tv-border)]">
                        <span className="text-[10.5px] text-[var(--tv-text-muted)]">Custom Hex</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            aria-label="Custom fill color"
                            value={curFillColor.startsWith('#') ? curFillColor : '#2962ff'}
                            onChange={(e) =>
                              applyStylePatch({ fillColor: e.target.value, showFill: true })
                            }
                            className="w-5 h-5 rounded cursor-pointer bg-transparent border border-[var(--tv-border)] p-0"
                          />
                          <input
                            type="text"
                            value={curFillColor}
                            onChange={(e) =>
                              applyStylePatch({ fillColor: e.target.value, showFill: true })
                            }
                            className="w-[76px] h-[22px] px-1.5 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] font-mono text-[10.5px] text-[var(--tv-text-primary)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Border Style, Width & Color Popover Button */}
              {isBorderCapable && (
                <div className="relative">
                  <button
                    type="button"
                    data-testid="drawing-border-popover-btn"
                    aria-label="Border color, thickness and style"
                    title="Border Color, Width & Style (Normal / Dashed / Dotted)"
                    onClick={() =>
                      setOpenPopover((prev) => (prev === 'border' ? null : 'border'))
                    }
                    className={`h-6 px-1.5 rounded flex items-center gap-1 border transition-colors cursor-pointer ${
                      openPopover === 'border'
                        ? 'border-[var(--tv-accent)] bg-[var(--tv-accent)]/12 text-[var(--tv-text-primary)]'
                        : 'border-transparent hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-secondary)]'
                    }`}
                  >
                    <span className="flex flex-col items-center justify-center gap-0.5">
                      <svg width="13" height="11" viewBox="0 0 14 12" fill="none">
                        <rect
                          x="2"
                          y="1.5"
                          width="10"
                          height="8.5"
                          rx="1.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeDasharray={
                            !curShowBorder
                              ? '1.5 2'
                              : curBorderStyle === 'dotted'
                                ? '1.2 2'
                                : curBorderStyle === 'dashed'
                                  ? '3 2'
                                  : undefined
                          }
                        />
                      </svg>
                      <span
                        className="w-3.5 h-[3px] rounded-full"
                        style={{
                          backgroundColor: curShowBorder ? curBorderColor : 'transparent',
                          border: curShowBorder ? 'none' : '1px dashed #787b86',
                        }}
                      />
                    </span>
                    <ChevronDown className="w-2.5 h-2.5 opacity-70" />
                  </button>

                  {openPopover === 'border' && (
                    <div
                      data-testid="drawing-border-popover"
                      className={`absolute ${popoverPositionClass} z-40 w-[240px] p-2.5 rounded-[8px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl flex flex-col gap-2.5 text-[11px]`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 font-semibold text-[var(--tv-text-primary)] cursor-pointer">
                          <input
                            type="checkbox"
                            data-testid="drawing-border-toggle"
                            checked={curShowBorder}
                            onChange={(e) =>
                              applyStylePatch({
                                showBorder: e.target.checked,
                                ...(e.target.checked && curBorderWidth === 0
                                  ? { borderWidth: 2 }
                                  : {}),
                              })
                            }
                            className="accent-[var(--tv-accent)] cursor-pointer"
                          />
                          <span>Border</span>
                        </label>
                        <span className="font-mono text-[10px] text-[var(--tv-text-muted)] capitalize">
                          {curShowBorder ? `${curBorderWidth}px · ${curBorderStyle === 'solid' ? 'Normal' : curBorderStyle}` : 'Hidden'}
                        </span>
                      </div>

                      <div className="grid grid-cols-8 gap-1">
                        {TV_DRAWING_PALETTE.map((c) => {
                          const active =
                            curBorderColor.toLowerCase() === c.toLowerCase() && curShowBorder;
                          return (
                            <button
                              key={c}
                              type="button"
                              data-testid={`drawing-border-swatch-${c.slice(1)}`}
                              aria-label={`Border color ${c}`}
                              onClick={() =>
                                applyStylePatch({
                                  borderColor: c,
                                  showBorder: true,
                                  ...(curBorderWidth === 0 ? { borderWidth: 2 } : {}),
                                })
                              }
                              className={`w-[21px] h-[21px] rounded-[4px] border cursor-pointer transition-transform ${
                                active
                                  ? 'border-white scale-110 ring-2 ring-[var(--tv-accent)]'
                                  : 'border-white/15 hover:scale-105'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          );
                        })}
                      </div>

                      <div className="flex flex-col gap-1 pt-1 border-t border-[var(--tv-border)]">
                        <span className="text-[10.5px] text-[var(--tv-text-muted)]">
                          Border Thickness
                        </span>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4].map((bw) => (
                            <button
                              key={bw}
                              type="button"
                              data-testid={`drawing-border-width-${bw}`}
                              onClick={() =>
                                applyStylePatch({ borderWidth: bw, showBorder: true })
                              }
                              className={`flex-1 h-[24px] rounded border font-mono text-[10.5px] cursor-pointer ${
                                curShowBorder && curBorderWidth === bw
                                  ? 'bg-[var(--tv-accent)] border-[var(--tv-accent)] text-white font-semibold'
                                  : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]'
                              }`}
                            >
                              {bw}px
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 pt-1 border-t border-[var(--tv-border)]">
                        <span className="text-[10.5px] text-[var(--tv-text-muted)]">
                          Border Type
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              ['solid', 'Normal'],
                              ['dashed', 'Dashed'],
                              ['dotted', 'Dotted'],
                            ] as const
                          ).map(([st, lbl]) => (
                            <button
                              key={st}
                              type="button"
                              data-testid={`drawing-border-style-${st}`}
                              onClick={() =>
                                applyStylePatch({
                                  borderStyle: st,
                                  showBorder: true,
                                  ...(curBorderWidth === 0 ? { borderWidth: 2 } : {}),
                                })
                              }
                              className={`h-[26px] px-1.5 rounded border text-[10.5px] flex items-center justify-center gap-1 cursor-pointer ${
                                curShowBorder && curBorderStyle === st
                                  ? 'bg-[var(--tv-accent)] border-[var(--tv-accent)] text-white font-semibold'
                                  : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]'
                              }`}
                            >
                              <span>{lbl}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[var(--tv-border)]">
                        <span className="text-[10.5px] text-[var(--tv-text-muted)]">Custom Hex</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            aria-label="Custom border color"
                            value={curBorderColor.startsWith('#') ? curBorderColor : '#2962ff'}
                            onChange={(e) =>
                              applyStylePatch({ borderColor: e.target.value, showBorder: true })
                            }
                            className="w-5 h-5 rounded cursor-pointer bg-transparent border border-[var(--tv-border)] p-0"
                          />
                          <input
                            type="text"
                            value={curBorderColor}
                            onChange={(e) =>
                              applyStylePatch({ borderColor: e.target.value, showFill: curShowFill, showBorder: true })
                            }
                            className="w-[76px] h-[22px] px-1.5 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] font-mono text-[10.5px] text-[var(--tv-text-primary)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="tv-divider-v !h-4" />

              {/* 4. Direct Line / Border Thickness Controls (1px-4px) */}
              <div className="flex items-center gap-0.5" title="Thickness">
                {[1, 2, 3, 4].map((w) => (
                  <button
                    key={w}
                    type="button"
                    data-testid={`drawing-width-${w}`}
                    title={`${w}px thickness`}
                    onClick={() =>
                      applyStylePatch({
                        lineWidth: w,
                        ...(isBorderCapable && curShowBorder ? { borderWidth: w } : {}),
                      })
                    }
                    className={`px-1 h-5 rounded text-[10px] font-mono cursor-pointer ${
                      curLineWidth === w
                        ? 'bg-[var(--tv-accent)] text-white font-semibold'
                        : 'text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>

              <div className="tv-divider-v !h-4" />

              {/* 5. Direct Line / Border Type Controls (Normal / Dashed / Dotted with crisp SVG previews) */}
              <div className="flex items-center gap-0.5" title="Line type (Normal / Dashed / Dotted)">
                {(
                  [
                    ['solid', 'Normal line', undefined],
                    ['dashed', 'Dashed line', '4 2.5'],
                    ['dotted', 'Dotted line', '1.3 2.5'],
                  ] as const
                ).map(([style, labelTitle, svgDash]) => {
                  const active = (isBorderCapable ? curBorderStyle : curLineStyle) === style;
                  return (
                    <button
                      key={style}
                      type="button"
                      data-testid={`drawing-style-${style}`}
                      aria-label={labelTitle}
                      title={labelTitle}
                      onClick={() =>
                        applyStylePatch({
                          lineStyle: style,
                          ...(isBorderCapable ? { borderStyle: style, showBorder: true } : {}),
                        })
                      }
                      className={`px-1.5 h-5 rounded flex items-center justify-center cursor-pointer ${
                        active
                          ? 'bg-[var(--tv-accent)] text-white'
                          : 'text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                      }`}
                    >
                      <svg width="18" height="8" viewBox="0 0 18 8" fill="none">
                        <line
                          x1="1"
                          y1="4"
                          x2="17"
                          y2="4"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeDasharray={svgDash}
                          strokeLinecap={style === 'dotted' ? 'round' : undefined}
                        />
                      </svg>
                    </button>
                  );
                })}
              </div>

              <div className="tv-divider-v !h-4" />

              {/* Extend Right & Midline Quick Toggles */}
              <button
                type="button"
                data-testid="drawing-toggle-extend"
                title="Extend right to price scale"
                onClick={() => applyStylePatch({ extendRight: !curExtendRight })}
                className={`px-1.5 h-5 rounded text-[10px] font-mono cursor-pointer ${
                  curExtendRight
                    ? 'bg-[var(--tv-accent)] text-white'
                    : 'text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                }`}
              >
                →|
              </button>

              {(targetTool === 'rect' || targetTool === 'channel') && (
                <button
                  type="button"
                  data-testid="drawing-toggle-midline"
                  title="Toggle 50% Equilibrium (CE) midline"
                  onClick={() => applyStylePatch({ showMidline: !curShowMidline })}
                  className={`px-1.5 h-5 rounded text-[10px] font-mono cursor-pointer ${
                    curShowMidline
                      ? 'bg-[var(--tv-accent)] text-white'
                      : 'text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)]'
                  }`}
                >
                  ½
                </button>
              )}

              {selectedDrawing && (
                <button
                  type="button"
                  data-testid="drawing-edit-label"
                  title="Add or edit text label on drawing"
                  onClick={() => {
                    setEditingTextId(selectedDrawing.id);
                    setEditingTextVal(selectedDrawing.text ?? '');
                  }}
                  className="px-1.5 h-5 rounded text-[10px] font-medium text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
                >
                  Txt
                </button>
              )}

              <select
                data-testid="drawing-quick-template-select"
                aria-label="Apply drawing style template"
                value=""
                onChange={(e) => {
                  const tplId = e.target.value;
                  if (!tplId) return;
                  if (selectedDrawing) {
                    applyDrawingTemplate(selectedDrawing.id, tplId);
                  } else {
                    const tpl = drawingTemplates.find((t) => t.id === tplId);
                    if (tpl) {
                      setDefaultToolStyle(targetTool, {
                        color: tpl.color,
                        lineWidth: tpl.lineWidth,
                        lineStyle: tpl.lineStyle,
                        lineOpacity: tpl.lineOpacity,
                        borderColor: tpl.borderColor ?? tpl.color,
                        borderWidth: tpl.borderWidth ?? tpl.lineWidth,
                        borderStyle: tpl.borderStyle ?? tpl.lineStyle,
                        showBorder: tpl.showBorder ?? true,
                        fillColor: tpl.fillColor ?? tpl.color,
                        fillOpacity: tpl.fillOpacity,
                        showFill: tpl.showFill,
                        extendLeft: tpl.extendLeft,
                        extendRight: tpl.extendRight,
                        showMidline: tpl.showMidline,
                      });
                    }
                  }
                }}
                className="h-5 max-w-[92px] px-1 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[10px] text-[var(--tv-text-secondary)] cursor-pointer"
              >
                <option value="">Templates</option>
                {drawingTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>

              {selectedDrawing && (
                <>
                  <button
                    type="button"
                    data-testid="drawing-open-settings"
                    aria-label="Customize drawing settings"
                    title="Settings (Style, Border, Background, Text & Coordinates)"
                    onClick={() => openDrawingSettings(selectedDrawing.id)}
                    className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-accent)] hover:bg-[var(--tv-accent)]/15 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                  <div className="tv-divider-v !h-4" />
                  <button
                    type="button"
                    data-testid="drawing-clone-selected"
                    aria-label="Clone selected drawing"
                    title="Clone drawing"
                    onClick={() => {
                      const offsetFactor = 1.006;
                      const cloneId = `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                      addDrawing({
                        ...selectedDrawing,
                        id: cloneId,
                        points: selectedDrawing.points.map((p) => ({
                          time: p.time + stepSec * 2,
                          price: p.price * offsetFactor,
                        })),
                        stopPrice:
                          selectedDrawing.stopPrice !== undefined
                            ? selectedDrawing.stopPrice * offsetFactor
                            : undefined,
                        targetPrice:
                          selectedDrawing.targetPrice !== undefined
                            ? selectedDrawing.targetPrice * offsetFactor
                            : undefined,
                      });
                      selectDrawing(cloneId);
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={selectedDrawing.locked ? 'Unlock drawing' : 'Lock drawing'}
                    onClick={() =>
                      updateDrawing(selectedDrawing.id, { locked: !selectedDrawing.locked })
                    }
                    className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
                  >
                    {selectedDrawing.locked ? (
                      <Lock className="w-3.5 h-3.5 text-[var(--tv-accent)]" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    data-testid="drawing-delete-selected"
                    aria-label="Delete selected drawing"
                    title="Delete selected drawing (Del)"
                    onClick={deleteSelectedDrawing}
                    className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[#f23645] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          );
        })()}

      {/* Right-Click Drawing Context Menu */}
      {contextMenu &&
        (() => {
          const ctxDrawing = symbolDrawings.find((d) => d.id === contextMenu.drawingId);
          if (!ctxDrawing) return null;
          return (
            <div
              data-testid="drawing-context-menu"
              style={{
                pointerEvents: 'auto',
                left: `${contextMenu.x}px`,
                top: `${contextMenu.y}px`,
              }}
              className="absolute z-30 w-[202px] py-1 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl text-[12px] text-[var(--tv-text-primary)]"
            >
              <button
                type="button"
                onClick={() => {
                  openDrawingSettings(ctxDrawing.id);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--tv-bg-hover)] cursor-pointer text-left"
              >
                <Sliders className="w-3.5 h-3.5 text-[var(--tv-accent)]" />
                <span>Settings &amp; Coordinates...</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const cloneId = `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                  addDrawing({
                    ...ctxDrawing,
                    id: cloneId,
                    points: ctxDrawing.points.map((p) => ({
                      time: p.time + stepSec * 2,
                      price: p.price * 1.004,
                    })),
                  });
                  selectDrawing(cloneId);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--tv-bg-hover)] cursor-pointer text-left"
              >
                <Copy className="w-3.5 h-3.5 text-[var(--tv-text-secondary)]" />
                <span>Clone Drawing</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  reorderDrawing(ctxDrawing.id, 'front');
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--tv-bg-hover)] cursor-pointer text-left"
              >
                <ArrowUpToLine className="w-3.5 h-3.5 text-[var(--tv-text-secondary)]" />
                <span>Bring to Front</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  reorderDrawing(ctxDrawing.id, 'back');
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--tv-bg-hover)] cursor-pointer text-left"
              >
                <ArrowDownToLine className="w-3.5 h-3.5 text-[var(--tv-text-secondary)]" />
                <span>Send to Back</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (ctxDrawing.tool === 'fib' || ctxDrawing.tool === 'fib_ext') {
                    updateDrawing(ctxDrawing.id, { reverseFib: !ctxDrawing.reverseFib });
                  } else {
                    updateDrawing(ctxDrawing.id, { points: [...ctxDrawing.points].reverse() });
                  }
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--tv-bg-hover)] cursor-pointer text-left"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[var(--tv-text-secondary)]" />
                <span>Reverse Direction</span>
              </button>
              <div className="my-1 border-t border-[var(--tv-border)]" />
              <button
                type="button"
                onClick={() => {
                  selectDrawing(ctxDrawing.id);
                  deleteSelectedDrawing();
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--tv-bg-hover)] text-[#f23645] cursor-pointer text-left"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Drawing</span>
              </button>
            </div>
          );
        })()}

      {/* Inline Text Annotation Editor */}
      {editingTextId && (
        <div
          style={{ pointerEvents: 'auto' }}
          className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-xl"
        >
          <input
            type="text"
            autoFocus
            value={editingTextVal}
            onChange={(e) => setEditingTextVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateDrawing(editingTextId, { text: editingTextVal.trim() || 'Note' });
                setEditingTextId(null);
              } else if (e.key === 'Escape') {
                setEditingTextId(null);
              }
            }}
            className="h-[26px] w-[180px] px-2 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[12px] text-[var(--tv-text-primary)] focus:outline-none focus:border-[var(--tv-accent)]"
            placeholder="Annotation text..."
          />
          <button
            type="button"
            onClick={() => {
              updateDrawing(editingTextId, { text: editingTextVal.trim() || 'Note' });
              setEditingTextId(null);
            }}
            className="h-[26px] px-2.5 rounded bg-[var(--tv-accent)] text-white text-[11px] font-medium cursor-pointer"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
