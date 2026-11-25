import { create } from 'zustand';
import type {
  AIChartAction,
  AIMessage,
  AIRangeSelection,
  AssetClass,
  BacktestReport,
  BigQueryDryRunResponse,
  BigQueryExecuteResponse,
  BottomTab,
  ChartOverlayData,
  ChartStyle,
  ConnectionStatuses,
  ConnectionsTab,
  DateRangePreset,
  DrawingObject,
  DrawingPoint,
  DrawingStyleTemplate,
  DrawingToolId,
  DrawingToolType,
  IndicatorConfig,
  IndicatorType,
  LiveBarTickEvent,
  LiveQuoteTickEvent,
  LoadedBacktestStrategy,
  MarketStreamStatus,
  MasterPromptDraft,
  OHLCVBar,
  OpenCodeProviderModel,
  PaperAccountState,
  PriceAlert,
  ProviderConnectionStatus,
  RightTab,
  ScaleMode,
  StrategyAIProvider,
  SymbolInfo,
  ThemeMode,
  Timeframe,
} from '../../shared/types';
import { apiClient } from '../lib/apiClient';
import { isPositionTool, syncPositionDrawing } from '../lib/drawingPosition';

export type {
  AIMessage,
  AIRangeSelection,
  AssetClass,
  BigQueryDryRunResponse,
  BigQueryExecuteResponse,
  BottomTab,
  ChartOverlayData,
  ChartStyle,
  ConnectionStatuses,
  ConnectionsTab,
  DateRangePreset,
  DrawingObject,
  DrawingPoint,
  DrawingStyleTemplate,
  DrawingToolId,
  DrawingToolType,
  IndicatorConfig,
  IndicatorType,
  LiveBarTickEvent,
  LiveQuoteTickEvent,
  MarketStreamStatus,
  OHLCVBar,
  OpenCodeProviderModel,
  PriceAlert,
  ProviderConnectionStatus,
  RightTab,
  ScaleMode,
  SymbolInfo,
  ThemeMode,
  Timeframe,
};

const STORAGE_THEME_KEY = 'tv_theme';
const STORAGE_WATCHLIST_KEY = 'tv_watchlist';
const MAX_HISTORY_STACK = 50;
const MAX_ULTRA_CHART_BARS = 40_000;

function mergeBarsChronological(existing: OHLCVBar[], incoming: OHLCVBar[]): OHLCVBar[] {
  if (existing.length === 0) return incoming.slice(-MAX_ULTRA_CHART_BARS);
  if (incoming.length === 0) return existing;
  const map = new Map<number, OHLCVBar>();
  for (const b of existing) map.set(b.time, b);
  for (const b of incoming) map.set(b.time, b);
  return Array.from(map.values())
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_ULTRA_CHART_BARS);
}

const TIMEFRAME_SECONDS_MAP: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000,
};

function evaluateAlertsForPrice(
  alerts: PriceAlert[],
  symUpper: string,
  livePrice: number,
): PriceAlert[] {
  let changed = false;
  const next = alerts.map((a) => {
    if (a.triggered || a.symbol.toUpperCase() !== symUpper) return a;
    const hit =
      (a.condition === 'above' && livePrice >= a.targetPrice) ||
      (a.condition === 'below' && livePrice <= a.targetPrice);
    if (!hit) return a;
    changed = true;
    return { ...a, triggered: true };
  });
  return changed ? next : alerts;
}

export const DEFAULT_WATCHLIST_TICKERS: readonly string[] = [
  'SPX',
  'NDX',
  'DJI',
  'XAUUSD',
  'XAGUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AAPL',
  'TSLA',
  'NFLX',
  'NVDA',
  'MSFT',
  'BTCUSDT',
  'ETHUSDT',
];

const STORAGE_DRAWING_TEMPLATES_KEY = 'tv_ultra_drawing_templates_v1';
const STORAGE_DRAWING_DEFAULTS_KEY = 'tv_ultra_drawing_defaults_v1';
const STORAGE_DRAWINGS_KEY = 'tv_ultra_drawings_v1';
const DRAWINGS_SCHEMA_VERSION = 1;
const DRAWINGS_PERSIST_DELAY_MS = 250;
const MAX_PERSISTED_DRAWINGS = 2_000;

export const BUILTIN_DRAWING_TEMPLATES: readonly DrawingStyleTemplate[] = [
  {
    id: 'tpl-ict-fvg-bull',
    name: 'ICT Bullish FVG / Demand',
    tool: 'any',
    color: '#089981',
    lineWidth: 1,
    lineStyle: 'solid',
    borderColor: '#089981',
    borderWidth: 1,
    borderStyle: 'solid',
    showBorder: true,
    fillColor: '#089981',
    fillOpacity: 0.2,
    showFill: true,
    showMidline: true,
    extendRight: true,
  },
  {
    id: 'tpl-ict-ob-bear',
    name: 'ICT Bearish Supply / OB',
    tool: 'any',
    color: '#f23645',
    lineWidth: 1,
    lineStyle: 'solid',
    borderColor: '#f23645',
    borderWidth: 1,
    borderStyle: 'solid',
    showBorder: true,
    fillColor: '#f23645',
    fillOpacity: 0.2,
    showFill: true,
    showMidline: true,
    extendRight: true,
  },
  {
    id: 'tpl-gold-ote-fib',
    name: 'Golden OTE Institutional Fib',
    tool: 'fib',
    color: '#eab308',
    lineWidth: 2,
    lineStyle: 'solid',
    fillColor: '#eab308',
    fillOpacity: 0.16,
    showFill: true,
    extendRight: true,
    fibLevels: [0, 0.382, 0.5, 0.618, 0.705, 0.786, 1],
  },
  {
    id: 'tpl-liquidity-ray',
    name: 'Liquidity Sweep Level (Dashed)',
    tool: 'any',
    color: '#38bdf8',
    lineWidth: 2,
    lineStyle: 'dashed',
    extendRight: true,
    arrowEnd: true,
    showPriceLabels: true,
  },
  {
    id: 'tpl-dotted-session-box',
    name: 'Session Killzone (Dotted Border)',
    tool: 'any',
    color: '#a855f7',
    lineWidth: 2,
    lineStyle: 'dotted',
    borderColor: '#a855f7',
    borderWidth: 2,
    borderStyle: 'dotted',
    showBorder: true,
    fillColor: '#a855f7',
    fillOpacity: 0.12,
    showFill: true,
    showMidline: false,
  },
  {
    id: 'tpl-clean-borderless-zone',
    name: 'Clean Borderless Institutional Zone',
    tool: 'any',
    color: '#2962ff',
    lineWidth: 1,
    lineStyle: 'solid',
    borderColor: '#2962ff',
    borderWidth: 0,
    showBorder: false,
    fillColor: '#2962ff',
    fillOpacity: 0.18,
    showFill: true,
    showMidline: true,
  },
];

function readInitialDrawingTemplates(): DrawingStyleTemplate[] {
  const raw = safeGetStorage(STORAGE_DRAWING_TEMPLATES_KEY);
  if (!raw) return [...BUILTIN_DRAWING_TEMPLATES];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as DrawingStyleTemplate[];
    }
  } catch {
    // Fall back to built-in templates
  }
  return [...BUILTIN_DRAWING_TEMPLATES];
}

function readInitialDefaultToolStyles(): Record<string, Partial<DrawingStyleTemplate>> {
  const raw = safeGetStorage(STORAGE_DRAWING_DEFAULTS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, Partial<DrawingStyleTemplate>>;
    }
  } catch {
    // Ignore malformed local storage
  }
  return {};
}

function isValidStoredDrawing(value: unknown): value is DrawingObject {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<DrawingObject>;
  const tool = d.tool as string | undefined;
  return (
    typeof d.id === 'string' &&
    d.id.length > 0 &&
    typeof tool === 'string' &&
    tool !== 'crosshair' &&
    tool !== 'ai-range' &&
    typeof d.symbol === 'string' &&
    typeof d.timeframe === 'string' &&
    Array.isArray(d.points) &&
    d.points.length > 0 &&
    d.points.every(
      (p) =>
        p &&
        typeof p.time === 'number' &&
        Number.isFinite(p.time) &&
        typeof p.price === 'number' &&
        Number.isFinite(p.price),
    ) &&
    typeof d.color === 'string'
  );
}

/**
 * Restore drawings from localStorage and migrate legacy two-anchor position
 * drawings into the three-anchor model. Corrupt entries are dropped instead of
 * breaking the chart.
 */
function readInitialDrawings(): DrawingObject[] {
  const raw = safeGetStorage(STORAGE_DRAWINGS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { drawings?: unknown }).drawings)
        ? (parsed as { drawings: unknown[] }).drawings
        : null;
    if (!list) return [];
    return list
      .filter(isValidStoredDrawing)
      .slice(-MAX_PERSISTED_DRAWINGS)
      .map((drawing) =>
        isPositionTool(drawing.tool) ? syncPositionDrawing(drawing) : drawing,
      );
  } catch {
    // Ignore malformed local storage
  }
  return [];
}

function safeGetStorage(key: string): string | null {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null;
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    if (typeof globalThis.localStorage === 'undefined') return;
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or SSR/test environment errors
  }
}

function readInitialTheme(): ThemeMode {
  const stored = safeGetStorage(STORAGE_THEME_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

function readInitialWatchlistTickers(): string[] {
  const raw = safeGetStorage(STORAGE_WATCHLIST_KEY);
  if (!raw) return [...DEFAULT_WATCHLIST_TICKERS];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cleaned = parsed
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((s) => s.trim().toUpperCase());
      if (cleaned.length > 0) {
        return Array.from(new Set(cleaned));
      }
    }
  } catch {
    // Fall back to default watchlist
  }
  return [...DEFAULT_WATCHLIST_TICKERS];
}

function applyThemeToDom(theme: ThemeMode): void {
  try {
    if (typeof globalThis.document === 'undefined') return;
    const root = globalThis.document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
  } catch {
    // Ignore in non-DOM test environments
  }
}

function resolveWatchlistFromCatalog(
  tickers: string[],
  catalog: SymbolInfo[],
): SymbolInfo[] {
  const bySymbol = new Map<string, SymbolInfo>();
  for (const item of catalog) {
    bySymbol.set(item.symbol.toUpperCase(), item);
  }
  const result: SymbolInfo[] = [];
  for (const ticker of tickers) {
    const found = bySymbol.get(ticker.toUpperCase());
    if (found) {
      result.push(found);
    }
  }
  return result;
}

function pushUndoSnapshot(
  stack: DrawingObject[][],
  snapshot: DrawingObject[],
): DrawingObject[][] {
  const next = [...stack, snapshot.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) }))];
  if (next.length > MAX_HISTORY_STACK) {
    return next.slice(next.length - MAX_HISTORY_STACK);
  }
  return next;
}

let barsRequestSeq = 0;
let activeBarsAbort: AbortController | null = null;
let indicatorSeq = 0;

export interface WorkspaceState {
  // Market & Chart
  symbol: string;
  symbolInfo: SymbolInfo | null;
  timeframe: Timeframe;
  chartStyle: ChartStyle;
  scaleMode: ScaleMode;
  autoScale: boolean;
  dateRange: DateRangePreset;
  theme: ThemeMode;
  timezone: string;
  bars: OHLCVBar[];
  barsSource: 'seeded' | 'live' | null;
  liveMarketData: boolean;
  streamStatus: MarketStreamStatus;
  seriesRevision: number;
  liveTickCount: number;
  tickFlashBySymbol: Record<string, { dir: 'up' | 'down'; at: number }>;
  lastDataUpdatedAt: string | null;
  loadingBars: boolean;
  marketError: string | null;
  hoveredBar: OHLCVBar | null;
  compareSymbols: string[];

  // Watchlist & Catalog
  catalogSymbols: SymbolInfo[];
  watchlist: SymbolInfo[];
  watchlistTickers: string[];
  loadingWatchlist: boolean;

  // Indicators & Drawings
  indicators: IndicatorConfig[];
  drawings: DrawingObject[];
  selectedDrawingId: string | null;
  drawingSettingsId: string | null;
  drawingTemplates: DrawingStyleTemplate[];
  defaultToolStyles: Record<string, Partial<DrawingStyleTemplate>>;
  activeTool: DrawingToolId;
  magnetMode: boolean;
  keepDrawing: boolean;
  lockDrawings: boolean;
  hideDrawings: boolean;
  undoStack: DrawingObject[][];
  redoStack: DrawingObject[][];

  // Overlays, AI & BigQuery
  chartOverlay: ChartOverlayData | null;
  overlayVisible: boolean;
  aiRangeSelection: AIRangeSelection | null;
  connectionStatuses: ConnectionStatuses;
  opencodeModels: OpenCodeProviderModel[];
  opencodeSelectedModel: { providerID: string; modelID: string } | null;

  // Shell Chrome & Modals
  activeRightTab: RightTab;
  rightPanelWidth: number;
  bottomDrawerOpen: boolean;
  bottomDrawerHeight: number;
  activeBottomTab: BottomTab;
  connectionsModalOpen: boolean;
  connectionsTab: ConnectionsTab;
  symbolSearchOpen: boolean;
  compareModalMode: boolean;
  indicatorsModalOpen: boolean;
  chartSettingsOpen: boolean;
  mainMenuOpen: boolean;
  showGrid: boolean;
  showBidAskPill: boolean;

  // Alerts, AI & BigQuery Studio shared state
  alerts: PriceAlert[];
  aiMessages: AIMessage[];
  bqSql: string;
  bqResult: BigQueryExecuteResponse | null;
  bqDryRun: BigQueryDryRunResponse | null;
  bqError: string | null;
  bqLoading: boolean;

  // Strategy Backtester, Loaded Strategy & Live Demo Forward Test state
  masterPromptDraft: MasterPromptDraft | null;
  backtestReport: BacktestReport | null;
  loadedStrategy: LoadedBacktestStrategy | null;
  forwardTestActive: boolean;
  forwardTestStartedAt: string | null;
  forwardTestAiProvider: StrategyAIProvider;
  backtestMarkersVisible: boolean;
  selectedBacktestTradeNumber: number | null;
  paperAccount: PaperAccountState | null;

  // Ultra History Pagination, Pro Overlays, Bar Replay & Chart Interrogation state
  hasMoreHistory: boolean;
  loadingMoreHistory: boolean;
  showVolumeProfile: boolean;
  showSmcOverlay: boolean;
  showSessionsOverlay: boolean;
  chartWhyInspectMode: boolean;
  inspectedBarIndex: number | null;
  bottomDrawerExpanded: boolean;
  goToDateTimestamp: number | null;
  replayActive: boolean;
  replayIndex: number;
  replayPlaying: boolean;
  replaySpeedMs: number;

  // Actions
  initializeWorkspace: () => Promise<void>;
  setSymbol: (symbol: string) => Promise<void>;
  setTimeframe: (timeframe: Timeframe) => Promise<void>;
  loadChartData: (symbol?: string, timeframe?: Timeframe) => Promise<void>;
  loadMoreHistory: (chunkSize?: number) => Promise<number>;
  loadDeepHistory: (targetBars: number) => Promise<void>;
  setLiveMarketData: (live: boolean) => Promise<void>;
  setStreamStatus: (status: MarketStreamStatus) => void;
  applyLiveBarTick: (event: LiveBarTickEvent) => void;
  applyLiveQuoteTick: (tick: LiveQuoteTickEvent) => void;
  refreshLivePrices: () => Promise<void>;
  setChartStyle: (style: ChartStyle) => void;
  setScaleMode: (mode: ScaleMode) => void;
  setAutoScale: (auto: boolean) => void;
  toggleAutoScale: () => void;
  setDateRange: (range: DateRangePreset) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setTimezone: (tz: string) => void;
  setHoveredBar: (bar: OHLCVBar | null) => void;
  addCompareSymbol: (symbol: string) => void;
  removeCompareSymbol: (symbol: string) => void;

  loadWatchlist: () => Promise<void>;
  addToWatchlist: (symbol: string) => Promise<void>;
  removeFromWatchlist: (symbol: string) => void;

  addIndicator: (ind: Omit<IndicatorConfig, 'instanceId'> & { instanceId?: string }) => void;
  toggleIndicatorVisibility: (instanceId: string) => void;
  updateIndicatorParams: (instanceId: string, params: Record<string, number>) => void;
  removeIndicator: (instanceId: string) => void;

  setActiveTool: (tool: DrawingToolId) => void;
  addDrawing: (drawing: DrawingObject) => void;
  updateDrawing: (
    id: string,
    patch: Partial<DrawingObject>,
    options?: { skipUndo?: boolean; replace?: boolean },
  ) => void;
  selectDrawing: (id: string | null) => void;
  openDrawingSettings: (id: string | null) => void;
  saveDrawingTemplate: (name: string, fromDrawing: DrawingObject) => void;
  deleteDrawingTemplate: (templateId: string) => void;
  applyDrawingTemplate: (drawingId: string, templateId: string) => void;
  setDefaultToolStyle: (tool: string, patch: Partial<DrawingStyleTemplate>) => void;
  reorderDrawing: (id: string, direction: 'front' | 'back') => void;
  deleteSelectedDrawing: () => void;
  removeAllDrawings: () => void;
  toggleMagnetMode: () => void;
  toggleKeepDrawing: () => void;
  toggleLockDrawings: () => void;
  toggleHideDrawings: () => void;
  undo: () => void;
  redo: () => void;

  setChartOverlay: (overlay: ChartOverlayData | null) => void;
  setOverlayVisible: (visible: boolean) => void;
  setAIRangeSelection: (selection: AIRangeSelection | null) => void;
  setConnectionStatus: (
    provider: keyof ConnectionStatuses,
    status: ProviderConnectionStatus,
  ) => void;
  setConnectionStatuses: (patch: Partial<ConnectionStatuses>) => void;
  setOpenCodeModels: (models: OpenCodeProviderModel[]) => void;
  setOpenCodeSelectedModel: (
    model: { providerID: string; modelID: string } | null,
  ) => Promise<void>;

  setActiveRightTab: (tab: RightTab) => void;
  toggleRightTab: (tab: Exclude<RightTab, null>) => void;
  setRightPanelWidth: (width: number) => void;
  setBottomDrawerOpen: (open: boolean) => void;
  toggleBottomDrawer: () => void;
  setBottomDrawerHeight: (height: number) => void;
  setActiveBottomTab: (tab: BottomTab) => void;
  openConnectionsModal: (tab?: ConnectionsTab) => void;
  closeConnectionsModal: () => void;
  setConnectionsTab: (tab: ConnectionsTab) => void;
  setSymbolSearchOpen: (open: boolean, compareMode?: boolean) => void;
  setIndicatorsModalOpen: (open: boolean) => void;
  setChartSettingsOpen: (open: boolean) => void;
  setMainMenuOpen: (open: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setShowBidAskPill: (show: boolean) => void;
  addAlert: (alert: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered'>) => void;
  removeAlert: (id: string) => void;
  appendAIMessage: (msg: AIMessage) => void;
  clearAIMessages: () => void;
  setBqSql: (sql: string) => void;
  setBqResult: (res: BigQueryExecuteResponse | null) => void;
  setBqDryRun: (res: BigQueryDryRunResponse | null) => void;
  setBqError: (err: string | null) => void;
  setBqLoading: (loading: boolean) => void;
  refreshConnectionsStatus: () => Promise<void>;
  setMasterPromptDraft: (draft: MasterPromptDraft | null) => void;
  setBacktestReport: (report: BacktestReport | null) => void;
  setLoadedStrategy: (strategy: LoadedBacktestStrategy | null) => void;
  startForwardTest: (strategyOverride?: LoadedBacktestStrategy, aiProvider?: StrategyAIProvider) => Promise<void>;
  stopForwardTest: () => void;
  setForwardTestAiProvider: (provider: StrategyAIProvider) => void;
  setBacktestMarkersVisible: (visible: boolean) => void;
  setSelectedBacktestTradeNumber: (tradeNumber: number | null) => void;
  setPaperAccount: (account: PaperAccountState | null) => void;
  refreshPaperAccount: () => Promise<void>;
  executeAIChartActions: (actions: AIChartAction[]) => void;
  toggleVolumeProfile: () => void;
  toggleSmcOverlay: () => void;
  toggleSessionsOverlay: () => void;
  setChartWhyInspectMode: (enabled: boolean) => void;
  setInspectedBarIndex: (idx: number | null) => void;
  toggleBottomDrawerExpanded: () => void;
  setGoToDateTimestamp: (ts: number | null) => void;
  startReplay: (startIndex?: number) => void;
  stopReplay: () => void;
  stepReplay: (delta?: number) => void;
  setReplayIndex: (idx: number) => void;
  setReplayPlaying: (playing: boolean) => void;
  setReplaySpeedMs: (ms: number) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  // Market & Chart
  symbol: 'AAPL',
  symbolInfo: null,
  timeframe: '1D',
  chartStyle: 'candles',
  scaleMode: 'regular',
  autoScale: true,
  dateRange: '1Y',
  theme: readInitialTheme(),
  timezone: 'UTC',
  bars: [],
  barsSource: null,
  liveMarketData: true,
  streamStatus: 'disconnected',
  seriesRevision: 0,
  liveTickCount: 0,
  tickFlashBySymbol: {},
  lastDataUpdatedAt: null,
  loadingBars: false,
  marketError: null,
  hoveredBar: null,
  compareSymbols: [],

  // Watchlist & Catalog
  catalogSymbols: [],
  watchlist: [],
  watchlistTickers: readInitialWatchlistTickers(),
  loadingWatchlist: false,

  // Indicators & Drawings
  indicators: [],
  drawings: readInitialDrawings(),
  selectedDrawingId: null,
  drawingSettingsId: null,
  drawingTemplates: readInitialDrawingTemplates(),
  defaultToolStyles: readInitialDefaultToolStyles(),
  activeTool: 'crosshair',
  magnetMode: false,
  keepDrawing: false,
  lockDrawings: false,
  hideDrawings: false,
  undoStack: [],
  redoStack: [],

  // Overlays, AI & BigQuery
  chartOverlay: null,
  overlayVisible: true,
  aiRangeSelection: null,
  connectionStatuses: {
    deepseek: 'disconnected',
    opencode: 'disconnected',
    byok: 'disconnected',
    gemini: 'disconnected',
    bigquery: 'disconnected',
  },
  opencodeModels: [],
  opencodeSelectedModel: null,

  // Shell Chrome & Modals
  activeRightTab: 'watchlist',
  rightPanelWidth: 300,
  bottomDrawerOpen: false,
  bottomDrawerHeight: 320,
  activeBottomTab: 'backtester',
  connectionsModalOpen: false,
  connectionsTab: 'opencode',
  symbolSearchOpen: false,
  compareModalMode: false,
  indicatorsModalOpen: false,
  chartSettingsOpen: false,
  mainMenuOpen: false,
  showGrid: true,
  showBidAskPill: true,

  // Alerts, AI & BigQuery Studio shared state
  alerts: [],
  aiMessages: [],
  bqSql: '',
  bqResult: null,
  bqDryRun: null,
  bqError: null,
  bqLoading: false,

  // Strategy Backtester, Loaded Strategy & Live Demo Forward Test state
  masterPromptDraft: null,
  backtestReport: null,
  loadedStrategy: null,
  forwardTestActive: false,
  forwardTestStartedAt: null,
  forwardTestAiProvider: 'deepseek',
  backtestMarkersVisible: true,
  selectedBacktestTradeNumber: null,
  paperAccount: null,

  // Ultra History Pagination, Pro Overlays, Bar Replay & Chart Interrogation state
  hasMoreHistory: true,
  loadingMoreHistory: false,
  showVolumeProfile: false,
  showSmcOverlay: false,
  showSessionsOverlay: false,
  chartWhyInspectMode: false,
  inspectedBarIndex: null,
  bottomDrawerExpanded: false,
  goToDateTimestamp: null,
  replayActive: false,
  replayIndex: 0,
  replayPlaying: false,
  replaySpeedMs: 500,

  initializeWorkspace: async () => {
    applyThemeToDom(get().theme);
    await Promise.all([
      get().loadWatchlist(),
      get().loadChartData(),
      get().refreshConnectionsStatus(),
      get().refreshPaperAccount(),
    ]);
  },

  setSymbol: async (rawSymbol: string) => {
    const normalized = rawSymbol.trim().toUpperCase();
    if (!normalized) return;
    set({ symbol: normalized, marketError: null, hoveredBar: null });
    await get().loadChartData(normalized, get().timeframe);
  },

  setTimeframe: async (timeframe: Timeframe) => {
    set({ timeframe, marketError: null, hoveredBar: null });
    await get().loadChartData(get().symbol, timeframe);
  },

  loadChartData: async (symbolArg?: string, timeframeArg?: Timeframe) => {
    const targetSymbol = (symbolArg ?? get().symbol).trim().toUpperCase();
    const targetTimeframe = timeframeArg ?? get().timeframe;
    const seq = ++barsRequestSeq;

    if (activeBarsAbort) {
      activeBarsAbort.abort();
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    activeBarsAbort = controller;

    set({ loadingBars: true, marketError: null });
    const live = get().liveMarketData;

    try {
      const [ohlcvRes, detailsRes] = await Promise.all([
        apiClient.getOHLCV(
          { symbol: targetSymbol, timeframe: targetTimeframe, limit: 3000, live },
          controller?.signal,
        ),
        apiClient
          .getSymbolDetails(targetSymbol, controller?.signal, live)
          .catch(() => null),
      ]);

      if (seq !== barsRequestSeq) {
        return;
      }

      set((s) => ({
        symbol: ohlcvRes.symbol,
        timeframe: ohlcvRes.timeframe,
        bars: ohlcvRes.bars,
        barsSource: ohlcvRes.source === 'seeded' ? 'seeded' : 'live',
        hasMoreHistory: ohlcvRes.bars.length < MAX_ULTRA_CHART_BARS,
        loadingMoreHistory: false,
        seriesRevision: s.seriesRevision + 1,
        lastDataUpdatedAt: new Date().toISOString(),
        symbolInfo: detailsRes
          ? detailsRes.details
          : (s.catalogSymbols.find((c) => c.symbol === ohlcvRes.symbol) ?? null),
        loadingBars: false,
        marketError: null,
      }));
    } catch (err) {
      if (seq !== barsRequestSeq) {
        return;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Failed to load market data.';
      set({
        loadingBars: false,
        marketError: message,
      });
    }
  },

  loadMoreHistory: async (chunkSize = 4000) => {
    const state = get();
    if (
      state.loadingMoreHistory ||
      state.loadingBars ||
      !state.hasMoreHistory ||
      state.bars.length === 0 ||
      state.bars.length >= MAX_ULTRA_CHART_BARS
    ) {
      return 0;
    }
    const targetSymbol = state.symbol;
    const targetTimeframe = state.timeframe;
    const earliestTime = state.bars[0].time;
    set({ loadingMoreHistory: true });

    try {
      const remaining = MAX_ULTRA_CHART_BARS - state.bars.length;
      const res = await apiClient.getUltraHistory({
        symbol: targetSymbol,
        timeframe: targetTimeframe,
        limit: Math.min(chunkSize, remaining),
        before: earliestTime,
        live: state.liveMarketData,
      });
      const cur = get();
      if (cur.symbol !== targetSymbol || cur.timeframe !== targetTimeframe) {
        set({ loadingMoreHistory: false });
        return 0;
      }
      if (res.bars.length === 0) {
        set({ loadingMoreHistory: false, hasMoreHistory: false });
        return 0;
      }
      const prevLen = cur.bars.length;
      const merged = mergeBarsChronological(cur.bars, res.bars);
      const added = Math.max(0, merged.length - prevLen);
      set({
        bars: merged,
        loadingMoreHistory: false,
        hasMoreHistory: added > 0 && merged.length < MAX_ULTRA_CHART_BARS,
        seriesRevision: cur.seriesRevision + 1,
      });
      return added;
    } catch {
      set({ loadingMoreHistory: false });
      return 0;
    }
  },

  loadDeepHistory: async (targetBars: number) => {
    const state = get();
    if (state.loadingBars || state.loadingMoreHistory) return;
    const wanted = Math.min(MAX_ULTRA_CHART_BARS, Math.max(1000, Math.floor(targetBars)));
    if (state.bars.length >= wanted) return;
    const targetSymbol = state.symbol;
    const targetTimeframe = state.timeframe;
    set({ loadingMoreHistory: true });
    try {
      const res = await apiClient.getUltraHistory({
        symbol: targetSymbol,
        timeframe: targetTimeframe,
        limit: wanted,
        live: state.liveMarketData,
      });
      const cur = get();
      if (cur.symbol !== targetSymbol || cur.timeframe !== targetTimeframe) {
        set({ loadingMoreHistory: false });
        return;
      }
      const merged = mergeBarsChronological(cur.bars, res.bars);
      set({
        bars: merged,
        loadingMoreHistory: false,
        hasMoreHistory: merged.length < MAX_ULTRA_CHART_BARS,
        seriesRevision: cur.seriesRevision + 1,
      });
    } catch {
      set({ loadingMoreHistory: false });
    }
  },

  setLiveMarketData: async (live: boolean) => {
    set({
      liveMarketData: live,
      ...(live ? {} : { streamStatus: 'disconnected' as const }),
    });
    await Promise.all([get().loadWatchlist(), get().loadChartData()]);
  },

  setStreamStatus: (streamStatus) => set({ streamStatus }),

  applyLiveBarTick: (event) => {
    const state = get();
    if (!state.liveMarketData) return;
    if (
      event.symbol.toUpperCase() !== state.symbol.toUpperCase() ||
      event.timeframe !== state.timeframe
    ) {
      return;
    }

    const incoming = event.bar;
    let nextBars: OHLCVBar[];
    if (state.bars.length === 0) {
      nextBars = [incoming];
    } else {
      const last = state.bars[state.bars.length - 1];
      if (incoming.time < last.time) {
        return;
      }
      if (incoming.time === last.time) {
        nextBars = [...state.bars.slice(0, -1), incoming];
      } else {
        const appended = [...state.bars, incoming];
        nextBars =
          appended.length > MAX_ULTRA_CHART_BARS
            ? appended.slice(-MAX_ULTRA_CHART_BARS)
            : appended;
      }
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const symUpper = event.symbol.toUpperCase();
    const prevLast = state.symbolInfo?.last ?? state.bars[state.bars.length - 1]?.close;
    const flashDir =
      prevLast !== undefined && incoming.close !== prevLast
        ? incoming.close > prevLast
          ? ('up' as const)
          : ('down' as const)
        : undefined;

    const patchItem = (item: SymbolInfo): SymbolInfo =>
      item.symbol.toUpperCase() === symUpper
        ? {
            ...item,
            last: incoming.close,
            dayHigh:
              item.dayHigh !== undefined ? Math.max(item.dayHigh, incoming.high) : incoming.high,
            dayLow:
              item.dayLow !== undefined ? Math.min(item.dayLow, incoming.low) : incoming.low,
            dataSource: 'live',
            updatedAt: nowIso,
          }
        : item;

    const nextAlerts = evaluateAlertsForPrice(state.alerts, symUpper, incoming.close);

    set({
      bars: nextBars,
      barsSource: 'live',
      lastDataUpdatedAt: nowIso,
      liveTickCount: state.liveTickCount + 1,
      symbolInfo: state.symbolInfo ? patchItem(state.symbolInfo) : state.symbolInfo,
      catalogSymbols: state.catalogSymbols.map(patchItem),
      watchlist: state.watchlist.map(patchItem),
      ...(nextAlerts !== state.alerts ? { alerts: nextAlerts } : {}),
      ...(flashDir
        ? {
            tickFlashBySymbol: {
              ...state.tickFlashBySymbol,
              [symUpper]: { dir: flashDir, at: nowMs },
            },
          }
        : {}),
    });
  },

  applyLiveQuoteTick: (tick) => {
    const state = get();
    if (!state.liveMarketData) return;

    const isBookOnly = tick.source === 'book';
    const hasLast =
      !isBookOnly &&
      typeof tick.last === 'number' &&
      Number.isFinite(tick.last) &&
      tick.last > 0;

    if (!hasLast && tick.bid === undefined && tick.ask === undefined) {
      return;
    }

    const symUpper = tick.symbol.toUpperCase();
    const nowMs = Date.now();
    const existingItem =
      state.catalogSymbols.find((s) => s.symbol.toUpperCase() === symUpper) ??
      state.watchlist.find((s) => s.symbol.toUpperCase() === symUpper) ??
      (state.symbolInfo?.symbol.toUpperCase() === symUpper ? state.symbolInfo : undefined);

    const prevLast = existingItem?.last;
    const tradePrice = hasLast ? (tick.last as number) : undefined;
    const flashDir =
      tradePrice !== undefined && prevLast !== undefined && tradePrice !== prevLast
        ? tradePrice > prevLast
          ? ('up' as const)
          : ('down' as const)
        : undefined;

    const mergeQuote = (item: SymbolInfo): SymbolInfo =>
      item.symbol.toUpperCase() === symUpper
        ? {
            ...item,
            last: tradePrice ?? item.last,
            change: tick.change ?? item.change,
            changePercent: tick.changePercent ?? item.changePercent,
            bid: tick.bid ?? item.bid,
            ask: tick.ask ?? item.ask,
            volume: tick.volume ?? item.volume,
            dayHigh: tick.dayHigh ?? item.dayHigh,
            dayLow: tick.dayLow ?? item.dayLow,
            marketOpen: tick.marketOpen ?? item.marketOpen,
            dataSource: 'live',
            updatedAt: tick.updatedAt,
          }
        : item;

    let nextBars = state.bars;
    const nextSeriesRevision = state.seriesRevision;
    if (tradePrice !== undefined && symUpper === state.symbol.toUpperCase() && state.bars.length > 0) {
      const lastBar = state.bars[state.bars.length - 1];
      const stepSec = TIMEFRAME_SECONDS_MAP[state.timeframe];
      const ageSec = Math.floor(nowMs / 1000) - lastBar.time;
      const isSessionOpen = tick.marketOpen !== false && state.symbolInfo?.marketOpen !== false;
      if (isSessionOpen && ageSec >= 0 && ageSec < stepSec * 2) {
        const updatedBar: OHLCVBar = {
          ...lastBar,
          close: tradePrice,
          high: Math.max(lastBar.high, tradePrice),
          low: Math.min(lastBar.low, tradePrice),
        };
        nextBars = [...state.bars.slice(0, -1), updatedBar];
      }
    }

    const nextAlerts =
      tradePrice !== undefined
        ? evaluateAlertsForPrice(state.alerts, symUpper, tradePrice)
        : state.alerts;

    set({
      bars: nextBars,
      seriesRevision: nextSeriesRevision,
      lastDataUpdatedAt: tick.updatedAt,
      liveTickCount: state.liveTickCount + 1,
      symbolInfo:
        state.symbolInfo && state.symbolInfo.symbol.toUpperCase() === symUpper
          ? mergeQuote(state.symbolInfo)
          : state.symbolInfo,
      catalogSymbols: state.catalogSymbols.map(mergeQuote),
      watchlist: state.watchlist.map(mergeQuote),
      ...(nextAlerts !== state.alerts ? { alerts: nextAlerts } : {}),
      ...(flashDir
        ? {
            tickFlashBySymbol: {
              ...state.tickFlashBySymbol,
              [symUpper]: { dir: flashDir, at: nowMs },
            },
          }
        : {}),
    });
  },

  refreshLivePrices: async () => {
    const state = get();
    if (!state.liveMarketData || state.loadingBars) return;
    const targetSymbol = state.symbol;
    const targetTimeframe = state.timeframe;

    try {
      const [ohlcvRes, detailsRes, symbolsRes] = await Promise.all([
        apiClient.getOHLCV({
          symbol: targetSymbol,
          timeframe: targetTimeframe,
          limit: 300,
          live: true,
          refresh: true,
        }),
        apiClient.getSymbolDetails(targetSymbol, undefined, true, true).catch(() => null),
        apiClient.getSymbols({ live: true, refresh: true }).catch(() => null),
      ]);

      const cur = get();
      if (cur.symbol !== targetSymbol || cur.timeframe !== targetTimeframe || !cur.liveMarketData) {
        return;
      }

      const patch: Partial<WorkspaceState> = {
        bars: mergeBarsChronological(cur.bars, ohlcvRes.bars),
        barsSource: ohlcvRes.source === 'seeded' ? 'seeded' : 'live',
        lastDataUpdatedAt: new Date().toISOString(),
        ...(cur.bars.length === 0 ? { seriesRevision: cur.seriesRevision + 1 } : {}),
      };
      if (detailsRes) {
        patch.symbolInfo = detailsRes.details;
      }
      if (symbolsRes) {
        const mergedMap = new Map<string, SymbolInfo>();
        for (const item of cur.catalogSymbols) mergedMap.set(item.symbol, item);
        for (const item of symbolsRes.symbols) mergedMap.set(item.symbol, item);
        if (detailsRes) mergedMap.set(detailsRes.details.symbol, detailsRes.details);
        const nextCatalog = Array.from(mergedMap.values());
        patch.catalogSymbols = nextCatalog;
        patch.watchlist = resolveWatchlistFromCatalog(cur.watchlistTickers, nextCatalog);
      }
      set(patch);
    } catch {
      // Keep existing chart & watchlist data intact on transient refresh errors
    }
  },

  setChartStyle: (chartStyle) => set({ chartStyle }),
  setScaleMode: (scaleMode) => set({ scaleMode }),
  setAutoScale: (autoScale) => set({ autoScale }),
  toggleAutoScale: () => set((s) => ({ autoScale: !s.autoScale })),
  setDateRange: (dateRange) => set({ dateRange }),

  setTheme: (theme) => {
    safeSetStorage(STORAGE_THEME_KEY, theme);
    applyThemeToDom(theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  setTimezone: (timezone) => set({ timezone }),
  setHoveredBar: (hoveredBar) => set({ hoveredBar }),

  addCompareSymbol: (rawSymbol) => {
    const normalized = rawSymbol.trim().toUpperCase();
    if (!normalized || normalized === get().symbol) return;
    set((s) => ({
      compareSymbols: s.compareSymbols.includes(normalized)
        ? s.compareSymbols
        : [...s.compareSymbols, normalized],
    }));
  },

  removeCompareSymbol: (rawSymbol) => {
    const normalized = rawSymbol.trim().toUpperCase();
    set((s) => ({
      compareSymbols: s.compareSymbols.filter((sym) => sym !== normalized),
    }));
  },

  loadWatchlist: async () => {
    set({ loadingWatchlist: true });
    try {
      const live = get().liveMarketData;
      const { symbols } = await apiClient.getSymbols({ live });
      const tickers = get().watchlistTickers;
      const existingSet = new Set(symbols.map((s) => s.symbol.toUpperCase()));
      const defaultSet = new Set(DEFAULT_WATCHLIST_TICKERS);
      const customMissing = tickers.filter(
        (t) => !existingSet.has(t.toUpperCase()) && !defaultSet.has(t.toUpperCase()),
      );
      let mergedCatalog = symbols;
      if (customMissing.length > 0) {
        const extra = await Promise.allSettled(
          customMissing.map((t) => apiClient.getSymbolDetails(t, undefined, live)),
        );
        const additions: SymbolInfo[] = [];
        for (const item of extra) {
          if (item.status === 'fulfilled') {
            const sym = item.value.details.symbol.toUpperCase();
            if (!existingSet.has(sym)) {
              existingSet.add(sym);
              additions.push(item.value.details);
            }
          }
        }
        if (additions.length > 0) {
          mergedCatalog = [...symbols, ...additions];
        }
      }
      const watchlist = resolveWatchlistFromCatalog(tickers, mergedCatalog);
      set({
        catalogSymbols: mergedCatalog,
        watchlist,
        loadingWatchlist: false,
      });
    } catch {
      set({ loadingWatchlist: false });
    }
  },

  addToWatchlist: async (rawSymbol) => {
    const normalized = rawSymbol.trim().toUpperCase();
    if (!normalized) return;

    let resolvedInfo = get().catalogSymbols.find(
      (item) => item.symbol.toUpperCase() === normalized,
    );

    if (!resolvedInfo) {
      try {
        const res = await apiClient.getSymbolDetails(
          normalized,
          undefined,
          get().liveMarketData,
        );
        resolvedInfo = res.details;
      } catch {
        return;
      }
    }

    const canonical = resolvedInfo.symbol.toUpperCase();
    const infoToStore = resolvedInfo;

    set((s) => {
      const nextTickers = s.watchlistTickers.includes(canonical)
        ? s.watchlistTickers
        : [...s.watchlistTickers, canonical];

      safeSetStorage(STORAGE_WATCHLIST_KEY, JSON.stringify(nextTickers));

      const nextCatalog = s.catalogSymbols.some(
        (c) => c.symbol.toUpperCase() === canonical,
      )
        ? s.catalogSymbols
        : [...s.catalogSymbols, infoToStore];

      return {
        catalogSymbols: nextCatalog,
        watchlistTickers: nextTickers,
        watchlist: resolveWatchlistFromCatalog(nextTickers, nextCatalog),
      };
    });
  },

  removeFromWatchlist: (rawSymbol) => {
    const normalized = rawSymbol.trim().toUpperCase();
    const nextTickers = get().watchlistTickers.filter(
      (t) => t.toUpperCase() !== normalized,
    );
    safeSetStorage(STORAGE_WATCHLIST_KEY, JSON.stringify(nextTickers));
    set((s) => ({
      watchlistTickers: nextTickers,
      watchlist: resolveWatchlistFromCatalog(nextTickers, s.catalogSymbols),
    }));
  },

  addIndicator: (ind) => {
    const instanceId = ind.instanceId || `${ind.id}-${++indicatorSeq}`;
    const newInd: IndicatorConfig = {
      ...ind,
      instanceId,
    };
    set((s) => ({
      indicators: [...s.indicators, newInd],
    }));
  },

  toggleIndicatorVisibility: (instanceId) => {
    set((s) => ({
      indicators: s.indicators.map((ind) =>
        ind.instanceId === instanceId ? { ...ind, visible: !ind.visible } : ind,
      ),
    }));
  },

  updateIndicatorParams: (instanceId, params) => {
    set((s) => ({
      indicators: s.indicators.map((ind) =>
        ind.instanceId === instanceId
          ? { ...ind, params: { ...ind.params, ...params } }
          : ind,
      ),
    }));
  },

  removeIndicator: (instanceId) => {
    set((s) => ({
      indicators: s.indicators.filter((ind) => ind.instanceId !== instanceId),
    }));
  },

  setActiveTool: (activeTool) =>
    set((s) => ({
      activeTool,
      selectedDrawingId: activeTool === 'crosshair' ? s.selectedDrawingId : null,
    })),

  addDrawing: (drawing) => {
    set((s) => {
      const defaults = s.defaultToolStyles[drawing.tool] ?? {};
      const merged: DrawingObject = {
        ...defaults,
        ...drawing,
        color: defaults.color ?? drawing.color,
        lineWidth: defaults.lineWidth ?? drawing.lineWidth,
        lineStyle: defaults.lineStyle ?? drawing.lineStyle,
        lineOpacity: defaults.lineOpacity ?? drawing.lineOpacity,
        borderColor: defaults.borderColor ?? drawing.borderColor,
        borderWidth: defaults.borderWidth ?? drawing.borderWidth,
        borderStyle: defaults.borderStyle ?? drawing.borderStyle,
        borderOpacity: defaults.borderOpacity ?? drawing.borderOpacity,
        showBorder: defaults.showBorder ?? drawing.showBorder,
        fillColor: defaults.fillColor ?? drawing.fillColor,
        fillOpacity: defaults.fillOpacity ?? drawing.fillOpacity,
        showFill: defaults.showFill ?? drawing.showFill,
        extendLeft: defaults.extendLeft ?? drawing.extendLeft,
        extendRight: defaults.extendRight ?? drawing.extendRight,
        showMidline: defaults.showMidline ?? drawing.showMidline,
        showPriceLabels: defaults.showPriceLabels ?? drawing.showPriceLabels,
        showStats: defaults.showStats ?? drawing.showStats,
        arrowStart: defaults.arrowStart ?? drawing.arrowStart,
        arrowEnd: defaults.arrowEnd ?? drawing.arrowEnd,
        fontSize: defaults.fontSize ?? drawing.fontSize,
        textColor: defaults.textColor ?? drawing.textColor,
        textBold: defaults.textBold ?? drawing.textBold,
        textItalic: defaults.textItalic ?? drawing.textItalic,
        textAlign: defaults.textAlign ?? drawing.textAlign,
        fibLevels: defaults.fibLevels ?? drawing.fibLevels,
        reverseFib: defaults.reverseFib ?? drawing.reverseFib,
        pitchforkStyle: defaults.pitchforkStyle ?? drawing.pitchforkStyle,
        riskAmountUsd: defaults.riskAmountUsd ?? drawing.riskAmountUsd,
        visibleTimeframes: defaults.visibleTimeframes ?? drawing.visibleTimeframes,
        accountSize: defaults.accountSize ?? drawing.accountSize,
        lotSize: defaults.lotSize ?? drawing.lotSize,
        riskMode: defaults.riskMode ?? drawing.riskMode,
        riskValue: defaults.riskValue ?? drawing.riskValue,
        leverage: defaults.leverage ?? drawing.leverage,
        pointValue: defaults.pointValue ?? drawing.pointValue,
        qtyPrecision: defaults.qtyPrecision ?? drawing.qtyPrecision,
        stopColor: defaults.stopColor ?? drawing.stopColor,
        targetColor: defaults.targetColor ?? drawing.targetColor,
        compactStats: defaults.compactStats ?? drawing.compactStats,
        alwaysShowStats: defaults.alwaysShowStats ?? drawing.alwaysShowStats,
        tickSize: defaults.tickSize ?? drawing.tickSize,
      };
      const stored = isPositionTool(merged.tool)
        ? syncPositionDrawing(merged)
        : merged;
      return {
        undoStack: pushUndoSnapshot(s.undoStack, s.drawings),
        redoStack: [],
        drawings: [...s.drawings, stored],
        selectedDrawingId: stored.id,
        activeTool: s.keepDrawing ? s.activeTool : 'crosshair',
      };
    });
  },

  updateDrawing: (id, patch, options) => {
    set((s) => ({
      ...(options?.skipUndo
        ? {}
        : {
            undoStack: pushUndoSnapshot(s.undoStack, s.drawings),
            redoStack: [],
          }),
      drawings: s.drawings.map((d) => {
        if (d.id !== id) return d;
        const next = (
          options?.replace
            ? {
                ...patch,
                points: (patch.points ?? d.points).map((p) => ({ ...p })),
              }
            : { ...d, ...patch }
        ) as DrawingObject;
        if (!isPositionTool(next.tool)) return next;

        // Three-anchor contract: points = [entry, target, stop]. Whenever the
        // caller moves points (body drag, handle drag, coordinates tab), the
        // bracket metadata must follow instead of going stale.
        const points = next.points ?? d.points;
        const withPoints =
          patch.points !== undefined
            ? {
                ...next,
                targetPrice: points[1]?.price ?? next.targetPrice,
                stopPrice: points[2]?.price ?? next.stopPrice,
              }
            : next;
        return syncPositionDrawing(withPoints);
      }),
    }));
  },

  selectDrawing: (selectedDrawingId) => set({ selectedDrawingId }),

  openDrawingSettings: (drawingSettingsId) =>
    set((s) => ({
      drawingSettingsId,
      selectedDrawingId: drawingSettingsId ?? s.selectedDrawingId,
    })),

  saveDrawingTemplate: (name, fromDrawing) => {
    const cleanName = name.trim() || `${fromDrawing.tool.toUpperCase()} Preset`;
    const tpl: DrawingStyleTemplate = {
      id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      tool: fromDrawing.tool,
      color: fromDrawing.color,
      lineWidth: fromDrawing.lineWidth ?? 2,
      lineStyle: fromDrawing.lineStyle ?? 'solid',
      lineOpacity: fromDrawing.lineOpacity,
      borderColor: fromDrawing.borderColor,
      borderWidth: fromDrawing.borderWidth,
      borderStyle: fromDrawing.borderStyle,
      borderOpacity: fromDrawing.borderOpacity,
      showBorder: fromDrawing.showBorder,
      fillColor: fromDrawing.fillColor ?? fromDrawing.color,
      fillOpacity: fromDrawing.fillOpacity ?? 0.16,
      showFill: fromDrawing.showFill !== false,
      extendLeft: fromDrawing.extendLeft,
      extendRight: fromDrawing.extendRight,
      showMidline: fromDrawing.showMidline,
      showPriceLabels: fromDrawing.showPriceLabels,
      showStats: fromDrawing.showStats,
      arrowStart: fromDrawing.arrowStart,
      arrowEnd: fromDrawing.arrowEnd,
      fontSize: fromDrawing.fontSize,
      textColor: fromDrawing.textColor,
      textBold: fromDrawing.textBold,
      textItalic: fromDrawing.textItalic,
      textAlign: fromDrawing.textAlign,
      fibLevels: fromDrawing.fibLevels ? [...fromDrawing.fibLevels] : undefined,
      reverseFib: fromDrawing.reverseFib,
      pitchforkStyle: fromDrawing.pitchforkStyle,
      riskAmountUsd: fromDrawing.riskAmountUsd,
      visibleTimeframes: fromDrawing.visibleTimeframes
        ? [...fromDrawing.visibleTimeframes]
        : undefined,
      accountSize: fromDrawing.accountSize,
      lotSize: fromDrawing.lotSize,
      riskMode: fromDrawing.riskMode,
      riskValue: fromDrawing.riskValue,
      leverage: fromDrawing.leverage,
      pointValue: fromDrawing.pointValue,
      qtyPrecision: fromDrawing.qtyPrecision,
      stopColor: fromDrawing.stopColor,
      targetColor: fromDrawing.targetColor,
      compactStats: fromDrawing.compactStats,
      alwaysShowStats: fromDrawing.alwaysShowStats,
      tickSize: fromDrawing.tickSize,
    };
    set((s) => {
      const next = [...s.drawingTemplates, tpl];
      safeSetStorage(STORAGE_DRAWING_TEMPLATES_KEY, JSON.stringify(next));
      return { drawingTemplates: next };
    });
  },

  deleteDrawingTemplate: (templateId) => {
    set((s) => {
      const next = s.drawingTemplates.filter((t) => t.id !== templateId);
      safeSetStorage(STORAGE_DRAWING_TEMPLATES_KEY, JSON.stringify(next));
      return { drawingTemplates: next };
    });
  },

  applyDrawingTemplate: (drawingId, templateId) => {
    const tpl = get().drawingTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    get().updateDrawing(drawingId, {
      color: tpl.color,
      lineWidth: tpl.lineWidth,
      lineStyle: tpl.lineStyle,
      lineOpacity: tpl.lineOpacity,
      borderColor: tpl.borderColor ?? tpl.color,
      borderWidth: tpl.borderWidth ?? tpl.lineWidth,
      borderStyle: tpl.borderStyle ?? tpl.lineStyle,
      borderOpacity: tpl.borderOpacity,
      showBorder: tpl.showBorder ?? true,
      fillColor: tpl.fillColor ?? tpl.color,
      fillOpacity: tpl.fillOpacity,
      showFill: tpl.showFill,
      extendLeft: tpl.extendLeft,
      extendRight: tpl.extendRight,
      showMidline: tpl.showMidline,
      showPriceLabels: tpl.showPriceLabels,
      showStats: tpl.showStats,
      arrowStart: tpl.arrowStart,
      arrowEnd: tpl.arrowEnd,
      fontSize: tpl.fontSize,
      textColor: tpl.textColor,
      textBold: tpl.textBold,
      textItalic: tpl.textItalic,
      textAlign: tpl.textAlign,
      ...(tpl.fibLevels ? { fibLevels: [...tpl.fibLevels] } : {}),
      ...(tpl.reverseFib !== undefined ? { reverseFib: tpl.reverseFib } : {}),
      ...(tpl.pitchforkStyle ? { pitchforkStyle: tpl.pitchforkStyle } : {}),
      ...(tpl.riskAmountUsd ? { riskAmountUsd: tpl.riskAmountUsd } : {}),
      ...(tpl.visibleTimeframes ? { visibleTimeframes: [...tpl.visibleTimeframes] } : {}),
      ...(tpl.accountSize !== undefined ? { accountSize: tpl.accountSize } : {}),
      ...(tpl.lotSize !== undefined ? { lotSize: tpl.lotSize } : {}),
      ...(tpl.riskMode ? { riskMode: tpl.riskMode } : {}),
      ...(tpl.riskValue !== undefined ? { riskValue: tpl.riskValue } : {}),
      ...(tpl.leverage !== undefined ? { leverage: tpl.leverage } : {}),
      ...(tpl.pointValue !== undefined ? { pointValue: tpl.pointValue } : {}),
      ...(tpl.qtyPrecision !== undefined ? { qtyPrecision: tpl.qtyPrecision } : {}),
      ...(tpl.stopColor ? { stopColor: tpl.stopColor } : {}),
      ...(tpl.targetColor ? { targetColor: tpl.targetColor } : {}),
      ...(tpl.compactStats !== undefined ? { compactStats: tpl.compactStats } : {}),
      ...(tpl.alwaysShowStats !== undefined
        ? { alwaysShowStats: tpl.alwaysShowStats }
        : {}),
      ...(tpl.tickSize !== undefined ? { tickSize: tpl.tickSize } : {}),
    });
  },

  setDefaultToolStyle: (tool, patch) => {
    set((s) => {
      const next = {
        ...s.defaultToolStyles,
        [tool]: { ...(s.defaultToolStyles[tool] ?? {}), ...patch },
      };
      safeSetStorage(STORAGE_DRAWING_DEFAULTS_KEY, JSON.stringify(next));
      return { defaultToolStyles: next };
    });
  },

  reorderDrawing: (id, direction) => {
    set((s) => {
      const idx = s.drawings.findIndex((d) => d.id === id);
      if (idx === -1) return s;
      const target = s.drawings[idx];
      const rest = s.drawings.filter((d) => d.id !== id);
      const nextDrawings =
        direction === 'front' ? [...rest, target] : [target, ...rest];
      return {
        undoStack: pushUndoSnapshot(s.undoStack, s.drawings),
        redoStack: [],
        drawings: nextDrawings,
      };
    });
  },

  deleteSelectedDrawing: () => {
    const selectedId = get().selectedDrawingId;
    if (!selectedId) return;
    set((s) => ({
      undoStack: pushUndoSnapshot(s.undoStack, s.drawings),
      redoStack: [],
      drawings: s.drawings.filter((d) => d.id !== selectedId),
      selectedDrawingId: null,
    }));
  },

  removeAllDrawings: () => {
    if (get().drawings.length === 0) return;
    set((s) => ({
      undoStack: pushUndoSnapshot(s.undoStack, s.drawings),
      redoStack: [],
      drawings: [],
      selectedDrawingId: null,
    }));
  },

  toggleMagnetMode: () => set((s) => ({ magnetMode: !s.magnetMode })),
  toggleKeepDrawing: () => set((s) => ({ keepDrawing: !s.keepDrawing })),
  toggleLockDrawings: () => set((s) => ({ lockDrawings: !s.lockDrawings })),
  toggleHideDrawings: () => set((s) => ({ hideDrawings: !s.hideDrawings })),

  undo: () => {
    const { undoStack, drawings, selectedDrawingId } = get();
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const nextUndo = undoStack.slice(0, -1);
    const nextRedo = pushUndoSnapshot(get().redoStack, drawings);
    const stillSelected =
      selectedDrawingId && previous.some((d) => d.id === selectedDrawingId)
        ? selectedDrawingId
        : null;
    set({
      drawings: previous,
      undoStack: nextUndo,
      redoStack: nextRedo,
      selectedDrawingId: stillSelected,
    });
  },

  redo: () => {
    const { redoStack, drawings, selectedDrawingId } = get();
    if (redoStack.length === 0) return;
    const nextSnapshot = redoStack[redoStack.length - 1];
    const nextRedo = redoStack.slice(0, -1);
    const nextUndo = pushUndoSnapshot(get().undoStack, drawings);
    const stillSelected =
      selectedDrawingId && nextSnapshot.some((d) => d.id === selectedDrawingId)
        ? selectedDrawingId
        : null;
    set({
      drawings: nextSnapshot,
      undoStack: nextUndo,
      redoStack: nextRedo,
      selectedDrawingId: stillSelected,
    });
  },

  setChartOverlay: (chartOverlay) => set({ chartOverlay }),
  setOverlayVisible: (overlayVisible) => set({ overlayVisible }),
  setAIRangeSelection: (aiRangeSelection) => set({ aiRangeSelection }),

  setConnectionStatus: (provider, status) => {
    set((s) => ({
      connectionStatuses: {
        ...s.connectionStatuses,
        [provider]: status,
      },
    }));
  },

  setConnectionStatuses: (patch) => {
    set((s) => ({
      connectionStatuses: {
        ...s.connectionStatuses,
        ...patch,
      },
    }));
  },

  setOpenCodeModels: (opencodeModels) => set({ opencodeModels }),

  setOpenCodeSelectedModel: async (model) => {
    set({ opencodeSelectedModel: model });
    try {
      await apiClient.saveConnections({
        opencode: {
          providerId: model?.providerID ?? '',
          modelId: model?.modelID ?? '',
        },
      });
    } catch {
      // Keep local selection active even if offline/unit test environment
    }
  },

  setActiveRightTab: (activeRightTab) => set({ activeRightTab }),

  toggleRightTab: (tab) => {
    set((s) => ({
      activeRightTab: s.activeRightTab === tab ? null : tab,
    }));
  },

  setRightPanelWidth: (width) => {
    set({ rightPanelWidth: Math.max(240, Math.min(480, width)) });
  },

  setBottomDrawerOpen: (bottomDrawerOpen) => set({ bottomDrawerOpen }),
  toggleBottomDrawer: () => set((s) => ({ bottomDrawerOpen: !s.bottomDrawerOpen })),

  setBottomDrawerHeight: (height) => {
    set({ bottomDrawerHeight: Math.max(140, Math.min(480, height)) });
  },

  setActiveBottomTab: (activeBottomTab) =>
    set({ activeBottomTab, bottomDrawerOpen: true }),

  openConnectionsModal: (tab) => {
    set((s) => ({
      connectionsModalOpen: true,
      connectionsTab: tab ?? s.connectionsTab,
    }));
  },

  closeConnectionsModal: () => set({ connectionsModalOpen: false }),
  setConnectionsTab: (connectionsTab) => set({ connectionsTab }),
  setSymbolSearchOpen: (symbolSearchOpen, compareMode = false) =>
    set({ symbolSearchOpen, compareModalMode: symbolSearchOpen ? compareMode : false }),
  setIndicatorsModalOpen: (indicatorsModalOpen) => set({ indicatorsModalOpen }),
  setChartSettingsOpen: (chartSettingsOpen) => set({ chartSettingsOpen }),
  setMainMenuOpen: (mainMenuOpen) => set({ mainMenuOpen }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowBidAskPill: (showBidAskPill) => set({ showBidAskPill }),

  addAlert: (alert) =>
    set((s) => ({
      alerts: [
        {
          ...alert,
          id: `alert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: new Date().toISOString(),
          triggered: false,
        },
        ...s.alerts,
      ],
    })),

  removeAlert: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

  appendAIMessage: (msg) =>
    set((s) => ({ aiMessages: [...s.aiMessages, msg] })),

  clearAIMessages: () => set({ aiMessages: [] }),
  setBqSql: (bqSql) => set({ bqSql }),
  setBqResult: (bqResult) => set({ bqResult }),
  setBqDryRun: (bqDryRun) => set({ bqDryRun }),
  setBqError: (bqError) => set({ bqError }),
  setBqLoading: (bqLoading) => set({ bqLoading }),

  setMasterPromptDraft: (masterPromptDraft) => set({ masterPromptDraft }),
  setBacktestReport: (backtestReport) =>
    set((s) => ({
      backtestReport,
      loadedStrategy: backtestReport
        ? {
            spec: backtestReport.spec,
            masterPrompt:
              s.masterPromptDraft?.masterPrompt ??
              `Approved ${backtestReport.strategyName} (${backtestReport.symbol} · ${backtestReport.timeframe})`,
            loadedAt: new Date().toISOString(),
            reportSummary: {
              totalTrades: backtestReport.all.totalTrades,
              winRatePct: backtestReport.all.percentProfitable,
              profitFactor: backtestReport.all.profitFactor,
              netProfitPercent: backtestReport.all.netProfitPercent,
              maxDrawdownPercent: backtestReport.maxDrawdownPercent,
              sharpeRatio: backtestReport.sharpeRatio,
              barCount: backtestReport.barCount,
              startTime: backtestReport.startTime,
              endTime: backtestReport.endTime,
              grade: backtestReport.scorecard?.grade,
            },
          }
        : s.loadedStrategy,
    })),

  setLoadedStrategy: (loadedStrategy) => set({ loadedStrategy }),

  startForwardTest: async (strategyOverride, aiProvider) => {
    const state = get();
    const target =
      strategyOverride ??
      state.loadedStrategy ??
      (state.masterPromptDraft
        ? {
            spec: state.masterPromptDraft.compiledSpec,
            masterPrompt: state.masterPromptDraft.masterPrompt,
            loadedAt: new Date().toISOString(),
          }
        : null);
    if (!target) return;

    set({
      loadedStrategy: target,
      forwardTestActive: true,
      forwardTestStartedAt: new Date().toISOString(),
      ...(aiProvider ? { forwardTestAiProvider: aiProvider } : {}),
      activeBottomTab: 'forward_test',
      bottomDrawerOpen: true,
    });

    try {
      const deployed = await apiClient.deployPaperBot({
        name: `Forward Demo · ${target.spec.name}`,
        symbol: target.spec.symbol || state.symbol,
        timeframe: target.spec.timeframe || state.timeframe,
        spec: target.spec,
        approvedMasterPrompt: target.masterPrompt || `Approved Forward Demo ${target.spec.name}`,
      });
      if (deployed.ok) {
        set({ paperAccount: deployed.state });
        const evalBars = state.bars.slice(-500);
        if (evalBars.length >= 10) {
          const evaluated = await apiClient.evaluatePaperBots({
            symbol: target.spec.symbol || state.symbol,
            timeframe: target.spec.timeframe || state.timeframe,
            bars: evalBars,
            livePrice: evalBars[evalBars.length - 1]?.close,
          });
          if (evaluated.ok) set({ paperAccount: evaluated.state });
        }
      }
    } catch {
      // Forward test UI still opens cleanly even if risk-gated
    }
  },

  stopForwardTest: () => set({ forwardTestActive: false }),
  setForwardTestAiProvider: (forwardTestAiProvider) => set({ forwardTestAiProvider }),
  setBacktestMarkersVisible: (backtestMarkersVisible) => set({ backtestMarkersVisible }),
  setSelectedBacktestTradeNumber: (selectedBacktestTradeNumber) =>
    set({ selectedBacktestTradeNumber }),
  setPaperAccount: (paperAccount) => set({ paperAccount }),

  refreshPaperAccount: async () => {
    try {
      const res = await apiClient.getPaperState();
      if (res.ok) set({ paperAccount: res.state });
    } catch {
      // Ignore offline/unit test initialization errors
    }
  },

  executeAIChartActions: (actions) => {
    const state = get();
    const bars = state.bars;
    const latestBar = bars[bars.length - 1];
    const firstBar = bars[Math.max(0, bars.length - 40)] ?? bars[0];

    for (const act of actions) {
      if (act.type === 'open_backtester') {
        set({ activeBottomTab: 'backtester', bottomDrawerOpen: true });
        continue;
      }
      if (act.type === 'open_autotrade') {
        set({ activeBottomTab: 'forward_test', bottomDrawerOpen: true });
        continue;
      }
      if (act.type === 'start_forward_test') {
        void get().startForwardTest();
        continue;
      }
      if (act.type === 'toggle_smc') {
        set((s) => ({ showSmcOverlay: !s.showSmcOverlay }));
        continue;
      }
      if (act.type === 'toggle_vp') {
        set((s) => ({ showVolumeProfile: !s.showVolumeProfile }));
        continue;
      }
      if (act.type === 'toggle_sessions') {
        set((s) => ({ showSessionsOverlay: !s.showSessionsOverlay }));
        continue;
      }
      if (act.type === 'start_replay') {
        get().startReplay();
        continue;
      }
      if (act.type === 'clear_drawings') {
        state.removeAllDrawings();
        continue;
      }
      if (act.type === 'switch_symbol') {
        const nextSym = String(act.payload.symbol ?? '').trim().toUpperCase();
        if (nextSym) void state.setSymbol(nextSym);
        continue;
      }
      if (act.type === 'set_timeframe') {
        const nextTf = String(act.payload.timeframe ?? '') as Timeframe;
        if (nextTf) void state.setTimeframe(nextTf);
        continue;
      }
      if (act.type === 'create_alert') {
        const price = Number(act.payload.price ?? latestBar?.close ?? 0);
        const cond = act.payload.condition === 'below' ? 'below' : 'above';
        if (price > 0) {
          state.addAlert({
            symbol: state.symbol,
            condition: cond,
            targetPrice: price,
            note: String(act.payload.note ?? act.label),
          });
        }
        continue;
      }
      if (act.type === 'add_indicator') {
        const indId = String(act.payload.id ?? 'ema') as IndicatorType;
        const pane =
          indId === 'rsi' || indId === 'macd' || indId === 'atr' || indId === 'stoch' || indId === 'adx' || indId === 'obv'
            ? 'sub'
            : 'main';
        const period = Number(act.payload.period ?? 20);
        state.addIndicator({
          id: indId,
          name: String(act.payload.name ?? indId.toUpperCase()),
          pane,
          visible: true,
          color: String(act.payload.color ?? '#2962ff'),
          params: indId === 'vwap' || indId === 'obv' ? {} : { period },
        });
        continue;
      }
      if (!latestBar) continue;
      if (act.type === 'draw_hline') {
        const price = Number(act.payload.price ?? latestBar.close);
        state.addDrawing({
          id: `ai-draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          tool: 'hline',
          symbol: state.symbol,
          timeframe: state.timeframe,
          points: [{ time: latestBar.time, price }],
          color: String(act.payload.color ?? '#f59e0b'),
          lineWidth: 1.5,
          text: String(act.payload.label ?? act.label),
          visible: true,
          locked: false,
        });
      } else if (act.type === 'draw_trendline' && firstBar) {
        state.addDrawing({
          id: `ai-draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          tool: 'trendline',
          symbol: state.symbol,
          timeframe: state.timeframe,
          points: [
            {
              time: Number(act.payload.t1 ?? firstBar.time),
              price: Number(act.payload.p1 ?? firstBar.low),
            },
            {
              time: Number(act.payload.t2 ?? latestBar.time),
              price: Number(act.payload.p2 ?? latestBar.high),
            },
          ],
          color: String(act.payload.color ?? '#2962ff'),
          lineWidth: 2,
          visible: true,
          locked: false,
        });
      } else if (act.type === 'draw_fib' && firstBar) {
        state.addDrawing({
          id: `ai-draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          tool: 'fib',
          symbol: state.symbol,
          timeframe: state.timeframe,
          points: [
            {
              time: Number(act.payload.t1 ?? firstBar.time),
              price: Number(act.payload.p1 ?? firstBar.low),
            },
            {
              time: Number(act.payload.t2 ?? latestBar.time),
              price: Number(act.payload.p2 ?? latestBar.high),
            },
          ],
          color: String(act.payload.color ?? '#f59e0b'),
          lineWidth: 1.5,
          visible: true,
          locked: false,
        });
      } else if (act.type === 'draw_position') {
        const entry = Number(act.payload.entry ?? latestBar.close);
        const side = act.payload.side === 'short' ? 'short_position' : 'long_position';
        const target = Number(
          act.payload.target ?? (side === 'long_position' ? entry * 1.04 : entry * 0.96),
        );
        const stop = Number(
          act.payload.stop ?? (side === 'long_position' ? entry * 0.98 : entry * 1.02),
        );
        const step = bars.length > 1 ? bars[bars.length - 1].time - bars[bars.length - 2].time : 3600;
        state.addDrawing({
          id: `ai-draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          tool: side,
          symbol: state.symbol,
          timeframe: state.timeframe,
          points: [
            { time: latestBar.time, price: entry },
            { time: latestBar.time + step * 10, price: target },
          ],
          stopPrice: stop,
          targetPrice: target,
          color: side === 'long_position' ? '#089981' : '#f23645',
          lineWidth: 1.5,
          visible: true,
          locked: false,
        });
      }
    }
  },

  toggleVolumeProfile: () => set((s) => ({ showVolumeProfile: !s.showVolumeProfile })),
  toggleSmcOverlay: () => set((s) => ({ showSmcOverlay: !s.showSmcOverlay })),
  toggleSessionsOverlay: () => set((s) => ({ showSessionsOverlay: !s.showSessionsOverlay })),
  setChartWhyInspectMode: (chartWhyInspectMode) => set({ chartWhyInspectMode }),
  setInspectedBarIndex: (inspectedBarIndex) => set({ inspectedBarIndex }),
  toggleBottomDrawerExpanded: () =>
    set((s) => ({ bottomDrawerExpanded: !s.bottomDrawerExpanded })),
  setGoToDateTimestamp: (goToDateTimestamp) => set({ goToDateTimestamp }),

  startReplay: (startIndex) => {
    const total = get().bars.length;
    if (total < 10) return;
    const defaultStart = Math.max(15, Math.min(total - 5, Math.floor(total * 0.72)));
    const idx =
      startIndex !== undefined
        ? Math.max(5, Math.min(total, Math.floor(startIndex)))
        : defaultStart;
    set({
      replayActive: true,
      replayIndex: idx,
      replayPlaying: false,
      seriesRevision: get().seriesRevision + 1,
    });
  },

  stopReplay: () =>
    set((s) => ({
      replayActive: false,
      replayPlaying: false,
      replayIndex: s.bars.length,
      seriesRevision: s.seriesRevision + 1,
    })),

  stepReplay: (delta = 1) => {
    const state = get();
    if (!state.replayActive) return;
    const total = state.bars.length;
    const next = Math.max(5, Math.min(total, state.replayIndex + delta));
    set({
      replayIndex: next,
      replayPlaying: next >= total ? false : state.replayPlaying,
      seriesRevision: state.seriesRevision + 1,
    });
  },

  setReplayIndex: (idx) => {
    const state = get();
    const total = Math.max(5, state.bars.length);
    set({
      replayIndex: Math.max(5, Math.min(total, Math.floor(idx))),
      seriesRevision: state.seriesRevision + 1,
    });
  },

  setReplayPlaying: (replayPlaying) => set({ replayPlaying }),
  setReplaySpeedMs: (replaySpeedMs) => set({ replaySpeedMs }),

  refreshConnectionsStatus: async () => {
    try {
      const [cfg, ocStatus] = await Promise.all([
        apiClient.getConnections(),
        apiClient.getOpenCodeStatus().catch(() => null),
      ]);
      set((s) => {
        const discoveredModels =
          ocStatus?.running && Array.isArray(ocStatus.providers)
            ? ocStatus.providers
            : s.opencodeModels;

        let resolvedSelected = s.opencodeSelectedModel;
        if (cfg.opencode.providerId && cfg.opencode.modelId) {
          resolvedSelected = {
            providerID: cfg.opencode.providerId,
            modelID: cfg.opencode.modelId,
          };
        } else if (!resolvedSelected && discoveredModels.length > 0) {
          const preferred =
            discoveredModels.find(
              (m) => m.providerID === 'opencode' && m.modelID === 'big-pickle',
            ) ??
            discoveredModels.find((m) => m.providerID === 'opencode') ??
            discoveredModels[0];
          resolvedSelected = {
            providerID: preferred.providerID,
            modelID: preferred.modelID,
          };
        }

        return {
          opencodeModels: discoveredModels,
          opencodeSelectedModel: resolvedSelected,
          connectionStatuses: {
            ...s.connectionStatuses,
            deepseek:
              cfg.deepseek?.hasApiKey && s.connectionStatuses.deepseek === 'disconnected'
                ? 'connected'
                : s.connectionStatuses.deepseek,
            byok:
              cfg.byok?.hasApiKey && s.connectionStatuses.byok === 'disconnected'
                ? 'connected'
                : s.connectionStatuses.byok,
            opencode:
              ocStatus?.running && s.connectionStatuses.opencode === 'disconnected'
                ? 'connected'
                : s.connectionStatuses.opencode,
            bigquery:
              cfg.bigquery.mode === 'sandbox'
                ? 'sandbox'
                : s.connectionStatuses.bigquery === 'connected'
                  ? 'connected'
                  : 'disconnected',
          },
        };
      });
    } catch {
      // Non-fatal during offline/unit test initialization
    }
  },
}));

// ---------------------------------------------------------------------------
// Drawing persistence
//
// Drawings previously lived only in memory, so every refresh wiped the user's
// analysis. Persist a small versioned envelope (not raw state) and debounce
// writes so high-frequency drag updates stay cheap.
// ---------------------------------------------------------------------------
let drawingsPersistTimer: ReturnType<typeof setTimeout> | null = null;

function writeDrawingsNow(): void {
  try {
    safeSetStorage(
      STORAGE_DRAWINGS_KEY,
      JSON.stringify({
        version: DRAWINGS_SCHEMA_VERSION,
        savedAt: Date.now(),
        drawings: useWorkspaceStore.getState().drawings.slice(-MAX_PERSISTED_DRAWINGS),
      }),
    );
  } catch {
    // Ignore quota / serialization failures; the chart keeps working.
  }
}

function flushDrawingsPersist(): void {
  if (drawingsPersistTimer !== null) {
    clearTimeout(drawingsPersistTimer);
    drawingsPersistTimer = null;
  }
  writeDrawingsNow();
}

if (typeof globalThis.localStorage !== 'undefined') {
  useWorkspaceStore.subscribe((state, previous) => {
    if (state.drawings === previous.drawings) return;
    if (drawingsPersistTimer !== null) clearTimeout(drawingsPersistTimer);
    drawingsPersistTimer = setTimeout(() => {
      drawingsPersistTimer = null;
      writeDrawingsNow();
    }, DRAWINGS_PERSIST_DELAY_MS);
  });

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('pagehide', flushDrawingsPersist);
  }
}
