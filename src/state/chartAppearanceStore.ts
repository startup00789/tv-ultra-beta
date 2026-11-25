import { create } from 'zustand';
import { useWorkspaceStore } from './workspaceStore';

export type PrecisionOverride = 'default' | '0' | '1' | '2' | '3' | '4' | '5';
export type SymbolTitleMode = 'ticker' | 'description' | 'ticker_and_description';
export type LineDashStyle = 'solid' | 'dashed' | 'dotted';
export type GridDisplayMode = 'both' | 'vert' | 'horz' | 'none';
export type CanvasBackgroundType = 'solid' | 'gradient';
export type ScalesFontSize = 10 | 11 | 12 | 13 | 14;
export type CrosshairLineWidth = 1 | 2 | 3;

export interface ChartAppearanceSettings {
  // 1. Symbol / Candles
  colorBasedOnPrevClose: boolean;
  bodyVisible: boolean;
  bodyUpColor: string;
  bodyDownColor: string;
  bordersVisible: boolean;
  borderUpColor: string;
  borderDownColor: string;
  wickVisible: boolean;
  wickUpColor: string;
  wickDownColor: string;
  precisionOverride: PrecisionOverride;
  timezone: string;

  // 2. Status line
  showSymbolTitle: boolean;
  symbolTitleMode: SymbolTitleMode;
  showOpenMarketStatus: boolean;
  showOhlcValues: boolean;
  showBarChangeValues: boolean;
  showVolumeLegend: boolean;
  showIndicatorTitles: boolean;
  showIndicatorArguments: boolean;
  showIndicatorValues: boolean;

  // 3. Scales and lines
  showLastPriceLabel: boolean;
  showLastPriceLine: boolean;
  lastPriceLineStyle: LineDashStyle;
  showHighLowLines: boolean;
  showCountdownToBarClose: boolean;
  lockPriceToBarRatio: boolean;
  crosshairColor: string;
  crosshairStyle: LineDashStyle;
  crosshairWidth: CrosshairLineWidth;

  // 4. Canvas
  backgroundType: CanvasBackgroundType;
  backgroundColor: string;
  backgroundGradientEnd: string;
  gridMode: GridDisplayMode;
  vertGridColor: string;
  horzGridColor: string;
  scalesTextColor: string;
  scalesFontSize: ScalesFontSize;
  scalesLinesColor: string;
  showWatermark: boolean;
  watermarkColor: string;
  topMarginPct: number;
  bottomMarginPct: number;

  // 5. Trading / Alerts / Events
  showPositionsOnChart: boolean;
  showExecutionsOnChart: boolean;
  showBracketsOnChart: boolean;
  showAlertLinesOnChart: boolean;
  alertLineColor: string;
  showSessionBreaks: boolean;
  showEconomicEvents: boolean;
}

export interface ChartAppearanceTemplate {
  id: string;
  name: string;
  builtin?: boolean;
  settings: Partial<ChartAppearanceSettings>;
}

const STORAGE_APPEARANCE_KEY = 'tv_ultra_chart_appearance_v1';

export const DEFAULT_CHART_APPEARANCE: ChartAppearanceSettings = {
  // Symbol / Candles
  colorBasedOnPrevClose: false,
  bodyVisible: true,
  bodyUpColor: '#089981',
  bodyDownColor: '#f23645',
  bordersVisible: true,
  borderUpColor: '#089981',
  borderDownColor: '#f23645',
  wickVisible: true,
  wickUpColor: '#089981',
  wickDownColor: '#f23645',
  precisionOverride: 'default',
  timezone: 'UTC',

  // Status line
  showSymbolTitle: true,
  symbolTitleMode: 'ticker_and_description',
  showOpenMarketStatus: true,
  showOhlcValues: true,
  showBarChangeValues: true,
  showVolumeLegend: true,
  showIndicatorTitles: true,
  showIndicatorArguments: true,
  showIndicatorValues: true,

  // Scales and lines
  showLastPriceLabel: true,
  showLastPriceLine: true,
  lastPriceLineStyle: 'dashed',
  showHighLowLines: false,
  showCountdownToBarClose: true,
  lockPriceToBarRatio: false,
  crosshairColor: '#787b86',
  crosshairStyle: 'dashed',
  crosshairWidth: 1,

  // Canvas
  backgroundType: 'solid',
  backgroundColor: '#131722',
  backgroundGradientEnd: '#1e222d',
  gridMode: 'both',
  vertGridColor: '#1e222d',
  horzGridColor: '#1e222d',
  scalesTextColor: '#787b86',
  scalesFontSize: 11,
  scalesLinesColor: '#2a2e39',
  showWatermark: true,
  watermarkColor: 'rgba(209, 212, 220, 0.06)',
  topMarginPct: 8,
  bottomMarginPct: 12,

  // Trading / Alerts / Events
  showPositionsOnChart: true,
  showExecutionsOnChart: true,
  showBracketsOnChart: true,
  showAlertLinesOnChart: true,
  alertLineColor: '#f59e0b',
  showSessionBreaks: false,
  showEconomicEvents: false,
};

export const BUILTIN_CHART_TEMPLATES: readonly ChartAppearanceTemplate[] = [
  {
    id: 'default-dark',
    name: 'Apply Default',
    builtin: true,
    settings: {
      ...DEFAULT_CHART_APPEARANCE,
    },
  },
  {
    id: 'ict-paper-white',
    name: 'ICT Clean White (Screenshot)',
    builtin: true,
    settings: {
      colorBasedOnPrevClose: false,
      bodyVisible: true,
      bodyUpColor: '#d1d4dc',
      bodyDownColor: '#000000',
      bordersVisible: true,
      borderUpColor: '#000000',
      borderDownColor: '#000000',
      wickVisible: true,
      wickUpColor: '#000000',
      wickDownColor: '#000000',
      backgroundType: 'solid',
      backgroundColor: '#ffffff',
      backgroundGradientEnd: '#f0f3fa',
      gridMode: 'none',
      vertGridColor: '#f0f3fa',
      horzGridColor: '#f0f3fa',
      scalesTextColor: '#131722',
      scalesLinesColor: '#e0e3eb',
      crosshairColor: '#787b86',
      crosshairStyle: 'dashed',
      showWatermark: false,
      watermarkColor: 'rgba(19, 23, 34, 0.05)',
    },
  },
  {
    id: 'ict-monochrome',
    name: 'ICT Dark Monochrome',
    builtin: true,
    settings: {
      colorBasedOnPrevClose: false,
      bodyVisible: true,
      bodyUpColor: '#d1d4dc',
      bodyDownColor: '#000000',
      bordersVisible: true,
      borderUpColor: '#000000',
      borderDownColor: '#000000',
      wickVisible: true,
      wickUpColor: '#000000',
      wickDownColor: '#000000',
      backgroundType: 'solid',
      backgroundColor: '#232834',
      backgroundGradientEnd: '#131722',
      gridMode: 'both',
      vertGridColor: '#2c3242',
      horzGridColor: '#2c3242',
      scalesTextColor: '#b2b5be',
      scalesLinesColor: '#363c4e',
      crosshairColor: '#9598a1',
      crosshairStyle: 'dashed',
      showWatermark: true,
      watermarkColor: 'rgba(209, 212, 220, 0.05)',
    },
  },
  {
    id: 'hollow-cyber',
    name: 'Hollow Neon Institutional',
    builtin: true,
    settings: {
      colorBasedOnPrevClose: false,
      bodyVisible: true,
      bodyUpColor: 'rgba(0, 229, 255, 0.14)',
      bodyDownColor: '#ff2a6d',
      bordersVisible: true,
      borderUpColor: '#00e5ff',
      borderDownColor: '#ff2a6d',
      wickVisible: true,
      wickUpColor: '#00e5ff',
      wickDownColor: '#ff2a6d',
      backgroundType: 'gradient',
      backgroundColor: '#0b0e17',
      backgroundGradientEnd: '#161b2e',
      gridMode: 'both',
      vertGridColor: 'rgba(41, 98, 255, 0.14)',
      horzGridColor: 'rgba(41, 98, 255, 0.14)',
      scalesTextColor: '#94a3b8',
      scalesLinesColor: '#1e293b',
      crosshairColor: '#00e5ff',
      crosshairStyle: 'dotted',
      showWatermark: true,
      watermarkColor: 'rgba(0, 229, 255, 0.06)',
    },
  },
];

interface PersistedAppearancePayload {
  settings?: Partial<ChartAppearanceSettings>;
  customTemplates?: ChartAppearanceTemplate[];
}

function safeReadStorage(): PersistedAppearancePayload | null {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null;
    const raw = globalThis.localStorage.getItem(STORAGE_APPEARANCE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as PersistedAppearancePayload;
    }
  } catch {
    // Ignore storage read errors in Node / SSR / restricted environments
  }
  return null;
}

function safeWriteStorage(payload: PersistedAppearancePayload): void {
  try {
    if (typeof globalThis.localStorage === 'undefined') return;
    globalThis.localStorage.setItem(STORAGE_APPEARANCE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write errors in Node / SSR / quota limits
  }
}

export function extractAppearanceSettings(
  state: ChartAppearanceSettings,
): ChartAppearanceSettings {
  return {
    colorBasedOnPrevClose: state.colorBasedOnPrevClose,
    bodyVisible: state.bodyVisible,
    bodyUpColor: state.bodyUpColor,
    bodyDownColor: state.bodyDownColor,
    bordersVisible: state.bordersVisible,
    borderUpColor: state.borderUpColor,
    borderDownColor: state.borderDownColor,
    wickVisible: state.wickVisible,
    wickUpColor: state.wickUpColor,
    wickDownColor: state.wickDownColor,
    precisionOverride: state.precisionOverride,
    timezone: state.timezone,
    showSymbolTitle: state.showSymbolTitle,
    symbolTitleMode: state.symbolTitleMode,
    showOpenMarketStatus: state.showOpenMarketStatus,
    showOhlcValues: state.showOhlcValues,
    showBarChangeValues: state.showBarChangeValues,
    showVolumeLegend: state.showVolumeLegend,
    showIndicatorTitles: state.showIndicatorTitles,
    showIndicatorArguments: state.showIndicatorArguments,
    showIndicatorValues: state.showIndicatorValues,
    showLastPriceLabel: state.showLastPriceLabel,
    showLastPriceLine: state.showLastPriceLine,
    lastPriceLineStyle: state.lastPriceLineStyle,
    showHighLowLines: state.showHighLowLines,
    showCountdownToBarClose: state.showCountdownToBarClose,
    lockPriceToBarRatio: state.lockPriceToBarRatio,
    crosshairColor: state.crosshairColor,
    crosshairStyle: state.crosshairStyle,
    crosshairWidth: state.crosshairWidth,
    backgroundType: state.backgroundType,
    backgroundColor: state.backgroundColor,
    backgroundGradientEnd: state.backgroundGradientEnd,
    gridMode: state.gridMode,
    vertGridColor: state.vertGridColor,
    horzGridColor: state.horzGridColor,
    scalesTextColor: state.scalesTextColor,
    scalesFontSize: state.scalesFontSize,
    scalesLinesColor: state.scalesLinesColor,
    showWatermark: state.showWatermark,
    watermarkColor: state.watermarkColor,
    topMarginPct: state.topMarginPct,
    bottomMarginPct: state.bottomMarginPct,
    showPositionsOnChart: state.showPositionsOnChart,
    showExecutionsOnChart: state.showExecutionsOnChart,
    showBracketsOnChart: state.showBracketsOnChart,
    showAlertLinesOnChart: state.showAlertLinesOnChart,
    alertLineColor: state.alertLineColor,
    showSessionBreaks: state.showSessionBreaks,
    showEconomicEvents: state.showEconomicEvents,
  };
}

function getThemeCanvasDefaults(theme: 'dark' | 'light'): Partial<ChartAppearanceSettings> {
  if (theme === 'light') {
    return {
      backgroundType: 'solid',
      backgroundColor: '#ffffff',
      backgroundGradientEnd: '#f0f3fa',
      vertGridColor: '#f0f3fa',
      horzGridColor: '#f0f3fa',
      scalesTextColor: '#434651',
      scalesLinesColor: '#e0e3eb',
      watermarkColor: 'rgba(19, 23, 34, 0.06)',
    };
  }
  return {
    backgroundType: 'solid',
    backgroundColor: '#131722',
    backgroundGradientEnd: '#1e222d',
    vertGridColor: '#1e222d',
    horzGridColor: '#1e222d',
    scalesTextColor: '#787b86',
    scalesLinesColor: '#2a2e39',
    watermarkColor: 'rgba(209, 212, 220, 0.06)',
  };
}

function loadInitialState(): {
  settings: ChartAppearanceSettings;
  chartTemplates: ChartAppearanceTemplate[];
} {
  const wsTheme = useWorkspaceStore.getState().theme;
  const baseDefaults: ChartAppearanceSettings = {
    ...DEFAULT_CHART_APPEARANCE,
    ...getThemeCanvasDefaults(wsTheme),
  };

  const persisted = safeReadStorage();
  const mergedSettings: ChartAppearanceSettings = {
    ...baseDefaults,
    ...(persisted?.settings ?? {}),
  };

  const customTemplates = Array.isArray(persisted?.customTemplates)
    ? persisted.customTemplates.filter(
        (t): t is ChartAppearanceTemplate =>
          Boolean(t && typeof t.id === 'string' && typeof t.name === 'string' && t.settings),
      )
    : [];

  return {
    settings: mergedSettings,
    chartTemplates: [...BUILTIN_CHART_TEMPLATES, ...customTemplates],
  };
}

export interface ChartAppearanceStore extends ChartAppearanceSettings {
  chartTemplates: ChartAppearanceTemplate[];
  activeTemplateId: string | null;
  updateAppearance: (patch: Partial<ChartAppearanceSettings>) => void;
  applyChartTemplate: (templateId: string) => void;
  saveCustomChartTemplate: (name: string) => ChartAppearanceTemplate | null;
  deleteCustomChartTemplate: (templateId: string) => void;
  resetAppearanceDefaults: () => void;
  getSnapshot: () => ChartAppearanceSettings;
  restoreSnapshot: (snapshot: ChartAppearanceSettings) => void;
}

const initial = loadInitialState();

export const useChartAppearanceStore = create<ChartAppearanceStore>((set, get) => ({
  ...initial.settings,
  chartTemplates: initial.chartTemplates,
  activeTemplateId: null,

  updateAppearance: (patch) => {
    set((state) => {
      const next = { ...state, ...patch };
      const settings = extractAppearanceSettings(next);
      const customTemplates = state.chartTemplates.filter((t) => !t.builtin);
      safeWriteStorage({ settings, customTemplates });
      return { ...patch, activeTemplateId: null };
    });

    if (typeof patch.timezone === 'string') {
      const ws = useWorkspaceStore.getState();
      if (ws.timezone !== patch.timezone) {
        ws.setTimezone(patch.timezone);
      }
    }

    if (patch.gridMode !== undefined) {
      const ws = useWorkspaceStore.getState();
      const shouldShowGrid = patch.gridMode !== 'none';
      if (ws.showGrid !== shouldShowGrid) {
        ws.setShowGrid(shouldShowGrid);
      }
    }
  },

  applyChartTemplate: (templateId) => {
    const tpl = get().chartTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    const wsTheme = useWorkspaceStore.getState().theme;
    const baseSettings: ChartAppearanceSettings =
      templateId === 'default-dark'
        ? { ...DEFAULT_CHART_APPEARANCE, ...getThemeCanvasDefaults(wsTheme) }
        : extractAppearanceSettings(get());
    const merged: ChartAppearanceSettings = {
      ...baseSettings,
      ...tpl.settings,
    };

    set((state) => {
      const customTemplates = state.chartTemplates.filter((t) => !t.builtin);
      safeWriteStorage({ settings: merged, customTemplates });
      return {
        ...merged,
        activeTemplateId: templateId,
      };
    });

    const ws = useWorkspaceStore.getState();
    if (ws.timezone !== merged.timezone) {
      ws.setTimezone(merged.timezone);
    }
    const shouldShowGrid = merged.gridMode !== 'none';
    if (ws.showGrid !== shouldShowGrid) {
      ws.setShowGrid(shouldShowGrid);
    }
  },

  saveCustomChartTemplate: (rawName) => {
    const trimmed = rawName.trim();
    if (!trimmed) return null;
    const currentSettings = extractAppearanceSettings(get());
    const newTpl: ChartAppearanceTemplate = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      builtin: false,
      settings: currentSettings,
    };
    set((state) => {
      const nextTemplates = [...state.chartTemplates, newTpl];
      const customTemplates = nextTemplates.filter((t) => !t.builtin);
      safeWriteStorage({ settings: currentSettings, customTemplates });
      return {
        chartTemplates: nextTemplates,
        activeTemplateId: newTpl.id,
      };
    });
    return newTpl;
  },

  deleteCustomChartTemplate: (templateId) => {
    set((state) => {
      const nextTemplates = state.chartTemplates.filter(
        (t) => t.builtin || t.id !== templateId,
      );
      const customTemplates = nextTemplates.filter((t) => !t.builtin);
      safeWriteStorage({
        settings: extractAppearanceSettings(state),
        customTemplates,
      });
      return {
        chartTemplates: nextTemplates,
        activeTemplateId:
          state.activeTemplateId === templateId ? null : state.activeTemplateId,
      };
    });
  },

  resetAppearanceDefaults: () => {
    const wsTheme = useWorkspaceStore.getState().theme;
    const nextSettings: ChartAppearanceSettings = {
      ...DEFAULT_CHART_APPEARANCE,
      ...getThemeCanvasDefaults(wsTheme),
    };
    set((state) => {
      const customTemplates = state.chartTemplates.filter((t) => !t.builtin);
      safeWriteStorage({ settings: nextSettings, customTemplates });
      return {
        ...nextSettings,
        activeTemplateId: 'default-dark',
      };
    });
    const ws = useWorkspaceStore.getState();
    ws.setTimezone('UTC');
    ws.setShowGrid(true);
  },

  getSnapshot: () => extractAppearanceSettings(get()),

  restoreSnapshot: (snapshot) => {
    set((state) => {
      const customTemplates = state.chartTemplates.filter((t) => !t.builtin);
      safeWriteStorage({ settings: snapshot, customTemplates });
      return { ...snapshot };
    });
    const ws = useWorkspaceStore.getState();
    if (ws.timezone !== snapshot.timezone) {
      ws.setTimezone(snapshot.timezone);
    }
    const shouldShowGrid = snapshot.gridMode !== 'none';
    if (ws.showGrid !== shouldShowGrid) {
      ws.setShowGrid(shouldShowGrid);
    }
  },
}));

// Sync standard dark/light canvas palette automatically when global workspace theme toggles
let lastObservedTheme = useWorkspaceStore.getState().theme;
useWorkspaceStore.subscribe((wsState) => {
  if (wsState.theme === lastObservedTheme) return;
  lastObservedTheme = wsState.theme;

  const appState = useChartAppearanceStore.getState();
  const isStandardDarkBg =
    appState.backgroundColor.toLowerCase() === '#131722' ||
    appState.backgroundColor.toLowerCase() === '#1e222d';
  const isStandardLightBg =
    appState.backgroundColor.toLowerCase() === '#ffffff' ||
    appState.backgroundColor.toLowerCase() === '#f8f9fd';

  if (
    (wsState.theme === 'light' && isStandardDarkBg) ||
    (wsState.theme === 'dark' && isStandardLightBg)
  ) {
    useChartAppearanceStore.setState((cur) => {
      const patch = getThemeCanvasDefaults(wsState.theme);
      const merged = extractAppearanceSettings({ ...cur, ...patch });
      const customTemplates = cur.chartTemplates.filter((t) => !t.builtin);
      safeWriteStorage({ settings: merged, customTemplates });
      return patch;
    });
  }
});
