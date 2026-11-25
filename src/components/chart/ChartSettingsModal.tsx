import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlarmClock,
  Calendar,
  CandlestickChart,
  Check,
  ChevronDown,
  PenLine,
  Plug,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  useChartAppearanceStore,
  type CanvasBackgroundType,
  type ChartAppearanceSettings,
  type CrosshairLineWidth,
  type GridDisplayMode,
  type LineDashStyle,
  type PrecisionOverride,
  type ScalesFontSize,
  type SymbolTitleMode,
} from '../../state/chartAppearanceStore';
import { useWorkspaceStore, type ThemeMode } from '../../state/workspaceStore';

type SettingsTabId =
  | 'symbol'
  | 'status_line'
  | 'scales'
  | 'canvas'
  | 'trading'
  | 'alerts'
  | 'events';

const TV_SWATCH_PALETTE: readonly string[] = [
  // Row 1: TradingView 10-column Monochrome Ramp (REA ev_71a8b9a1...)
  '#ffffff',
  '#e0e3eb',
  '#d1d4dc',
  '#b8b8b8',
  '#9c9c9c',
  '#808080',
  '#636363',
  '#434651',
  '#131722',
  '#000000',
  // Row 2: TradingView 10-column Core Vivid Row
  '#f23645',
  '#ff9800',
  '#ffeb3b',
  '#4caf50',
  '#089981',
  '#00bcd4',
  '#2962ff',
  '#673ab7',
  '#9c27b0',
  '#e91e63',
  // Row 3: Soft Tints 1
  '#fccbcd',
  '#ffe0b2',
  '#fff9c4',
  '#c8e6c9',
  '#ace5dc',
  '#b2ebf2',
  '#bbd9fb',
  '#d1c4e9',
  '#e1bee7',
  '#f8bbd0',
  // Row 4: Soft Tints 2
  '#faa1a4',
  '#ffcc80',
  '#fff59d',
  '#a5d6a7',
  '#70ccbd',
  '#80deea',
  '#90bff9',
  '#b39ddb',
  '#ce93d8',
  '#f48fb1',
  // Row 5: Mid Tones 1
  '#f77c80',
  '#ffb74d',
  '#fff176',
  '#81c784',
  '#42bda8',
  '#4dd0e1',
  '#5b9cf6',
  '#9575cd',
  '#ba68c8',
  '#f06292',
  // Row 6: Mid Tones 2
  '#f7525f',
  '#ffa726',
  '#ffee58',
  '#66bb6a',
  '#22ab94',
  '#26c6da',
  '#3179f5',
  '#7e57c2',
  '#ab47bc',
  '#ec407a',
  // Row 7: Rich Institutional Shades
  '#b22833',
  '#f57c00',
  '#fbc02d',
  '#388e3c',
  '#056656',
  '#0097a7',
  '#1848cc',
  '#512da8',
  '#7b1fa2',
  '#c2185b',
  // Row 8: Deep Institutional Shades
  '#801922',
  '#e65100',
  '#f57f17',
  '#1b5e20',
  '#00332a',
  '#006064',
  '#0c3299',
  '#311b92',
  '#4a148c',
  '#880e4f',
];

const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: '(UTC-5) New York' },
  { value: 'America/Chicago', label: '(UTC-6) Chicago' },
  { value: 'America/Los_Angeles', label: '(UTC-8) Los Angeles' },
  { value: 'Europe/London', label: '(UTC+0) London' },
  { value: 'Europe/Berlin', label: '(UTC+1) Frankfurt' },
  { value: 'Asia/Dubai', label: '(UTC+4) Dubai' },
  { value: 'Asia/Kolkata', label: '(UTC+5:30) Kolkata' },
  { value: 'Asia/Singapore', label: '(UTC+8) Singapore' },
  { value: 'Asia/Tokyo', label: '(UTC+9) Tokyo' },
  { value: 'Australia/Sydney', label: '(UTC+10) Sydney' },
];

const PRECISION_OPTIONS: ReadonlyArray<{ value: PrecisionOverride; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: '0', label: '1' },
  { value: '1', label: '1/10' },
  { value: '2', label: '1/100' },
  { value: '3', label: '1/1000' },
  { value: '4', label: '1/10000' },
  { value: '5', label: '1/100000' },
];

function parseColorToHexAndOpacity(raw: string): { hex: string; opacityPct: number } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return { hex: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(), opacityPct: 100 };
    }
    if (trimmed.length >= 7) {
      return { hex: trimmed.slice(0, 7).toLowerCase(), opacityPct: 100 };
    }
  }
  const rgbaMatch = trimmed.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgbaMatch) {
    const r = Math.min(255, Math.max(0, Number(rgbaMatch[1])));
    const g = Math.min(255, Math.max(0, Number(rgbaMatch[2])));
    const b = Math.min(255, Math.max(0, Number(rgbaMatch[3])));
    const a = rgbaMatch[4] !== undefined ? Math.min(1, Math.max(0, Number(rgbaMatch[4]))) : 1;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return {
      hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase(),
      opacityPct: Math.round(a * 100),
    };
  }
  return { hex: '#089981', opacityPct: 100 };
}

function combineHexAndOpacity(hex: string, opacityPct: number): string {
  const cleanHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : '#089981';
  if (opacityPct >= 100) return cleanHex;
  const r = parseInt(cleanHex.slice(1, 3), 16);
  const g = parseInt(cleanHex.slice(3, 5), 16);
  const b = parseInt(cleanHex.slice(5, 7), 16);
  const alpha = Number((Math.max(0, Math.min(100, opacityPct)) / 100).toFixed(2));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function StatusLineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2.5" y="3" width="13" height="3.2" rx="1" />
      <line x1="2.5" y1="9.5" x2="11.5" y2="9.5" />
      <line x1="2.5" y1="13" x2="9.5" y2="13" />
    </svg>
  );
}

function ScalesLinesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4.5 14V3.5" />
      <path d="M2.5 5.5L4.5 3.5L6.5 5.5" />
      <path d="M4.5 14H15" />
      <path d="M13 12L15 14L13 16" />
    </svg>
  );
}

const SETTINGS_TABS: ReadonlyArray<{
  id: SettingsTabId;
  label: string;
  testId: string;
  renderIcon: (cls: string) => ReactNode;
}> = [
  {
    id: 'symbol',
    label: 'Symbol',
    testId: 'settings-tab-symbol',
    renderIcon: (cls) => <CandlestickChart className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'status_line',
    label: 'Status line',
    testId: 'settings-tab-status_line',
    renderIcon: (cls) => <StatusLineIcon className={cls} />,
  },
  {
    id: 'scales',
    label: 'Scales and lines',
    testId: 'settings-tab-scales',
    renderIcon: (cls) => <ScalesLinesIcon className={cls} />,
  },
  {
    id: 'canvas',
    label: 'Canvas',
    testId: 'settings-tab-canvas',
    renderIcon: (cls) => <PenLine className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'trading',
    label: 'Trading',
    testId: 'settings-tab-trading',
    renderIcon: (cls) => <TrendingUp className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'alerts',
    label: 'Alerts',
    testId: 'settings-tab-alerts',
    renderIcon: (cls) => <AlarmClock className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'events',
    label: 'Events',
    testId: 'settings-tab-events',
    renderIcon: (cls) => <Calendar className={cls} strokeWidth={1.65} />,
  },
];

interface TvCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  testId?: string;
}

function TvCheckbox({ checked, onChange, label, testId }: TvCheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none group">
      <span className="relative inline-flex items-center justify-center w-[18px] h-[18px] shrink-0">
        <input
          type="checkbox"
          data-testid={testId}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0 z-10"
        />
        <span
          className={`w-[18px] h-[18px] rounded-[4px] border flex items-center justify-center transition-colors ${
            checked
              ? 'bg-[#131722] border-[#131722] text-white dark:bg-[#2962ff] dark:border-[#2962ff]'
              : 'bg-transparent border-[#b2b5be] dark:border-[#50535e] group-hover:border-[var(--tv-text-primary)]'
          }`}
        >
          {checked && <Check className="w-3.5 h-3.5 stroke-[2.75]" />}
        </span>
      </span>
      <span className="text-[13.5px] text-[var(--tv-text-primary)] leading-snug">{label}</span>
    </label>
  );
}

interface ColorSwatchButtonProps {
  color: string;
  onChange: (nextColor: string) => void;
  ariaLabel: string;
  testId?: string;
  disabled?: boolean;
}

function ColorSwatchButton({
  color,
  onChange,
  ariaLabel,
  testId,
  disabled,
}: ColorSwatchButtonProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const parsed = parseColorToHexAndOpacity(color);
  const [hexDraft, setHexDraft] = useState(parsed.hex);

  useEffect(() => {
    setHexDraft(parseColorToHexAndOpacity(color).hex);
  }, [color]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        btnRef.current &&
        !btnRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const togglePopover = () => {
    if (disabled) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const popWidth = 282;
      const popHeight = 336;
      const left = Math.max(
        12,
        Math.min(window.innerWidth - popWidth - 12, rect.left),
      );
      const top =
        rect.bottom + popHeight + 12 <= window.innerHeight
          ? rect.bottom + 6
          : Math.max(12, rect.top - popHeight - 6);
      setCoords({ top, left });
    }
    setOpen((prev) => !prev);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-name="color-select"
        data-testid={testId}
        aria-label={ariaLabel}
        title={`${ariaLabel}: ${color}`}
        disabled={disabled}
        onClick={togglePopover}
        className={`w-[34px] h-[34px] p-[4px] rounded-[6px] border transition-colors flex items-center justify-center shrink-0 cursor-pointer ${
          open
            ? 'border-[#2962ff] ring-2 ring-[#2962ff]/25'
            : 'border-[#d1d4dc] dark:border-[#363a45] hover:border-[#787b86]'
        } bg-[var(--tv-bg-panel)] ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      >
        <span
          className="w-full h-full rounded-[3px] border border-black/10 dark:border-white/10"
          style={{ backgroundColor: color }}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          data-testid="tv-color-popover"
          style={{ top: coords.top, left: coords.left }}
          className="fixed z-[80] w-[282px] p-3 rounded-[8px] border border-[var(--tv-border)] bg-[#ffffff] dark:bg-[#1e222d] shadow-[0_12px_36px_rgba(0,0,0,0.45)] flex flex-col gap-3"
        >
          {/* 80-Swatch 8x10 TradingView Grid (REA ev_71a8b9a1...) */}
          <div className="grid grid-cols-10 gap-1.5">
            {TV_SWATCH_PALETTE.map((swatchHex) => {
              const isSelected = parsed.hex.toLowerCase() === swatchHex.toLowerCase();
              return (
                <button
                  key={swatchHex}
                  type="button"
                  data-role="swatch"
                  data-testid={`color-swatch-${swatchHex.slice(1)}`}
                  aria-label={`Select color ${swatchHex}`}
                  onClick={() => {
                    onChange(combineHexAndOpacity(swatchHex, parsed.opacityPct));
                  }}
                  className={`w-[20px] h-[20px] rounded-[4px] border transition-transform hover:scale-110 cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-[#2962ff] ring-offset-1 ring-offset-[var(--tv-bg-elevated)] border-white/60'
                      : 'border-black/15 dark:border-white/10'
                  }`}
                  style={{ backgroundColor: swatchHex }}
                />
              );
            })}
          </div>

          <div className="h-[1px] bg-[var(--tv-border)]" />

          {/* Opacity Gradient Slider (TradingView checkerboard + linear-gradient) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-[var(--tv-text-muted)]">
              <span>Opacity</span>
              <span className="tabular-nums font-medium text-[var(--tv-text-primary)]">
                {parsed.opacityPct}%
              </span>
            </div>
            <div
              className="relative h-2.5 rounded-full overflow-hidden border border-black/15 dark:border-white/15"
              style={{
                backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${parsed.hex} 100%), repeating-conic-gradient(#d1d4dc 0% 25%, #ffffff 0% 50%)`,
                backgroundSize: '100% 100%, 8px 8px',
              }}
            >
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                aria-label="Color opacity"
                data-testid="color-opacity-slider"
                value={parsed.opacityPct}
                onChange={(e) => {
                  const nextOpacity = Number(e.target.value);
                  onChange(combineHexAndOpacity(parsed.hex, nextOpacity));
                }}
                className="w-full h-full opacity-0 cursor-pointer"
              />
              <span
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-[#131722] shadow"
                style={{ left: `${parsed.opacityPct}%` }}
              />
            </div>
          </div>

          {/* Custom Hex Input + Native Color Picker */}
          <div className="flex items-center gap-2">
            <label
              title="Add custom color"
              className="relative w-7 h-7 rounded-[5px] border border-[var(--tv-border)] flex items-center justify-center hover:bg-[var(--tv-bg-hover)] cursor-pointer shrink-0 overflow-hidden"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--tv-text-secondary)] pointer-events-none" />
              <input
                type="color"
                data-testid="color-native-picker"
                aria-label="Custom color picker"
                value={parsed.hex}
                onChange={(e) => {
                  onChange(combineHexAndOpacity(e.target.value, parsed.opacityPct));
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>
            <input
              type="text"
              data-testid="color-custom-hex-input"
              aria-label="Custom hex color"
              value={hexDraft}
              onChange={(e) => {
                const v = e.target.value;
                setHexDraft(v);
                if (/^#[0-9a-fA-F]{6}$/.test(v.trim())) {
                  onChange(combineHexAndOpacity(v.trim(), parsed.opacityPct));
                }
              }}
              placeholder="#089981"
              className="flex-1 h-7 px-2 rounded-[5px] border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] text-[12px] font-mono text-[var(--tv-text-primary)] focus:outline-none focus:border-[#2962ff]"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 px-2.5 rounded-[5px] bg-[var(--tv-bg-hover)] text-[11px] font-medium text-[var(--tv-text-primary)] hover:opacity-90 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function TvSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  testId,
  widthClass = 'w-[195px]',
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  ariaLabel: string;
  testId?: string;
  widthClass?: string;
}) {
  return (
    <div className={`relative ${widthClass}`}>
      <select
        data-testid={testId}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full h-[34px] pl-3 pr-8 rounded-[6px] border border-[#d1d4dc] dark:border-[#363a45] hover:border-[#787b86] bg-[var(--tv-bg-panel)] text-[13px] text-[var(--tv-text-primary)] appearance-none focus:outline-none focus:border-[#2962ff] cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tv-text-muted)]" />
    </div>
  );
}

interface WorkspaceSnapshot {
  theme: ThemeMode;
  showGrid: boolean;
  showBidAskPill: boolean;
  magnetMode: boolean;
  autoScale: boolean;
  timezone: string;
}

export function ChartSettingsModal() {
  const appearance = useChartAppearanceStore();
  const updateAppearance = useChartAppearanceStore((s) => s.updateAppearance);
  const chartTemplates = useChartAppearanceStore((s) => s.chartTemplates);
  const applyChartTemplate = useChartAppearanceStore((s) => s.applyChartTemplate);
  const saveCustomChartTemplate = useChartAppearanceStore((s) => s.saveCustomChartTemplate);
  const deleteCustomChartTemplate = useChartAppearanceStore(
    (s) => s.deleteCustomChartTemplate,
  );
  const getSnapshot = useChartAppearanceStore((s) => s.getSnapshot);
  const restoreSnapshot = useChartAppearanceStore((s) => s.restoreSnapshot);

  const theme = useWorkspaceStore((s) => s.theme);
  const showGrid = useWorkspaceStore((s) => s.showGrid);
  const showBidAskPill = useWorkspaceStore((s) => s.showBidAskPill);
  const magnetMode = useWorkspaceStore((s) => s.magnetMode);
  const autoScale = useWorkspaceStore((s) => s.autoScale);

  const setTheme = useWorkspaceStore((s) => s.setTheme);
  const setShowGrid = useWorkspaceStore((s) => s.setShowGrid);
  const setShowBidAskPill = useWorkspaceStore((s) => s.setShowBidAskPill);
  const toggleMagnetMode = useWorkspaceStore((s) => s.toggleMagnetMode);
  const setAutoScale = useWorkspaceStore((s) => s.setAutoScale);
  const setTimezone = useWorkspaceStore((s) => s.setTimezone);
  const setChartSettingsOpen = useWorkspaceStore((s) => s.setChartSettingsOpen);
  const openConnectionsModal = useWorkspaceStore((s) => s.openConnectionsModal);

  const [activeTab, setActiveTab] = useState<SettingsTabId>('symbol');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const templateMenuRef = useRef<HTMLDivElement>(null);

  // Capture pre-open snapshot on mount so Cancel deterministically reverts live preview edits
  const initialSnapshotRef = useRef<{
    appearance: ChartAppearanceSettings;
    workspace: WorkspaceSnapshot;
  } | null>(null);

  if (initialSnapshotRef.current === null) {
    const ws = useWorkspaceStore.getState();
    initialSnapshotRef.current = {
      appearance: getSnapshot(),
      workspace: {
        theme: ws.theme,
        showGrid: ws.showGrid,
        showBidAskPill: ws.showBidAskPill,
        magnetMode: ws.magnetMode,
        autoScale: ws.autoScale,
        timezone: ws.timezone,
      },
    };
  }

  useEffect(() => {
    if (!templateMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        templateMenuRef.current &&
        !templateMenuRef.current.contains(e.target as Node)
      ) {
        setTemplateMenuOpen(false);
        setSavePromptOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [templateMenuOpen]);

  const handleCancel = () => {
    const snap = initialSnapshotRef.current;
    if (snap) {
      if (useWorkspaceStore.getState().theme !== snap.workspace.theme) {
        setTheme(snap.workspace.theme);
      }
      restoreSnapshot(snap.appearance);
      setShowGrid(snap.workspace.showGrid);
      setShowBidAskPill(snap.workspace.showBidAskPill);
      setAutoScale(snap.workspace.autoScale);
      setTimezone(snap.workspace.timezone);
      if (useWorkspaceStore.getState().magnetMode !== snap.workspace.magnetMode) {
        toggleMagnetMode();
      }
    }
    setChartSettingsOpen(false);
  };

  const handleOk = () => {
    setChartSettingsOpen(false);
  };

  const handleSaveCustomTemplate = () => {
    const created = saveCustomChartTemplate(newTemplateName);
    if (created) {
      setNewTemplateName('');
      setSavePromptOpen(false);
      setTemplateMenuOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      onClick={handleOk}
    >
      <div
        data-name="series-properties-dialog"
        data-testid="chart-settings-modal"
        role="dialog"
        aria-label="Chart settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[680px] h-[545px] max-h-[88vh] rounded-[12px] border border-[var(--tv-border)] bg-[#ffffff] dark:bg-[#1e222d] shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
      >
        {/* Modal Header (1:1 TradingView Settings Header) */}
        <div className="px-6 pt-5 pb-3.5 border-b border-[var(--tv-border-subtle)] flex items-center justify-between shrink-0">
          <h2 className="text-[19px] font-bold tracking-tight text-[var(--tv-text-primary)] m-0">
            Settings
          </h2>
          <button
            type="button"
            aria-label="Close chart settings"
            onClick={handleOk}
            className="w-8 h-8 rounded-[6px] flex items-center justify-center text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Center Body: Left 7-Tab Rail + Right Controls */}
        <div className="flex-1 min-h-0 flex">
          {/* Left Navigation Rail */}
          <nav
            aria-label="Chart settings categories"
            className="w-[185px] shrink-0 px-2.5 py-3 border-r border-[var(--tv-border-subtle)] flex flex-col gap-0.5 overflow-y-auto"
          >
            {SETTINGS_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={tab.testId}
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full h-[38px] px-3 rounded-[8px] flex items-center gap-3 text-[13.5px] transition-colors cursor-pointer text-left ${
                    isActive
                      ? 'bg-[#f0f3fa] text-[#131722] dark:bg-[#2a2e39] dark:text-[#ffffff] font-semibold'
                      : 'text-[var(--tv-text-primary)] hover:bg-[#f0f3fa]/60 dark:hover:bg-[#2a2e39]/50 font-normal'
                  }`}
                >
                  {tab.renderIcon('w-[18px] h-[18px] shrink-0')}
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Settings Content */}
          <div className="flex-1 min-w-0 px-7 py-4 overflow-y-auto">
            {activeTab === 'symbol' && (
              <div data-testid="settings-panel-symbol" className="flex flex-col gap-5">
                {/* CANDLES Section */}
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    CANDLES
                  </div>

                  <div className="flex flex-col gap-3.5">
                    <TvCheckbox
                      testId="settings-prev-close-checkbox"
                      checked={appearance.colorBasedOnPrevClose}
                      onChange={(checked) =>
                        updateAppearance({ colorBasedOnPrevClose: checked })
                      }
                      label="Color bars based on previous close"
                    />

                    {/* Body Row */}
                    <div className="flex items-center">
                      <div className="w-[115px] shrink-0">
                        <TvCheckbox
                          testId="settings-body-visible-checkbox"
                          checked={appearance.bodyVisible}
                          onChange={(checked) => updateAppearance({ bodyVisible: checked })}
                          label="Body"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <ColorSwatchButton
                          testId="swatch-body-up"
                          ariaLabel="Body up color"
                          color={appearance.bodyUpColor}
                          disabled={!appearance.bodyVisible}
                          onChange={(c) => updateAppearance({ bodyUpColor: c })}
                        />
                        <ColorSwatchButton
                          testId="swatch-body-down"
                          ariaLabel="Body down color"
                          color={appearance.bodyDownColor}
                          disabled={!appearance.bodyVisible}
                          onChange={(c) => updateAppearance({ bodyDownColor: c })}
                        />
                      </div>
                    </div>

                    {/* Borders Row */}
                    <div className="flex items-center">
                      <div className="w-[115px] shrink-0">
                        <TvCheckbox
                          testId="settings-borders-visible-checkbox"
                          checked={appearance.bordersVisible}
                          onChange={(checked) =>
                            updateAppearance({ bordersVisible: checked })
                          }
                          label="Borders"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <ColorSwatchButton
                          testId="swatch-border-up"
                          ariaLabel="Borders up color"
                          color={appearance.borderUpColor}
                          disabled={!appearance.bordersVisible}
                          onChange={(c) => updateAppearance({ borderUpColor: c })}
                        />
                        <ColorSwatchButton
                          testId="swatch-border-down"
                          ariaLabel="Borders down color"
                          color={appearance.borderDownColor}
                          disabled={!appearance.bordersVisible}
                          onChange={(c) => updateAppearance({ borderDownColor: c })}
                        />
                      </div>
                    </div>

                    {/* Wick Row */}
                    <div className="flex items-center">
                      <div className="w-[115px] shrink-0">
                        <TvCheckbox
                          testId="settings-wick-visible-checkbox"
                          checked={appearance.wickVisible}
                          onChange={(checked) => updateAppearance({ wickVisible: checked })}
                          label="Wick"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <ColorSwatchButton
                          testId="swatch-wick-up"
                          ariaLabel="Wick up color"
                          color={appearance.wickUpColor}
                          disabled={!appearance.wickVisible}
                          onChange={(c) => updateAppearance({ wickUpColor: c })}
                        />
                        <ColorSwatchButton
                          testId="swatch-wick-down"
                          ariaLabel="Wick down color"
                          color={appearance.wickDownColor}
                          disabled={!appearance.wickVisible}
                          onChange={(c) => updateAppearance({ wickDownColor: c })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* DATA MODIFICATION Section */}
                <div className="pt-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    DATA MODIFICATION
                  </div>

                  <div className="flex flex-col gap-3.5">
                    <div className="flex items-center">
                      <span className="w-[115px] shrink-0 text-[13.5px] text-[var(--tv-text-primary)]">
                        Precision
                      </span>
                      <TvSelect
                        testId="settings-precision-select"
                        ariaLabel="Precision"
                        value={appearance.precisionOverride}
                        options={PRECISION_OPTIONS}
                        onChange={(val) => updateAppearance({ precisionOverride: val })}
                      />
                    </div>

                    <div className="flex items-center">
                      <span className="w-[115px] shrink-0 text-[13.5px] text-[var(--tv-text-primary)]">
                        Timezone
                      </span>
                      <TvSelect
                        testId="settings-timezone-select"
                        ariaLabel="Timezone"
                        value={appearance.timezone}
                        options={TIMEZONE_OPTIONS}
                        onChange={(val) => updateAppearance({ timezone: val })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'status_line' && (
              <div data-testid="settings-panel-status_line" className="flex flex-col gap-5">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    SYMBOL
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <TvCheckbox
                        testId="settings-show-symbol-title"
                        checked={appearance.showSymbolTitle}
                        onChange={(checked) =>
                          updateAppearance({ showSymbolTitle: checked })
                        }
                        label="Title"
                      />
                      <TvSelect<SymbolTitleMode>
                        testId="settings-symbol-title-mode"
                        ariaLabel="Symbol title mode"
                        value={appearance.symbolTitleMode}
                        widthClass="w-[195px]"
                        options={[
                          {
                            value: 'ticker_and_description',
                            label: 'Ticker and description',
                          },
                          { value: 'ticker', label: 'Ticker' },
                          { value: 'description', label: 'Description' },
                        ]}
                        onChange={(val) => updateAppearance({ symbolTitleMode: val })}
                      />
                    </div>

                    <TvCheckbox
                      testId="settings-show-market-status"
                      checked={appearance.showOpenMarketStatus}
                      onChange={(checked) =>
                        updateAppearance({ showOpenMarketStatus: checked })
                      }
                      label="Open market status"
                    />

                    <TvCheckbox
                      testId="settings-show-ohlc"
                      checked={appearance.showOhlcValues}
                      onChange={(checked) => updateAppearance({ showOhlcValues: checked })}
                      label="OHLC values"
                    />

                    <TvCheckbox
                      testId="settings-show-bar-change"
                      checked={appearance.showBarChangeValues}
                      onChange={(checked) =>
                        updateAppearance({ showBarChangeValues: checked })
                      }
                      label="Bar change values"
                    />

                    <TvCheckbox
                      testId="settings-show-volume-legend"
                      checked={appearance.showVolumeLegend}
                      onChange={(checked) =>
                        updateAppearance({ showVolumeLegend: checked })
                      }
                      label="Volume"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--tv-border-subtle)]">
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    INDICATORS
                  </div>
                  <div className="flex flex-col gap-3">
                    <TvCheckbox
                      testId="settings-show-ind-titles"
                      checked={appearance.showIndicatorTitles}
                      onChange={(checked) =>
                        updateAppearance({ showIndicatorTitles: checked })
                      }
                      label="Titles"
                    />
                    <TvCheckbox
                      testId="settings-show-ind-args"
                      checked={appearance.showIndicatorArguments}
                      onChange={(checked) =>
                        updateAppearance({ showIndicatorArguments: checked })
                      }
                      label="Arguments"
                    />
                    <TvCheckbox
                      testId="settings-show-ind-values"
                      checked={appearance.showIndicatorValues}
                      onChange={(checked) =>
                        updateAppearance({ showIndicatorValues: checked })
                      }
                      label="Values"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'scales' && (
              <div data-testid="settings-panel-scales" className="flex flex-col gap-5">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    PRICE SCALE &amp; LABELS
                  </div>
                  <div className="flex flex-col gap-3">
                    <TvCheckbox
                      testId="settings-show-last-price-label"
                      checked={appearance.showLastPriceLabel}
                      onChange={(checked) =>
                        updateAppearance({ showLastPriceLabel: checked })
                      }
                      label="Symbol last price label"
                    />

                    <div className="flex items-center justify-between gap-3">
                      <TvCheckbox
                        testId="settings-show-last-price-line"
                        checked={appearance.showLastPriceLine}
                        onChange={(checked) =>
                          updateAppearance({ showLastPriceLine: checked })
                        }
                        label="Symbol last price line"
                      />
                      <TvSelect<LineDashStyle>
                        testId="settings-last-price-line-style"
                        ariaLabel="Last price line style"
                        value={appearance.lastPriceLineStyle}
                        widthClass="w-[140px]"
                        options={[
                          { value: 'solid', label: 'Line' },
                          { value: 'dashed', label: 'Dashed line' },
                          { value: 'dotted', label: 'Dotted line' },
                        ]}
                        onChange={(val) => updateAppearance({ lastPriceLineStyle: val })}
                      />
                    </div>

                    <TvCheckbox
                      testId="settings-show-high-low-lines"
                      checked={appearance.showHighLowLines}
                      onChange={(checked) =>
                        updateAppearance({ showHighLowLines: checked })
                      }
                      label="High and low price lines"
                    />

                    <TvCheckbox
                      testId="settings-show-countdown"
                      checked={appearance.showCountdownToBarClose}
                      onChange={(checked) =>
                        updateAppearance({ showCountdownToBarClose: checked })
                      }
                      label="Countdown to bar close"
                    />

                    <TvCheckbox
                      testId="settings-auto-scale"
                      checked={autoScale}
                      onChange={(checked) => setAutoScale(checked)}
                      label="Auto-fit price scale to screen"
                    />

                    <TvCheckbox
                      testId="settings-lock-ratio"
                      checked={appearance.lockPriceToBarRatio}
                      onChange={(checked) =>
                        updateAppearance({ lockPriceToBarRatio: checked })
                      }
                      label="Lock price to bar ratio"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--tv-border-subtle)]">
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    CROSSHAIR
                  </div>
                  <div className="flex flex-col gap-3.5">
                    <div className="flex items-center gap-3">
                      <span className="w-[115px] shrink-0 text-[13.5px] text-[var(--tv-text-primary)]">
                        Crosshair
                      </span>
                      <ColorSwatchButton
                        testId="swatch-crosshair-color"
                        ariaLabel="Crosshair color"
                        color={appearance.crosshairColor}
                        onChange={(c) => updateAppearance({ crosshairColor: c })}
                      />
                      <TvSelect<LineDashStyle>
                        testId="settings-crosshair-style"
                        ariaLabel="Crosshair style"
                        value={appearance.crosshairStyle}
                        widthClass="w-[125px]"
                        options={[
                          { value: 'solid', label: 'Solid' },
                          { value: 'dashed', label: 'Dashed' },
                          { value: 'dotted', label: 'Dotted' },
                        ]}
                        onChange={(val) => updateAppearance({ crosshairStyle: val })}
                      />
                      <TvSelect<`${CrosshairLineWidth}`>
                        testId="settings-crosshair-width"
                        ariaLabel="Crosshair width"
                        value={String(appearance.crosshairWidth) as `${CrosshairLineWidth}`}
                        widthClass="w-[74px]"
                        options={[
                          { value: '1', label: '1px' },
                          { value: '2', label: '2px' },
                          { value: '3', label: '3px' },
                        ]}
                        onChange={(val) =>
                          updateAppearance({
                            crosshairWidth: Number(val) as CrosshairLineWidth,
                          })
                        }
                      />
                    </div>

                    <TvCheckbox
                      testId="settings-magnet-mode"
                      checked={magnetMode}
                      onChange={() => toggleMagnetMode()}
                      label="OHLC Magnet snap"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'canvas' && (
              <div data-testid="settings-panel-canvas" className="flex flex-col gap-5">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    CHART BASIC STYLES
                  </div>

                  <div className="flex flex-col gap-3.5">
                    {/* Workspace Shell Theme */}
                    <div className="flex items-center">
                      <span className="w-[120px] shrink-0 text-[13.5px] text-[var(--tv-text-primary)]">
                        App Theme
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setTheme('dark')}
                          className={`h-[32px] px-3.5 rounded-[6px] border text-[12.5px] cursor-pointer ${
                            theme === 'dark'
                              ? 'border-[#2962ff] text-[#2962ff] bg-[#2962ff]/10 font-semibold'
                              : 'border-[var(--tv-border)] text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)]'
                          }`}
                        >
                          Dark
                        </button>
                        <button
                          type="button"
                          onClick={() => setTheme('light')}
                          className={`h-[32px] px-3.5 rounded-[6px] border text-[12.5px] cursor-pointer ${
                            theme === 'light'
                              ? 'border-[#2962ff] text-[#2962ff] bg-[#2962ff]/10 font-semibold'
                              : 'border-[var(--tv-border)] text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)]'
                          }`}
                        >
                          Light
                        </button>
                      </div>
                    </div>

                    {/* Background */}
                    <div className="flex items-center gap-2.5">
                      <span className="w-[120px] shrink-0 text-[13.5px] text-[var(--tv-text-primary)]">
                        Background
                      </span>
                      <TvSelect<CanvasBackgroundType>
                        testId="settings-bg-type"
                        ariaLabel="Canvas background type"
                        value={appearance.backgroundType}
                        widthClass="w-[135px]"
                        options={[
                          { value: 'solid', label: 'Solid' },
                          { value: 'gradient', label: 'Gradient' },
                        ]}
                        onChange={(val) => updateAppearance({ backgroundType: val })}
                      />
                      <ColorSwatchButton
                        testId="swatch-canvas-bg"
                        ariaLabel="Canvas background color"
                        color={appearance.backgroundColor}
                        onChange={(c) => updateAppearance({ backgroundColor: c })}
                      />
                      {appearance.backgroundType === 'gradient' && (
                        <ColorSwatchButton
                          testId="swatch-canvas-bg-end"
                          ariaLabel="Canvas gradient bottom color"
                          color={appearance.backgroundGradientEnd}
                          onChange={(c) => updateAppearance({ backgroundGradientEnd: c })}
                        />
                      )}
                    </div>

                    {/* Grid Lines */}
                    <div className="flex items-center gap-2.5">
                      <span className="w-[120px] shrink-0 text-[13.5px] text-[var(--tv-text-primary)]">
                        Grid lines
                      </span>
                      <TvSelect<GridDisplayMode>
                        testId="settings-grid-mode"
                        ariaLabel="Grid lines display mode"
                        value={showGrid ? appearance.gridMode : 'none'}
                        widthClass="w-[135px]"
                        options={[
                          { value: 'both', label: 'Vert and horz' },
                          { value: 'vert', label: 'Vert' },
                          { value: 'horz', label: 'Horz' },
                          { value: 'none', label: 'None' },
                        ]}
                        onChange={(val) => updateAppearance({ gridMode: val })}
                      />
                      {(appearance.gridMode === 'both' || appearance.gridMode === 'vert') &&
                        showGrid && (
                          <ColorSwatchButton
                            testId="swatch-vert-grid"
                            ariaLabel="Vertical grid color"
                            color={appearance.vertGridColor}
                            onChange={(c) => updateAppearance({ vertGridColor: c })}
                          />
                        )}
                      {(appearance.gridMode === 'both' || appearance.gridMode === 'horz') &&
                        showGrid && (
                          <ColorSwatchButton
                            testId="swatch-horz-grid"
                            ariaLabel="Horizontal grid color"
                            color={appearance.horzGridColor}
                            onChange={(c) => updateAppearance({ horzGridColor: c })}
                          />
                        )}
                    </div>

                    {/* Watermark */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-[120px] shrink-0">
                        <TvCheckbox
                          testId="settings-show-watermark"
                          checked={appearance.showWatermark}
                          onChange={(checked) =>
                            updateAppearance({ showWatermark: checked })
                          }
                          label="Watermark"
                        />
                      </div>
                      <ColorSwatchButton
                        testId="swatch-watermark"
                        ariaLabel="Watermark color"
                        color={appearance.watermarkColor}
                        disabled={!appearance.showWatermark}
                        onChange={(c) => updateAppearance({ watermarkColor: c })}
                      />
                    </div>
                  </div>
                </div>

                {/* SCALES */}
                <div className="pt-2 border-t border-[var(--tv-border-subtle)]">
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    SCALES
                  </div>
                  <div className="flex flex-col gap-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-[120px] shrink-0 text-[13.5px] text-[var(--tv-text-primary)]">
                        Text
                      </span>
                      <ColorSwatchButton
                        testId="swatch-scales-text"
                        ariaLabel="Scales text color"
                        color={appearance.scalesTextColor}
                        onChange={(c) => updateAppearance({ scalesTextColor: c })}
                      />
                      <TvSelect<`${ScalesFontSize}`>
                        testId="settings-scales-font-size"
                        ariaLabel="Scales font size"
                        value={String(appearance.scalesFontSize) as `${ScalesFontSize}`}
                        widthClass="w-[90px]"
                        options={[
                          { value: '10', label: '10' },
                          { value: '11', label: '11' },
                          { value: '12', label: '12' },
                          { value: '13', label: '13' },
                          { value: '14', label: '14' },
                        ]}
                        onChange={(val) =>
                          updateAppearance({
                            scalesFontSize: Number(val) as ScalesFontSize,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="w-[120px] shrink-0 text-[13.5px] text-[var(--tv-text-primary)]">
                        Lines
                      </span>
                      <ColorSwatchButton
                        testId="swatch-scales-lines"
                        ariaLabel="Scales border lines color"
                        color={appearance.scalesLinesColor}
                        onChange={(c) => updateAppearance({ scalesLinesColor: c })}
                      />
                    </div>
                  </div>
                </div>

                {/* MARGINS */}
                <div className="pt-2 border-t border-[var(--tv-border-subtle)]">
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    MARGINS
                  </div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-[13.5px] text-[var(--tv-text-primary)]">
                      <span>Top</span>
                      <input
                        type="number"
                        data-testid="settings-top-margin"
                        min={0}
                        max={40}
                        value={appearance.topMarginPct}
                        onChange={(e) =>
                          updateAppearance({
                            topMarginPct: Math.min(40, Math.max(0, Number(e.target.value))),
                          })
                        }
                        className="w-[68px] h-[32px] px-2.5 rounded-[6px] border border-[#d1d4dc] dark:border-[#363a45] bg-[var(--tv-bg-panel)] text-[13px] tabular-nums"
                      />
                      <span className="text-[var(--tv-text-muted)]">%</span>
                    </label>
                    <label className="flex items-center gap-2 text-[13.5px] text-[var(--tv-text-primary)]">
                      <span>Bottom</span>
                      <input
                        type="number"
                        data-testid="settings-bottom-margin"
                        min={0}
                        max={40}
                        value={appearance.bottomMarginPct}
                        onChange={(e) =>
                          updateAppearance({
                            bottomMarginPct: Math.min(
                              40,
                              Math.max(0, Number(e.target.value)),
                            ),
                          })
                        }
                        className="w-[68px] h-[32px] px-2.5 rounded-[6px] border border-[#d1d4dc] dark:border-[#363a45] bg-[var(--tv-bg-panel)] text-[13px] tabular-nums"
                      />
                      <span className="text-[var(--tv-text-muted)]">%</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'trading' && (
              <div data-testid="settings-panel-trading" className="flex flex-col gap-5">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    GENERAL
                  </div>
                  <div className="flex flex-col gap-3">
                    <TvCheckbox
                      testId="settings-show-bid-ask"
                      checked={showBidAskPill}
                      onChange={(checked) => setShowBidAskPill(checked)}
                      label="Buy / Sell buttons (1-Click Bid/Ask pill)"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--tv-border-subtle)]">
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    APPEARANCE
                  </div>
                  <div className="flex flex-col gap-3">
                    <TvCheckbox
                      testId="settings-show-positions"
                      checked={appearance.showPositionsOnChart}
                      onChange={(checked) =>
                        updateAppearance({ showPositionsOnChart: checked })
                      }
                      label="Positions &amp; unrealized P&amp;L on chart"
                    />
                    <TvCheckbox
                      testId="settings-show-executions"
                      checked={appearance.showExecutionsOnChart}
                      onChange={(checked) =>
                        updateAppearance({ showExecutionsOnChart: checked })
                      }
                      label="Executions &amp; strategy trade markers"
                    />
                    <TvCheckbox
                      testId="settings-show-brackets"
                      checked={appearance.showBracketsOnChart}
                      onChange={(checked) =>
                        updateAppearance({ showBracketsOnChart: checked })
                      }
                      label="Stop-Loss &amp; Take-Profit bracket lines"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--tv-border-subtle)] flex items-center justify-between">
                  <span className="text-[12.5px] text-[var(--tv-text-muted)]">
                    AI Copilot &amp; BigQuery ML Providers
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setChartSettingsOpen(false);
                      openConnectionsModal('opencode');
                    }}
                    className="h-[32px] px-3 rounded-[6px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] hover:border-[#2962ff] text-[12.5px] text-[var(--tv-text-primary)] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plug className="w-3.5 h-3.5 text-[#2962ff]" />
                    Open Connections
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'alerts' && (
              <div data-testid="settings-panel-alerts" className="flex flex-col gap-5">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    CHART VISIBILITY
                  </div>
                  <div className="flex items-center gap-4">
                    <TvCheckbox
                      testId="settings-show-alert-lines"
                      checked={appearance.showAlertLinesOnChart}
                      onChange={(checked) =>
                        updateAppearance({ showAlertLinesOnChart: checked })
                      }
                      label="Alert lines"
                    />
                    <ColorSwatchButton
                      testId="swatch-alert-line"
                      ariaLabel="Alert line color"
                      color={appearance.alertLineColor}
                      disabled={!appearance.showAlertLinesOnChart}
                      onChange={(c) => updateAppearance({ alertLineColor: c })}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'events' && (
              <div data-testid="settings-panel-events" className="flex flex-col gap-5">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--tv-text-muted)] mb-3.5">
                    SESSION &amp; MACRO CALENDAR
                  </div>
                  <div className="flex flex-col gap-3.5">
                    <TvCheckbox
                      testId="settings-show-session-breaks"
                      checked={appearance.showSessionBreaks}
                      onChange={(checked) =>
                        updateAppearance({ showSessionBreaks: checked })
                      }
                      label="Session breaks"
                    />
                    <TvCheckbox
                      testId="settings-show-economic-events"
                      checked={appearance.showEconomicEvents}
                      onChange={(checked) =>
                        updateAppearance({ showEconomicEvents: checked })
                      }
                      label="Economic events on chart"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Footer: Template ⌄ | Cancel | Ok */}
        <div className="px-6 py-4 border-t border-[var(--tv-border-subtle)] flex items-center justify-between shrink-0">
          {/* Template Dropdown */}
          <div ref={templateMenuRef} className="relative">
            <button
              type="button"
              data-testid="settings-template-btn"
              aria-expanded={templateMenuOpen}
              onClick={() => setTemplateMenuOpen((v) => !v)}
              className="h-[34px] px-3.5 rounded-[6px] border border-[#d1d4dc] dark:border-[#434651] hover:border-[var(--tv-text-primary)] bg-[var(--tv-bg-panel)] text-[13.5px] font-medium text-[var(--tv-text-primary)] flex items-center gap-2 cursor-pointer"
            >
              <span>Template</span>
              <ChevronDown className="w-4 h-4 text-[var(--tv-text-muted)]" />
            </button>

            {templateMenuOpen && (
              <div
                data-testid="settings-template-menu"
                className="absolute bottom-[42px] left-0 z-50 w-[265px] rounded-[8px] border border-[var(--tv-border)] bg-[#ffffff] dark:bg-[#1e222d] shadow-2xl py-1.5 text-[13px]"
              >
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tv-text-muted)]">
                  Chart Templates
                </div>
                {chartTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--tv-bg-hover)]"
                  >
                    <button
                      type="button"
                      data-testid={`template-option-${tpl.id}`}
                      onClick={() => {
                        applyChartTemplate(tpl.id);
                        setTemplateMenuOpen(false);
                      }}
                      className="flex-1 text-left text-[var(--tv-text-primary)] font-medium cursor-pointer truncate"
                    >
                      {tpl.name}
                    </button>
                    {!tpl.builtin && (
                      <button
                        type="button"
                        aria-label={`Delete template ${tpl.name}`}
                        onClick={() => deleteCustomChartTemplate(tpl.id)}
                        className="ml-2 p-1 text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <div className="my-1 h-[1px] bg-[var(--tv-border-subtle)]" />

                {!savePromptOpen ? (
                  <button
                    type="button"
                    data-testid="template-save-as-btn"
                    onClick={() => setSavePromptOpen(true)}
                    className="w-full px-3 py-1.5 text-left text-[#2962ff] font-medium hover:bg-[var(--tv-bg-hover)] cursor-pointer"
                  >
                    Save As...
                  </button>
                ) : (
                  <div className="px-3 py-1.5 flex items-center gap-1.5">
                    <input
                      type="text"
                      data-testid="template-save-name-input"
                      autoFocus
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCustomTemplate();
                      }}
                      placeholder="Template name..."
                      className="flex-1 h-7 px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] text-[12px] text-[var(--tv-text-primary)] focus:outline-none focus:border-[#2962ff]"
                    />
                    <button
                      type="button"
                      data-testid="template-save-confirm-btn"
                      onClick={handleSaveCustomTemplate}
                      className="h-7 px-2.5 rounded bg-[#2962ff] text-white text-[12px] font-medium cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Action Buttons: Cancel | Ok */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              data-testid="settings-cancel-btn"
              onClick={handleCancel}
              className="h-[34px] px-5 rounded-[6px] border border-[#131722] dark:border-[#50535e] hover:bg-[var(--tv-bg-hover)] text-[13.5px] font-medium text-[var(--tv-text-primary)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="settings-ok-btn"
              onClick={handleOk}
              className="h-[34px] px-6 rounded-[6px] bg-[#131722] text-[#ffffff] dark:bg-[#f0f3fa] dark:text-[#131722] hover:opacity-90 text-[13.5px] font-semibold transition-opacity cursor-pointer"
            >
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
