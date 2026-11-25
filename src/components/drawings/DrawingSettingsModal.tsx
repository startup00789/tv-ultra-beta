import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Bookmark,
  Check,
  ChevronDown,
  Crosshair,
  Eye,
  Italic,
  Palette,
  RotateCcw,
  Save,
  Sliders,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  TV_DRAWING_PALETTE,
  type DrawingLineStyle,
  type DrawingObject,
  type PitchforkVariant,
  type Timeframe,
} from '../../../shared/types';
import { useWorkspaceStore } from '../../state/workspaceStore';

const STANDARD_FIB_CANDIDATES = [
  0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 0.886, 1, 1.272, 1.618, 2, 2.618, 3.618, 4.236,
] as const;

const DEFAULT_FIB_RET = [0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1];
const DEFAULT_FIB_EXT = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618];

const ALL_TIMEFRAMES: readonly Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'];

type SettingsTab = 'style' | 'text' | 'coordinates' | 'visibility' | 'templates';

interface SwatchPickerButtonProps {
  testId: string;
  color: string;
  opacity?: number;
  disabled?: boolean;
  onChangeColor: (hex: string) => void;
  onChangeOpacity?: (opacity: number) => void;
  label: string;
}

function SwatchPickerButton({
  testId,
  color,
  opacity,
  disabled,
  onChangeColor,
  onChangeOpacity,
  label,
}: SwatchPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (wrapRef.current?.contains(ev.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        data-testid={testId}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-[32px] h-[30px] rounded-[6px] p-[3px] border bg-[var(--tv-bg-panel)] flex items-center justify-center transition-colors ${
          disabled
            ? 'opacity-40 cursor-not-allowed border-[var(--tv-border)]'
            : open
              ? 'border-[var(--tv-accent)] ring-2 ring-[var(--tv-accent)]/25 cursor-pointer'
              : 'border-[var(--tv-border)] hover:border-[var(--tv-text-muted)] cursor-pointer'
        }`}
      >
        <span
          className="w-full h-full rounded-[3.5px] border border-white/15"
          style={{ backgroundColor: color, opacity: opacity ?? 1 }}
        />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-[236px] p-2.5 rounded-[8px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl flex flex-col gap-2.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--tv-text-primary)]">{label}</span>
            <span className="font-mono text-[10px] text-[var(--tv-text-muted)] uppercase">
              {color}
            </span>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {TV_DRAWING_PALETTE.map((c) => {
              const active = color.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={`${label} ${c}`}
                  onClick={() => onChangeColor(c)}
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
          {onChangeOpacity && opacity !== undefined && (
            <div className="flex flex-col gap-1 pt-1 border-t border-[var(--tv-border)]">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="text-[var(--tv-text-muted)]">Opacity</span>
                <span className="font-mono font-semibold">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={Math.round(opacity * 100)}
                onChange={(e) => onChangeOpacity(Number(e.target.value) / 100)}
                className="w-full accent-[var(--tv-accent)] cursor-pointer"
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[var(--tv-border)]">
            <span className="text-[10.5px] text-[var(--tv-text-muted)]">Custom Hex</span>
            <div className="flex items-center gap-1">
              <input
                type="color"
                aria-label={`Custom ${label}`}
                value={color.startsWith('#') ? color : '#2962ff'}
                onChange={(e) => onChangeColor(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer bg-transparent border border-[var(--tv-border)] p-0"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => onChangeColor(e.target.value)}
                className="w-[78px] h-[22px] px-1.5 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] font-mono text-[10.5px] text-[var(--tv-text-primary)]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LineStyleSegment({
  value,
  onChange,
  testIdPrefix,
  disabled,
}: {
  value: DrawingLineStyle;
  onChange: (style: DrawingLineStyle) => void;
  testIdPrefix: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {(
        [
          ['solid', 'Normal', undefined],
          ['dashed', 'Dashed', '5 3'],
          ['dotted', 'Dotted', '1.4 3'],
        ] as const
      ).map(([st, lbl, svgDash]) => {
        const active = value === st && !disabled;
        return (
          <button
            key={st}
            type="button"
            disabled={disabled}
            data-testid={`${testIdPrefix}-${st}`}
            onClick={() => onChange(st)}
            className={`h-[28px] px-2 rounded-[5px] border text-[11px] flex items-center justify-center gap-1.5 transition-colors ${
              disabled
                ? 'opacity-40 cursor-not-allowed bg-[var(--tv-bg-panel)] border-[var(--tv-border)]'
                : active
                  ? 'bg-[var(--tv-accent)] border-[var(--tv-accent)] text-white font-semibold cursor-pointer'
                  : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)] cursor-pointer'
            }`}
          >
            <svg width="16" height="6" viewBox="0 0 16 6" fill="none" className="shrink-0">
              <line
                x1="1"
                y1="3"
                x2="15"
                y2="3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeDasharray={svgDash}
                strokeLinecap={st === 'dotted' ? 'round' : undefined}
              />
            </svg>
            <span>{lbl}</span>
          </button>
        );
      })}
    </div>
  );
}

export function DrawingSettingsModal() {
  const drawingSettingsId = useWorkspaceStore((s) => s.drawingSettingsId);
  const drawings = useWorkspaceStore((s) => s.drawings);
  const drawingTemplates = useWorkspaceStore((s) => s.drawingTemplates);
  const openDrawingSettings = useWorkspaceStore((s) => s.openDrawingSettings);
  const updateDrawing = useWorkspaceStore((s) => s.updateDrawing);
  const saveDrawingTemplate = useWorkspaceStore((s) => s.saveDrawingTemplate);
  const deleteDrawingTemplate = useWorkspaceStore((s) => s.deleteDrawingTemplate);
  const applyDrawingTemplate = useWorkspaceStore((s) => s.applyDrawingTemplate);
  const setDefaultToolStyle = useWorkspaceStore((s) => s.setDefaultToolStyle);

  const [tab, setTab] = useState<SettingsTab>('style');
  const [templateName, setTemplateName] = useState('');
  const [customFibInput, setCustomFibInput] = useState('');
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [footerTplOpen, setFooterTplOpen] = useState(false);

  const footerTplRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<{ id: string; data: DrawingObject } | null>(null);

  const drawing = drawings.find((d) => d.id === drawingSettingsId) ?? null;

  // Capture a clean revert snapshot whenever a drawing is opened in Settings
  useEffect(() => {
    if (!drawingSettingsId) {
      snapshotRef.current = null;
      setFooterTplOpen(false);
      return;
    }
    const target = useWorkspaceStore
      .getState()
      .drawings.find((d) => d.id === drawingSettingsId);
    if (target && snapshotRef.current?.id !== drawingSettingsId) {
      snapshotRef.current = {
        id: drawingSettingsId,
        data: {
          ...target,
          points: target.points.map((p) => ({ ...p })),
          fibLevels: target.fibLevels ? [...target.fibLevels] : undefined,
          visibleTimeframes: target.visibleTimeframes
            ? [...target.visibleTimeframes]
            : undefined,
        },
      };
      setTab('style');
    }
  }, [drawingSettingsId]);

  useEffect(() => {
    if (!footerTplOpen) return;
    const onDown = (ev: MouseEvent) => {
      if (footerTplRef.current?.contains(ev.target as Node)) return;
      setFooterTplOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [footerTplOpen]);

  useEffect(() => {
    if (!drawingSettingsId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        openDrawingSettings(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawingSettingsId, openDrawingSettings]);

  if (!drawingSettingsId || !drawing) return null;

  const handleCancelRevert = () => {
    if (snapshotRef.current && snapshotRef.current.id === drawing.id) {
      updateDrawing(drawing.id, snapshotRef.current.data, { replace: true });
    }
    openDrawingSettings(null);
  };

  const handleCommitOk = () => {
    openDrawingSettings(null);
  };

  const isFibTool =
    drawing.tool === 'fib' || drawing.tool === 'fib_ext' || drawing.tool === 'fib_fan';
  const isPositionTool =
    drawing.tool === 'long_position' || drawing.tool === 'short_position';
  const isBorderCapable =
    drawing.tool === 'rect' ||
    drawing.tool === 'channel' ||
    drawing.tool === 'circle' ||
    drawing.tool === 'triangle' ||
    drawing.tool === 'callout' ||
    drawing.tool === 'text' ||
    drawing.tool === 'gann_box' ||
    drawing.tool === 'measure' ||
    drawing.tool === 'price_range' ||
    drawing.tool === 'date_range' ||
    drawing.tool === 'long_position' ||
    drawing.tool === 'short_position' ||
    drawing.tool === 'anchored_vp';
  const isFillCapable =
    isBorderCapable ||
    drawing.tool === 'pitchfork' ||
    drawing.tool === 'fib' ||
    drawing.tool === 'fib_ext' ||
    drawing.tool === 'xabcd' ||
    drawing.tool === 'abcd' ||
    drawing.tool === 'head_shoulders' ||
    drawing.tool === 'regression';

  const curShowBorder =
    drawing.showBorder !== false && (drawing.borderWidth ?? drawing.lineWidth ?? 2) > 0;
  const curBorderColor = drawing.borderColor ?? drawing.color;
  const curBorderWidth = drawing.borderWidth ?? drawing.lineWidth ?? 2;
  const curBorderStyle: DrawingLineStyle =
    drawing.borderStyle ?? drawing.lineStyle ?? 'solid';

  const curShowFill = drawing.showFill !== false;
  const curFillColor = drawing.fillColor ?? drawing.color;
  const curFillOpacity = drawing.fillOpacity ?? 0.14;

  const activeFibLevels =
    drawing.fibLevels ??
    (drawing.tool === 'fib_ext' ? DEFAULT_FIB_EXT : DEFAULT_FIB_RET);

  const toggleFibRatio = (ratio: number) => {
    const exists = activeFibLevels.some((v) => Math.abs(v - ratio) < 1e-4);
    const next = exists
      ? activeFibLevels.filter((v) => Math.abs(v - ratio) >= 1e-4)
      : [...activeFibLevels, ratio].sort((a, b) => a - b);
    if (next.length > 0) {
      updateDrawing(drawing.id, { fibLevels: next });
    }
  };

  const addCustomFibRatio = () => {
    const val = Number(customFibInput);
    if (!Number.isFinite(val) || val < -5 || val > 15) return;
    const rounded = Number(val.toFixed(4));
    if (!activeFibLevels.some((v) => Math.abs(v - rounded) < 1e-4)) {
      const next = [...activeFibLevels, rounded].sort((a, b) => a - b);
      updateDrawing(drawing.id, { fibLevels: next });
    }
    setCustomFibInput('');
  };

  const flashToast = (msg: string) => {
    setSavedToast(msg);
    window.setTimeout(() => setSavedToast(null), 2200);
  };

  const allFibCandidates = Array.from(
    new Set([...STANDARD_FIB_CANDIDATES, ...activeFibLevels]),
  ).sort((a, b) => a - b);

  const activeVisibleTfs =
    drawing.visibleTimeframes && drawing.visibleTimeframes.length > 0
      ? drawing.visibleTimeframes
      : [...ALL_TIMEFRAMES];

  const toggleTimeframeVisibility = (tf: Timeframe) => {
    const has = activeVisibleTfs.includes(tf);
    const next = has
      ? activeVisibleTfs.filter((t) => t !== tf)
      : ALL_TIMEFRAMES.filter((t) => t === tf || activeVisibleTfs.includes(t));
    if (next.length === 0) return;
    updateDrawing(drawing.id, {
      visibleTimeframes: next.length === ALL_TIMEFRAMES.length ? undefined : next,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={handleCommitOk}
    >
      <div
        data-testid="drawing-settings-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[660px] rounded-[10px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-[12px] text-[var(--tv-text-primary)]"
      >
        {/* TradingView Header */}
        <div className="px-5 py-3.5 border-b border-[var(--tv-border)] flex items-center justify-between bg-[var(--tv-bg-panel)]">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-[var(--tv-accent)]" />
            <div>
              <div className="font-semibold text-[15px] capitalize tracking-tight">
                {drawing.title || drawing.tool.replace(/_/g, ' ')} Settings
              </div>
              <div className="text-[10.5px] text-[var(--tv-text-muted)]">
                {drawing.symbol} · {drawing.timeframe} · {drawing.points.length} anchor
                {drawing.points.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close drawing settings"
            onClick={handleCommitOk}
            className="w-7 h-7 rounded-[6px] flex items-center justify-center text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TradingView Left-Sidebar + Right Content Split */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left Navigation Rail */}
          <nav
            aria-label="Drawing settings sections"
            className="w-[168px] shrink-0 border-r border-[var(--tv-border)] bg-[var(--tv-bg-panel)]/55 p-2 flex flex-col gap-0.5"
          >
            {(
              [
                ['style', 'Style', Palette],
                ['text', 'Text', Type],
                ['coordinates', 'Coordinates', Crosshair],
                ['visibility', 'Visibility', Eye],
                ['templates', 'Templates', Bookmark],
              ] as const
            ).map(([id, label, Icon]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`drawing-settings-tab-${id}`}
                  onClick={() => setTab(id)}
                  className={`w-full px-3 py-2 rounded-[6px] text-[12.5px] font-medium flex items-center gap-2.5 transition-colors cursor-pointer text-left ${
                    active
                      ? 'bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] font-semibold'
                      : 'text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)]/60 hover:text-[var(--tv-text-primary)]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-[var(--tv-accent)]' : 'text-[var(--tv-text-muted)]'
                    }`}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Scrollable Settings Body */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            {tab === 'style' && (
              <>
                {/* Object Name */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-[var(--tv-text-secondary)] shrink-0">
                    Object Name
                  </span>
                  <input
                    type="text"
                    data-testid="drawing-title-input"
                    value={drawing.title ?? ''}
                    onChange={(e) => updateDrawing(drawing.id, { title: e.target.value })}
                    placeholder={`e.g. London High / Bullish FVG`}
                    className="w-[270px] h-[30px] px-2.5 rounded-[6px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] focus:outline-none focus:border-[var(--tv-accent)]"
                  />
                </div>

                {/* LINE / STROKE SECTION */}
                <div className="pt-2 border-t border-[var(--tv-border)] flex flex-col gap-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                    Line / Stroke
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-[var(--tv-text-primary)]">
                      Color &amp; Thickness
                    </span>
                    <div className="flex items-center gap-2">
                      <SwatchPickerButton
                        testId="modal-line-color-btn"
                        label="Line Color"
                        color={drawing.color}
                        opacity={drawing.lineOpacity ?? 1}
                        onChangeColor={(hex) => updateDrawing(drawing.id, { color: hex })}
                        onChangeOpacity={(op) => updateDrawing(drawing.id, { lineOpacity: op })}
                      />
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((w) => (
                          <button
                            key={w}
                            type="button"
                            data-testid={`modal-line-width-${w}`}
                            onClick={() => updateDrawing(drawing.id, { lineWidth: w })}
                            className={`w-[34px] h-[28px] rounded-[5px] border text-[11px] font-mono cursor-pointer ${
                              (drawing.lineWidth ?? 2) === w
                                ? 'bg-[var(--tv-accent)] border-[var(--tv-accent)] text-white font-semibold'
                                : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]'
                            }`}
                          >
                            {w}px
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-[var(--tv-text-primary)]">Line Type</span>
                    <div className="w-[270px]">
                      <LineStyleSegment
                        value={drawing.lineStyle ?? 'solid'}
                        testIdPrefix="modal-line-style"
                        onChange={(st) => updateDrawing(drawing.id, { lineStyle: st })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] text-[var(--tv-text-secondary)]">
                        Left End
                      </span>
                      <select
                        data-testid="modal-left-end-select"
                        value={drawing.arrowStart ? 'arrow' : 'normal'}
                        onChange={(e) =>
                          updateDrawing(drawing.id, { arrowStart: e.target.value === 'arrow' })
                        }
                        className="h-[28px] w-[112px] px-2 rounded-[5px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] cursor-pointer"
                      >
                        <option value="normal">Normal</option>
                        <option value="arrow">Arrow</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] text-[var(--tv-text-secondary)]">
                        Right End
                      </span>
                      <select
                        data-testid="modal-right-end-select"
                        value={drawing.arrowEnd ? 'arrow' : 'normal'}
                        onChange={(e) =>
                          updateDrawing(drawing.id, { arrowEnd: e.target.value === 'arrow' })
                        }
                        className="h-[28px] w-[112px] px-2 rounded-[5px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] cursor-pointer"
                      >
                        <option value="normal">Normal</option>
                        <option value="arrow">Arrow</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-0.5 text-[11.5px]">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(drawing.extendLeft)}
                        onChange={(e) =>
                          updateDrawing(drawing.id, { extendLeft: e.target.checked })
                        }
                        className="accent-[var(--tv-accent)] w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Extend Left</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(drawing.extendRight)}
                        onChange={(e) =>
                          updateDrawing(drawing.id, { extendRight: e.target.checked })
                        }
                        className="accent-[var(--tv-accent)] w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Extend Right</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={drawing.showMidline !== false}
                        onChange={(e) =>
                          updateDrawing(drawing.id, { showMidline: e.target.checked })
                        }
                        className="accent-[var(--tv-accent)] w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Middle Line (50% CE)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(drawing.showStats)}
                        onChange={(e) =>
                          updateDrawing(drawing.id, { showStats: e.target.checked })
                        }
                        className="accent-[var(--tv-accent)] w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Always Show Stats / Pips</span>
                    </label>
                  </div>
                </div>

                {/* BORDER SECTION */}
                {isBorderCapable && (
                  <div className="pt-3 border-t border-[var(--tv-border)] flex flex-col gap-3">
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                      Border
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid="modal-border-toggle"
                          checked={curShowBorder}
                          onChange={(e) =>
                            updateDrawing(drawing.id, {
                              showBorder: e.target.checked,
                              ...(e.target.checked && curBorderWidth === 0
                                ? { borderWidth: 2 }
                                : {}),
                            })
                          }
                          className="accent-[var(--tv-accent)] w-4 h-4 cursor-pointer"
                        />
                        <span>Border</span>
                      </label>

                      <div className="flex items-center gap-2">
                        <SwatchPickerButton
                          testId="modal-border-color-btn"
                          label="Border Color"
                          color={curBorderColor}
                          opacity={drawing.borderOpacity ?? 1}
                          disabled={!curShowBorder}
                          onChangeColor={(hex) =>
                            updateDrawing(drawing.id, { borderColor: hex, showBorder: true })
                          }
                          onChangeOpacity={(op) =>
                            updateDrawing(drawing.id, { borderOpacity: op })
                          }
                        />
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((bw) => (
                            <button
                              key={bw}
                              type="button"
                              disabled={!curShowBorder}
                              data-testid={`modal-border-width-${bw}`}
                              onClick={() =>
                                updateDrawing(drawing.id, { borderWidth: bw, showBorder: true })
                              }
                              className={`w-[34px] h-[28px] rounded-[5px] border text-[11px] font-mono ${
                                !curShowBorder
                                  ? 'opacity-40 cursor-not-allowed bg-[var(--tv-bg-panel)] border-[var(--tv-border)]'
                                  : curBorderWidth === bw
                                    ? 'bg-[var(--tv-accent)] border-[var(--tv-accent)] text-white font-semibold cursor-pointer'
                                    : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)] cursor-pointer'
                              }`}
                            >
                              {bw}px
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12px] text-[var(--tv-text-secondary)]">
                        Border Type
                      </span>
                      <div className="w-[270px]">
                        <LineStyleSegment
                          value={curBorderStyle}
                          disabled={!curShowBorder}
                          testIdPrefix="modal-border-style"
                          onChange={(st) =>
                            updateDrawing(drawing.id, { borderStyle: st, showBorder: true })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* BACKGROUND SECTION */}
                {isFillCapable && (
                  <div className="pt-3 border-t border-[var(--tv-border)] flex flex-col gap-2.5">
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                      Background
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid="modal-fill-toggle"
                          checked={curShowFill}
                          onChange={(e) =>
                            updateDrawing(drawing.id, { showFill: e.target.checked })
                          }
                          className="accent-[var(--tv-accent)] w-4 h-4 cursor-pointer"
                        />
                        <span>Background</span>
                      </label>

                      <div className="flex items-center gap-3 w-[270px]">
                        <SwatchPickerButton
                          testId="modal-fill-color-btn"
                          label="Fill Color"
                          color={curFillColor}
                          disabled={!curShowFill}
                          onChangeColor={(hex) =>
                            updateDrawing(drawing.id, { fillColor: hex, showFill: true })
                          }
                        />
                        <input
                          type="range"
                          data-testid="drawing-fill-opacity-slider"
                          min={0}
                          max={90}
                          step={2}
                          disabled={!curShowFill}
                          value={Math.round(curFillOpacity * 100)}
                          onChange={(e) =>
                            updateDrawing(drawing.id, {
                              fillOpacity: Number(e.target.value) / 100,
                            })
                          }
                          className="flex-1 accent-[var(--tv-accent)] cursor-pointer"
                        />
                        <span className="w-[38px] text-right font-mono text-[11px] text-[var(--tv-text-secondary)]">
                          {Math.round(curFillOpacity * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pitchfork Variant Selector */}
                {drawing.tool === 'pitchfork' && (
                  <div className="pt-3 border-t border-[var(--tv-border)] flex flex-col gap-2">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                      Pitchfork Geometry Variant
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          ['original', 'Original'],
                          ['schiff', 'Schiff'],
                          ['modified_schiff', 'Mod. Schiff'],
                          ['inside', 'Inside'],
                        ] as Array<[PitchforkVariant, string]>
                      ).map(([variant, lbl]) => (
                        <button
                          key={variant}
                          type="button"
                          onClick={() => updateDrawing(drawing.id, { pitchforkStyle: variant })}
                          className={`h-[28px] rounded-[5px] border text-[11px] cursor-pointer ${
                            (drawing.pitchforkStyle ?? 'original') === variant
                              ? 'bg-[var(--tv-accent)] border-[var(--tv-accent)] text-white font-semibold'
                              : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-secondary)]'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fibonacci / Extension / Fan Custom Levels Grid */}
                {isFibTool && (
                  <div className="pt-3 border-t border-[var(--tv-border)] flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                        Fibonacci Levels ({activeFibLevels.length} active)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateDrawing(drawing.id, { reverseFib: !drawing.reverseFib })
                        }
                        className={`px-2 py-0.5 rounded border text-[10.5px] flex items-center gap-1 cursor-pointer ${
                          drawing.reverseFib
                            ? 'border-[#f59e0b] bg-[#f59e0b]/20 text-[#f59e0b] font-semibold'
                            : 'border-[var(--tv-border)] text-[var(--tv-text-secondary)]'
                        }`}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reverse (0 ↔ 1)</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {allFibCandidates.map((lvl) => {
                        const checked = activeFibLevels.some((v) => Math.abs(v - lvl) < 1e-4);
                        return (
                          <label
                            key={lvl}
                            className={`px-2 py-1 rounded border flex items-center gap-1.5 text-[11px] font-mono cursor-pointer ${
                              checked
                                ? 'border-[var(--tv-accent)]/60 bg-[var(--tv-accent)]/12 text-[var(--tv-text-primary)]'
                                : 'border-[var(--tv-border)] text-[var(--tv-text-muted)]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFibRatio(lvl)}
                              className="accent-[var(--tv-accent)]"
                            />
                            <span>{lvl === 0.705 ? '0.705 OTE' : lvl}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="number"
                        step="0.001"
                        value={customFibInput}
                        onChange={(e) => setCustomFibInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustomFibRatio();
                          }
                        }}
                        placeholder="Add custom ratio (e.g. 0.79 or 1.414)..."
                        className="flex-1 h-[28px] px-2.5 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[11px] font-mono"
                      />
                      <button
                        type="button"
                        onClick={addCustomFibRatio}
                        className="h-[28px] px-3 rounded bg-[var(--tv-accent)] text-white text-[11px] font-medium cursor-pointer"
                      >
                        Add Level
                      </button>
                    </div>
                  </div>
                )}

                {/* Long / Short Position Risk & Bracket Inputs */}
                {isPositionTool && (
                  <div className="pt-3 border-t border-[var(--tv-border)] grid grid-cols-3 gap-2.5">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10.5px] text-[var(--tv-text-muted)]">
                        Dollar Risk ($ USD)
                      </span>
                      <input
                        type="number"
                        min={10}
                        step={50}
                        value={drawing.riskAmountUsd ?? 1500}
                        onChange={(e) =>
                          updateDrawing(drawing.id, {
                            riskAmountUsd: Math.max(10, Number(e.target.value) || 1500),
                          })
                        }
                        className="h-[28px] px-2 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] font-mono"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10.5px] text-[#f23645]">Stop-Loss Price</span>
                      <input
                        type="number"
                        step="any"
                        value={drawing.stopPrice ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v > 0) {
                            updateDrawing(drawing.id, { stopPrice: v });
                          }
                        }}
                        className="h-[28px] px-2 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] font-mono"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10.5px] text-[#089981]">Take-Profit Price</span>
                      <input
                        type="number"
                        step="any"
                        value={drawing.targetPrice ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v > 0) {
                            updateDrawing(drawing.id, { targetPrice: v });
                          }
                        }}
                        className="h-[28px] px-2 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] font-mono"
                      />
                    </label>
                  </div>
                )}
              </>
            )}

            {tab === 'text' && (
              <div className="flex flex-col gap-4">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                  Text &amp; Typography
                </div>

                {/* Text Color, Font Size, Bold, Italic */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-[var(--tv-text-primary)]">
                    Text Formatting
                  </span>
                  <div className="flex items-center gap-2">
                    <SwatchPickerButton
                      testId="modal-text-color-btn"
                      label="Text Color"
                      color={drawing.textColor ?? '#d1d4dc'}
                      onChangeColor={(hex) => updateDrawing(drawing.id, { textColor: hex })}
                    />
                    <select
                      data-testid="modal-text-size-select"
                      value={String(drawing.fontSize ?? 12)}
                      onChange={(e) =>
                        updateDrawing(drawing.id, { fontSize: Number(e.target.value) || 12 })
                      }
                      className="h-[30px] px-2.5 rounded-[6px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] cursor-pointer"
                    >
                      {[10, 11, 12, 14, 16, 18, 20, 24, 28].map((sz) => (
                        <option key={sz} value={sz}>
                          {sz}px
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      data-testid="modal-text-bold-btn"
                      aria-label="Bold text"
                      aria-pressed={drawing.textBold !== false}
                      onClick={() =>
                        updateDrawing(drawing.id, { textBold: drawing.textBold === false })
                      }
                      className={`w-[30px] h-[30px] rounded-[6px] border flex items-center justify-center cursor-pointer ${
                        drawing.textBold !== false
                          ? 'bg-[var(--tv-accent)] border-[var(--tv-accent)] text-white'
                          : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-secondary)]'
                      }`}
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      data-testid="modal-text-italic-btn"
                      aria-label="Italic text"
                      aria-pressed={Boolean(drawing.textItalic)}
                      onClick={() =>
                        updateDrawing(drawing.id, { textItalic: !drawing.textItalic })
                      }
                      className={`w-[30px] h-[30px] rounded-[6px] border flex items-center justify-center cursor-pointer ${
                        drawing.textItalic
                          ? 'bg-[var(--tv-accent)] border-[var(--tv-accent)] text-white'
                          : 'bg-[var(--tv-bg-panel)] border-[var(--tv-border)] text-[var(--tv-text-secondary)]'
                      }`}
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Chart Text Input */}
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] text-[var(--tv-text-secondary)]">
                    Chart Annotation Text
                  </span>
                  <input
                    type="text"
                    data-testid="drawing-label-input"
                    value={drawing.text ?? ''}
                    onChange={(e) => updateDrawing(drawing.id, { text: e.target.value })}
                    placeholder="Enter text displayed on the drawing..."
                    className="h-[34px] px-3 rounded-[6px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] focus:outline-none focus:border-[var(--tv-accent)]"
                  />
                </label>

                {/* Text Alignment */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-[var(--tv-text-secondary)]">
                    Horizontal Alignment
                  </span>
                  <select
                    data-testid="modal-text-align-select"
                    value={drawing.textAlign ?? 'left'}
                    onChange={(e) =>
                      updateDrawing(drawing.id, {
                        textAlign: e.target.value as 'left' | 'center' | 'right',
                      })
                    }
                    className="h-[30px] w-[160px] px-2.5 rounded-[6px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] cursor-pointer"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>

                {/* Text Box Border & Background */}
                {(drawing.tool === 'text' || drawing.tool === 'callout') && (
                  <div className="pt-3 border-t border-[var(--tv-border)] flex flex-col gap-3">
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                      Text Box Appearance
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={curShowBorder}
                          onChange={(e) =>
                            updateDrawing(drawing.id, { showBorder: e.target.checked })
                          }
                          className="accent-[var(--tv-accent)] w-4 h-4 cursor-pointer"
                        />
                        <span>Text Box Border</span>
                      </label>
                      <SwatchPickerButton
                        testId="modal-textbox-border-color-btn"
                        label="Text Box Border Color"
                        color={curBorderColor}
                        disabled={!curShowBorder}
                        onChangeColor={(hex) =>
                          updateDrawing(drawing.id, { borderColor: hex, showBorder: true })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'coordinates' && (
              <div className="flex flex-col gap-2.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                  Exact Anchor Coordinates
                </div>
                <div className="text-[11px] text-[var(--tv-text-muted)]">
                  Fine-tune exact anchor prices and bar timestamps (UTC) for pip-level precision:
                </div>
                {drawing.points.map((pt, idx) => {
                  const isoVal = new Date(pt.time * 1000).toISOString().slice(0, 16);
                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] grid grid-cols-[64px_1fr_1fr] items-center gap-2.5"
                    >
                      <span className="font-mono font-bold text-[var(--tv-accent)]">
                        #{idx + 1}
                      </span>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--tv-text-muted)]">Price</span>
                        <input
                          type="number"
                          step="any"
                          data-testid={`drawing-coord-price-${idx}`}
                          value={pt.price}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            const nextPts = drawing.points.map((p, i) =>
                              i === idx ? { ...p, price: v } : p,
                            );
                            updateDrawing(drawing.id, { points: nextPts });
                          }}
                          className="h-[28px] px-2 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] font-mono text-[12px]"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--tv-text-muted)]">Time (UTC)</span>
                        <input
                          type="datetime-local"
                          value={isoVal}
                          onChange={(e) => {
                            const parsedMs = Date.parse(`${e.target.value}:00Z`);
                            if (!Number.isFinite(parsedMs)) return;
                            const nextPts = drawing.points.map((p, i) =>
                              i === idx ? { ...p, time: Math.floor(parsedMs / 1000) } : p,
                            );
                            updateDrawing(drawing.id, { points: nextPts });
                          }}
                          className="h-[28px] px-2 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] font-mono text-[11px]"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'visibility' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                    Visibility on Intervals
                  </span>
                  <button
                    type="button"
                    onClick={() => updateDrawing(drawing.id, { visibleTimeframes: undefined })}
                    className="text-[11px] text-[var(--tv-accent)] hover:underline cursor-pointer"
                  >
                    Enable All Timeframes
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {ALL_TIMEFRAMES.map((tf) => {
                    const checked = activeVisibleTfs.includes(tf);
                    return (
                      <label
                        key={tf}
                        className={`px-3 py-2 rounded-[6px] border flex items-center gap-2 font-mono text-[12px] cursor-pointer ${
                          checked
                            ? 'border-[var(--tv-accent)]/60 bg-[var(--tv-accent)]/12 text-[var(--tv-text-primary)] font-semibold'
                            : 'border-[var(--tv-border)] bg-[var(--tv-bg-panel)] text-[var(--tv-text-muted)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTimeframeVisibility(tf)}
                          className="accent-[var(--tv-accent)] cursor-pointer"
                        />
                        <span>{tf}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'templates' && (
              <div className="flex flex-col gap-3">
                {/* Save Current Style as Template */}
                <div className="p-3 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] flex flex-col gap-2">
                  <span className="text-[11.5px] font-semibold">
                    Save Current Style as Reusable Template
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      data-testid="drawing-template-name-input"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder={`e.g. My ${drawing.tool} Gold Setup`}
                      className="flex-1 h-[30px] px-2.5 rounded-[6px] bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)]"
                    />
                    <button
                      type="button"
                      data-testid="drawing-save-template-btn"
                      onClick={() => {
                        saveDrawingTemplate(templateName, drawing);
                        setTemplateName('');
                        flashToast('Saved style template!');
                      }}
                      className="h-[30px] px-3 rounded-[6px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Template</span>
                    </button>
                  </div>
                </div>

                {/* Default Tool Style Button */}
                <button
                  type="button"
                  data-testid="drawing-save-default-btn"
                  onClick={() => {
                    setDefaultToolStyle(drawing.tool, {
                      color: drawing.color,
                      lineWidth: drawing.lineWidth ?? 2,
                      lineStyle: drawing.lineStyle ?? 'solid',
                      lineOpacity: drawing.lineOpacity,
                      borderColor: drawing.borderColor ?? drawing.color,
                      borderWidth: drawing.borderWidth ?? drawing.lineWidth ?? 2,
                      borderStyle: drawing.borderStyle ?? drawing.lineStyle ?? 'solid',
                      borderOpacity: drawing.borderOpacity,
                      showBorder: drawing.showBorder,
                      fillColor: drawing.fillColor ?? drawing.color,
                      fillOpacity: drawing.fillOpacity,
                      showFill: drawing.showFill,
                      extendLeft: drawing.extendLeft,
                      extendRight: drawing.extendRight,
                      showMidline: drawing.showMidline,
                      fontSize: drawing.fontSize,
                      textColor: drawing.textColor,
                      textBold: drawing.textBold,
                      textItalic: drawing.textItalic,
                      textAlign: drawing.textAlign,
                      fibLevels: drawing.fibLevels,
                      reverseFib: drawing.reverseFib,
                      pitchforkStyle: drawing.pitchforkStyle,
                      riskAmountUsd: drawing.riskAmountUsd,
                    });
                    flashToast(`Set as default style for new ${drawing.tool} drawings!`);
                  }}
                  className="h-[32px] px-3 rounded-[6px] border border-[#089981]/50 bg-[#089981]/12 hover:bg-[#089981]/22 text-[#089981] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Set Current Appearance as Default for &ldquo;{drawing.tool}&rdquo;</span>
                </button>

                {/* Saved Templates List */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10.5px] text-[var(--tv-text-muted)] uppercase tracking-wider font-semibold">
                    Available Style Templates ({drawingTemplates.length})
                  </span>
                  {drawingTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="px-3 py-2 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
                          style={{ backgroundColor: tpl.borderColor ?? tpl.color }}
                        />
                        <span className="font-medium truncate">{tpl.name}</span>
                        <span className="text-[10px] text-[var(--tv-text-muted)] font-mono">
                          {tpl.lineWidth}px · {tpl.borderStyle ?? tpl.lineStyle}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          data-testid={`apply-drawing-tpl-${tpl.id}`}
                          onClick={() => {
                            applyDrawingTemplate(drawing.id, tpl.id);
                            flashToast(`Applied "${tpl.name}"`);
                          }}
                          className="px-2.5 py-1 rounded bg-[var(--tv-accent)]/15 hover:bg-[var(--tv-accent)]/25 text-[var(--tv-accent)] text-[11px] font-semibold cursor-pointer"
                        >
                          Apply
                        </button>
                        {!tpl.id.startsWith('tpl-ict-') &&
                          !tpl.id.startsWith('tpl-gold-') &&
                          !tpl.id.startsWith('tpl-liquidity-') &&
                          !tpl.id.startsWith('tpl-dotted-') &&
                          !tpl.id.startsWith('tpl-clean-') && (
                            <button
                              type="button"
                              aria-label={`Delete template ${tpl.name}`}
                              onClick={() => deleteDrawingTemplate(tpl.id)}
                              className="p-1 rounded text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {savedToast && (
              <div className="px-3 py-1.5 rounded-[6px] border border-[#089981]/50 bg-[#089981]/15 text-[#089981] text-[11px] font-semibold text-center">
                {savedToast}
              </div>
            )}
          </div>
        </div>

        {/* TradingView Exact Modal Footer: Template ⌄ | Cancel | Ok */}
        <div className="px-5 py-3 border-t border-[var(--tv-border)] bg-[var(--tv-bg-panel)] flex items-center justify-between gap-3">
          <div ref={footerTplRef} className="relative">
            <button
              type="button"
              data-testid="drawing-settings-template-btn"
              onClick={() => setFooterTplOpen((o) => !o)}
              className="h-[32px] px-3 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <span>Template</span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--tv-text-muted)]" />
            </button>

            {footerTplOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 z-50 w-[236px] py-1.5 rounded-[8px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl text-[11.5px]">
                <button
                  type="button"
                  onClick={() => {
                    setFooterTplOpen(false);
                    setTab('templates');
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--tv-bg-hover)] font-medium cursor-pointer"
                >
                  Save Drawing Template As...
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDrawing(drawing.id, {
                      color: '#2962ff',
                      lineWidth: 2,
                      lineStyle: 'solid',
                      lineOpacity: 1,
                      borderColor: '#2962ff',
                      borderWidth: 2,
                      borderStyle: 'solid',
                      showBorder: true,
                      fillColor: '#2962ff',
                      fillOpacity: 0.14,
                      showFill: true,
                    });
                    setFooterTplOpen(false);
                    flashToast('Restored factory defaults');
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-secondary)] cursor-pointer"
                >
                  Apply Default Drawing Template
                </button>
                <div className="my-1 border-t border-[var(--tv-border)]" />
                {drawingTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      applyDrawingTemplate(drawing.id, tpl.id);
                      setFooterTplOpen(false);
                      flashToast(`Applied "${tpl.name}"`);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--tv-bg-hover)] text-left cursor-pointer"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tpl.borderColor ?? tpl.color }}
                    />
                    <span className="truncate">{tpl.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="drawing-settings-cancel-btn"
              onClick={handleCancelRevert}
              className="h-[32px] px-4 rounded-[6px] border border-[var(--tv-border)] bg-transparent hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="drawing-settings-done-btn"
              onClick={handleCommitOk}
              className="h-[32px] px-5 rounded-[6px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white font-semibold cursor-pointer"
            >
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
