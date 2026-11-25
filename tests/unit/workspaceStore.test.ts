import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OHLCVBar, SymbolInfo } from '../../shared/types';
import { apiClient } from '../../src/lib/apiClient';
import {
  DEFAULT_CHART_APPEARANCE,
  useChartAppearanceStore,
} from '../../src/state/chartAppearanceStore';
import { useWorkspaceStore } from '../../src/state/workspaceStore';

function resetStore() {
  useWorkspaceStore.setState({
    symbol: 'AAPL',
    symbolInfo: null,
    timeframe: '1D',
    chartStyle: 'candles',
    scaleMode: 'regular',
    autoScale: true,
    dateRange: '1Y',
    theme: 'dark',
    timezone: 'UTC',
    showGrid: true,
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
    catalogSymbols: [],
    watchlist: [],
    watchlistTickers: ['SPX', 'NDX', 'AAPL'],
    loadingWatchlist: false,
    indicators: [],
    drawings: [],
    selectedDrawingId: null,
    drawingSettingsId: null,
    defaultToolStyles: {},
    activeTool: 'crosshair',
    magnetMode: false,
    keepDrawing: false,
    lockDrawings: false,
    hideDrawings: false,
    undoStack: [],
    redoStack: [],
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
    activeRightTab: 'watchlist',
    rightPanelWidth: 300,
    bottomDrawerOpen: false,
    bottomDrawerHeight: 240,
    activeBottomTab: 'bigquery',
    connectionsModalOpen: false,
    connectionsTab: 'opencode',
    symbolSearchOpen: false,
    indicatorsModalOpen: false,
    chartSettingsOpen: false,
    mainMenuOpen: false,
  });
}

const SAMPLE_BAR: OHLCVBar = {
  time: 1795104000,
  open: 225,
  high: 230,
  low: 224,
  close: 228.5,
  volume: 1000000,
};

const SAMPLE_SYMBOL_INFO: SymbolInfo = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  exchange: 'NASDAQ',
  assetClass: 'stocks',
  last: 228.5,
  change: 2.1,
  changePercent: 0.93,
  volume: 1000000,
  avgVolume30d: 950000,
};

describe('workspaceStore', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with TradingView dark defaults in Node without DOM globals', () => {
    const state = useWorkspaceStore.getState();
    expect(state.symbol).toBe('AAPL');
    expect(state.timeframe).toBe('1D');
    expect(state.theme).toBe('dark');
    expect(state.activeRightTab).toBe('watchlist');
    expect(state.activeTool).toBe('crosshair');
    expect(state.chartStyle).toBe('candles');
    expect(state.autoScale).toBe(true);
  });

  it('toggles right sidebar tabs and collapses when clicking the active tab', () => {
    const store = useWorkspaceStore.getState();
    expect(useWorkspaceStore.getState().activeRightTab).toBe('watchlist');

    store.toggleRightTab('watchlist');
    expect(useWorkspaceStore.getState().activeRightTab).toBeNull();

    store.toggleRightTab('watchlist');
    expect(useWorkspaceStore.getState().activeRightTab).toBe('watchlist');

    store.toggleRightTab('bigquery');
    expect(useWorkspaceStore.getState().activeRightTab).toBe('bigquery');
  });

  it('updates theme safely in Node and syncs document data-theme when present', () => {
    const setAttribute = vi.fn();
    const toggle = vi.fn();
    vi.stubGlobal('document', {
      documentElement: {
        setAttribute,
        classList: { toggle },
      },
    });

    useWorkspaceStore.getState().setTheme('light');
    expect(useWorkspaceStore.getState().theme).toBe('light');
    expect(setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    expect(toggle).toHaveBeenCalledWith('dark', false);

    useWorkspaceStore.getState().toggleTheme();
    expect(useWorkspaceStore.getState().theme).toBe('dark');
    expect(setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    expect(toggle).toHaveBeenCalledWith('dark', true);

    vi.unstubAllGlobals();
  });

  it('manages drawings with undo/redo stack, keepDrawing mode, and removeAllDrawings', () => {
    const store = useWorkspaceStore.getState();
    store.setActiveTool('trendline');
    expect(useWorkspaceStore.getState().activeTool).toBe('trendline');

    store.addDrawing({
      id: 'd1',
      tool: 'trendline',
      symbol: 'AAPL',
      timeframe: '1D',
      points: [
        { time: 1000, price: 200 },
        { time: 2000, price: 210 },
      ],
      color: '#2962ff',
      visible: true,
      locked: false,
    });

    expect(useWorkspaceStore.getState().drawings).toHaveLength(1);
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(1);
    expect(useWorkspaceStore.getState().activeTool).toBe('crosshair');

    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().drawings).toHaveLength(0);
    expect(useWorkspaceStore.getState().redoStack).toHaveLength(1);

    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().drawings).toHaveLength(1);

    useWorkspaceStore.getState().toggleKeepDrawing();
    useWorkspaceStore.getState().setActiveTool('hline');
    useWorkspaceStore.getState().addDrawing({
      id: 'd2',
      tool: 'hline',
      symbol: 'AAPL',
      timeframe: '1D',
      points: [{ time: 1500, price: 205 }],
      color: '#089981',
      visible: true,
      locked: false,
    });
    expect(useWorkspaceStore.getState().activeTool).toBe('hline');
    expect(useWorkspaceStore.getState().drawings).toHaveLength(2);

    useWorkspaceStore.getState().removeAllDrawings();
    expect(useWorkspaceStore.getState().drawings).toHaveLength(0);
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().drawings).toHaveLength(2);

    // Custom style templates, per-tool defaults, and z-order reordering
    useWorkspaceStore.getState().reorderDrawing('d1', 'front');
    expect(useWorkspaceStore.getState().drawings[1].id).toBe('d1');

    const d1 = useWorkspaceStore.getState().drawings[1];
    useWorkspaceStore.getState().saveDrawingTemplate('Gold Fib Custom', d1);
    const savedTpl = useWorkspaceStore
      .getState()
      .drawingTemplates.find((t) => t.name === 'Gold Fib Custom');
    expect(savedTpl).toBeDefined();

    useWorkspaceStore.getState().setDefaultToolStyle('rect', {
      color: '#eab308',
      lineWidth: 4,
      fillOpacity: 0.3,
    });
    useWorkspaceStore.getState().addDrawing({
      id: 'd3',
      tool: 'rect',
      symbol: 'XAUUSD',
      timeframe: '1h',
      points: [
        { time: 1000, price: 2680 },
        { time: 2000, price: 2695 },
      ],
      color: '#2962ff',
      visible: true,
      locked: false,
    });
    const d3 = useWorkspaceStore.getState().drawings.find((d) => d.id === 'd3')!;
    expect(d3.color).toBe('#eab308');
    expect(d3.lineWidth).toBe(4);
    expect(d3.fillOpacity).toBe(0.3);
  });

  it('adds, updates, toggles visibility, and removes indicators', () => {
    const store = useWorkspaceStore.getState();
    store.addIndicator({
      instanceId: 'sma-1',
      id: 'sma',
      name: 'SMA',
      pane: 'main',
      visible: true,
      color: '#2962ff',
      params: { period: 20 },
    });

    expect(useWorkspaceStore.getState().indicators).toHaveLength(1);
    store.toggleIndicatorVisibility('sma-1');
    expect(useWorkspaceStore.getState().indicators[0].visible).toBe(false);

    store.updateIndicatorParams('sma-1', { period: 50 });
    expect(useWorkspaceStore.getState().indicators[0].params.period).toBe(50);

    store.removeIndicator('sma-1');
    expect(useWorkspaceStore.getState().indicators).toHaveLength(0);
  });

  it('handles chartOverlay, aiRangeSelection, and modal/connection states', () => {
    const store = useWorkspaceStore.getState();
    store.setChartOverlay({
      forecast: {
        id: 'fc-1',
        label: 'TimesFM Forecast',
        points: [{ time: 1795190400, value: 231, lowerBound: 226, upperBound: 236 }],
        confidenceLevel: 0.95,
        executionMode: 'sandbox',
      },
      anomalies: [],
    });
    expect(useWorkspaceStore.getState().chartOverlay?.forecast?.id).toBe('fc-1');

    store.setAIRangeSelection({
      symbol: 'AAPL',
      timeframe: '1D',
      startTime: 1795000000,
      endTime: 1795190400,
      barCount: 10,
    });
    expect(useWorkspaceStore.getState().aiRangeSelection?.barCount).toBe(10);

    store.setConnectionStatus('gemini', 'connected');
    expect(useWorkspaceStore.getState().connectionStatuses.gemini).toBe('connected');

    store.openConnectionsModal('bigquery');
    expect(useWorkspaceStore.getState().connectionsModalOpen).toBe(true);
    expect(useWorkspaceStore.getState().connectionsTab).toBe('bigquery');

    store.closeConnectionsModal();
    expect(useWorkspaceStore.getState().connectionsModalOpen).toBe(false);
  });

  it('prevents stale out-of-order loadChartData responses from overwriting newer requests and records errors', async () => {
    let resolveFirst!: (val: {
      symbol: string;
      timeframe: '1D';
      source: 'seeded';
      bars: OHLCVBar[];
    }) => void;
    let resolveSecond!: (val: {
      symbol: string;
      timeframe: '1D';
      source: 'seeded';
      bars: OHLCVBar[];
    }) => void;

    const getOhlcvSpy = vi
      .spyOn(apiClient, 'getOHLCV')
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveFirst = res;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSecond = res;
          }),
      );

    vi.spyOn(apiClient, 'getSymbolDetails').mockResolvedValue({
      details: SAMPLE_SYMBOL_INFO,
    });

    const p1 = useWorkspaceStore.getState().setSymbol('MSFT');
    const p2 = useWorkspaceStore.getState().setSymbol('NVDA');

    resolveSecond({
      symbol: 'NVDA',
      timeframe: '1D',
      source: 'seeded',
      bars: [{ ...SAMPLE_BAR, close: 141.2 }],
    });
    await p2;

    resolveFirst({
      symbol: 'MSFT',
      timeframe: '1D',
      source: 'seeded',
      bars: [{ ...SAMPLE_BAR, close: 418.9 }],
    });
    await p1;

    expect(getOhlcvSpy).toHaveBeenCalledTimes(2);
    expect(useWorkspaceStore.getState().symbol).toBe('NVDA');
    expect(useWorkspaceStore.getState().bars[0].close).toBe(141.2);
    expect(useWorkspaceStore.getState().loadingBars).toBe(false);

    vi.spyOn(apiClient, 'getOHLCV').mockRejectedValueOnce(new Error('Network offline'));
    await useWorkspaceStore.getState().loadChartData('NVDA', '1D');
    expect(useWorkspaceStore.getState().loadingBars).toBe(false);
    expect(useWorkspaceStore.getState().marketError).toBe('Network offline');
  });

  it('loads watchlist and resolves aliases when adding/removing symbols', async () => {
    const btcusdt: SymbolInfo = {
      ...SAMPLE_SYMBOL_INFO,
      symbol: 'BTCUSDT',
      name: 'Bitcoin / TetherUS',
      exchange: 'BINANCE',
      assetClass: 'crypto',
      last: 93800,
    };

    vi.spyOn(apiClient, 'getSymbols').mockResolvedValue({
      symbols: [SAMPLE_SYMBOL_INFO, btcusdt],
    });
    vi.spyOn(apiClient, 'getSymbolDetails').mockResolvedValue({
      details: btcusdt,
    });

    await useWorkspaceStore.getState().loadWatchlist();
    expect(useWorkspaceStore.getState().watchlist.map((w) => w.symbol)).toEqual(['AAPL']);

    await useWorkspaceStore.getState().addToWatchlist('BTCUSD');
    expect(useWorkspaceStore.getState().watchlist.map((w) => w.symbol)).toEqual([
      'AAPL',
      'BTCUSDT',
    ]);

    useWorkspaceStore.getState().removeFromWatchlist('AAPL');
    expect(useWorkspaceStore.getState().watchlist.map((w) => w.symbol)).toEqual([
      'BTCUSDT',
    ]);
  });

  it('preserves both additions when addToWatchlist is called concurrently before catalog resolves', async () => {
    const nvda: SymbolInfo = {
      ...SAMPLE_SYMBOL_INFO,
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      last: 141.2,
    };
    const tsla: SymbolInfo = {
      ...SAMPLE_SYMBOL_INFO,
      symbol: 'TSLA',
      name: 'Tesla, Inc.',
      last: 338.6,
    };

    let resolveNvda!: (val: { details: SymbolInfo }) => void;
    let resolveTsla!: (val: { details: SymbolInfo }) => void;

    vi.spyOn(apiClient, 'getSymbolDetails')
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveNvda = res;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveTsla = res;
          }),
      );

    useWorkspaceStore.setState({
      catalogSymbols: [SAMPLE_SYMBOL_INFO],
      watchlistTickers: ['AAPL'],
      watchlist: [SAMPLE_SYMBOL_INFO],
    });

    const p1 = useWorkspaceStore.getState().addToWatchlist('NVDA');
    const p2 = useWorkspaceStore.getState().addToWatchlist('TSLA');

    resolveTsla({ details: tsla });
    await p2;
    resolveNvda({ details: nvda });
    await p1;

    expect(useWorkspaceStore.getState().watchlistTickers).toEqual(['AAPL', 'TSLA', 'NVDA']);
    expect(useWorkspaceStore.getState().watchlist.map((w) => w.symbol)).toEqual([
      'AAPL',
      'TSLA',
      'NVDA',
    ]);
  });

  it('falls back to catalogSymbols or null instead of stale symbolInfo when getSymbolDetails fails', async () => {
    const nvda: SymbolInfo = {
      ...SAMPLE_SYMBOL_INFO,
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      last: 141.2,
    };

    useWorkspaceStore.setState({
      symbol: 'AAPL',
      symbolInfo: SAMPLE_SYMBOL_INFO,
      catalogSymbols: [SAMPLE_SYMBOL_INFO, nvda],
    });

    vi.spyOn(apiClient, 'getOHLCV').mockResolvedValueOnce({
      symbol: 'NVDA',
      timeframe: '1D',
      source: 'seeded',
      bars: [{ ...SAMPLE_BAR, close: 141.2 }],
    });
    vi.spyOn(apiClient, 'getSymbolDetails').mockRejectedValueOnce(new Error('Details 503'));

    await useWorkspaceStore.getState().loadChartData('NVDA', '1D');
    expect(useWorkspaceStore.getState().symbolInfo?.symbol).toBe('NVDA');

    useWorkspaceStore.setState({ catalogSymbols: [SAMPLE_SYMBOL_INFO] });
    vi.spyOn(apiClient, 'getOHLCV').mockResolvedValueOnce({
      symbol: 'TSLA',
      timeframe: '1D',
      source: 'seeded',
      bars: [{ ...SAMPLE_BAR, close: 338.6 }],
    });
    vi.spyOn(apiClient, 'getSymbolDetails').mockRejectedValueOnce(new Error('Details 503'));

    await useWorkspaceStore.getState().loadChartData('TSLA', '1D');
    expect(useWorkspaceStore.getState().symbolInfo).toBeNull();
  });

  it('applies real-time bar and quote ticks in place without bumping seriesRevision and tracks flash directions', () => {
    const initialRevision = useWorkspaceStore.getState().seriesRevision;
    const btcusdt: SymbolInfo = {
      ...SAMPLE_SYMBOL_INFO,
      symbol: 'BTCUSDT',
      name: 'Bitcoin / TetherUS',
      exchange: 'BINANCE',
      assetClass: 'crypto',
      last: 56300,
      marketOpen: true,
    };

    useWorkspaceStore.setState({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      liveMarketData: true,
      barsSource: 'live',
      symbolInfo: btcusdt,
      catalogSymbols: [SAMPLE_SYMBOL_INFO, btcusdt],
      watchlist: [SAMPLE_SYMBOL_INFO, btcusdt],
      bars: [
        { time: 1795238220, open: 56280, high: 56310, low: 56270, close: 56300, volume: 12 },
      ],
    });

    // Update current forming candle in place
    useWorkspaceStore.getState().applyLiveBarTick({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      bar: { time: 1795238220, open: 56280, high: 56340, low: 56270, close: 56335, volume: 25 },
      isClosed: false,
    });

    let state = useWorkspaceStore.getState();
    expect(state.seriesRevision).toBe(initialRevision);
    expect(state.bars).toHaveLength(1);
    expect(state.bars[0].close).toBe(56335);
    expect(state.symbolInfo?.last).toBe(56335);
    expect(state.tickFlashBySymbol['BTCUSDT']?.dir).toBe('up');

    // Append new candle when period rolls over
    useWorkspaceStore.getState().applyLiveBarTick({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      bar: { time: 1795238280, open: 56335, high: 56350, low: 56320, close: 56325, volume: 5 },
      isClosed: false,
    });
    state = useWorkspaceStore.getState();
    expect(state.bars).toHaveLength(2);
    expect(state.seriesRevision).toBe(initialRevision);
    expect(state.tickFlashBySymbol['BTCUSDT']?.dir).toBe('down');

    // Apply quote tick for a non-active watchlist symbol
    useWorkspaceStore.getState().applyLiveQuoteTick({
      symbol: 'AAPL',
      last: 230.1,
      change: 1.6,
      changePercent: 0.7,
      bid: 230.05,
      ask: 230.15,
      updatedAt: '2026-11-21T05:00:00.000Z',
    });
    state = useWorkspaceStore.getState();
    expect(state.watchlist.find((w) => w.symbol === 'AAPL')?.last).toBe(230.1);
    expect(state.tickFlashBySymbol['AAPL']?.dir).toBe('up');
    expect(state.liveTickCount).toBe(3);
  });

  it('prepends deep Ultra history via loadMoreHistory and preserves >3,000 bars during refreshLivePrices', async () => {
    const baseTime = 1795000000;
    const initial3500: OHLCVBar[] = Array.from({ length: 3500 }, (_, i) => ({
      time: baseTime + i * 60,
      open: 100 + i * 0.01,
      high: 101 + i * 0.01,
      low: 99 + i * 0.01,
      close: 100.5 + i * 0.01,
      volume: 1000 + i,
    }));

    useWorkspaceStore.setState({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      liveMarketData: false,
      bars: initial3500,
      hasMoreHistory: true,
    });

    const older2000: OHLCVBar[] = Array.from({ length: 2000 }, (_, i) => ({
      time: baseTime - (2000 - i) * 60,
      open: 90,
      high: 91,
      low: 89,
      close: 90.5,
      volume: 800,
    }));

    vi.spyOn(apiClient, 'getUltraHistory').mockResolvedValueOnce({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      source: 'seeded',
      bars: older2000,
      totalBars: 2000,
      earliestTime: older2000[0].time,
      latestTime: older2000[older2000.length - 1].time,
      hasMoreBefore: true,
    });

    const prepended = await useWorkspaceStore.getState().loadMoreHistory(2000);
    expect(prepended).toBe(2000);
    expect(useWorkspaceStore.getState().bars).toHaveLength(5500);
    expect(useWorkspaceStore.getState().bars[0].time).toBe(older2000[0].time);

    // Ensure refreshLivePrices merges trailing 60 bars without shrinking the 5,500-bar buffer
    const latest60 = initial3500.slice(-60).map((b, idx) =>
      idx === 59 ? { ...b, close: b.close + 5 } : b,
    );
    vi.spyOn(apiClient, 'getOHLCV').mockResolvedValueOnce({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      source: 'seeded',
      bars: latest60,
    });
    vi.spyOn(apiClient, 'getSymbolDetails').mockResolvedValueOnce({
      details: SAMPLE_SYMBOL_INFO,
    });
    vi.spyOn(apiClient, 'getSymbols').mockResolvedValueOnce({
      symbols: [SAMPLE_SYMBOL_INFO],
    });

    useWorkspaceStore.setState({ liveMarketData: true });
    await useWorkspaceStore.getState().refreshLivePrices();
    expect(useWorkspaceStore.getState().bars).toHaveLength(5500);
    expect(useWorkspaceStore.getState().bars[5499].close).toBe(
      initial3500[3499].close + 5,
    );
  });

  it('persists independent border, fill, text, skipUndo handle resize, and pre-draw tool selection', () => {
    const store = useWorkspaceStore.getState();

    store.setDefaultToolStyle('rect', {
      color: '#2962ff',
      lineWidth: 2,
      lineStyle: 'solid',
      borderColor: '#f59e0b',
      borderWidth: 3,
      borderStyle: 'dotted',
      showBorder: true,
      fillColor: '#089981',
      fillOpacity: 0.24,
      showFill: true,
      textColor: '#ffffff',
      textBold: true,
      textItalic: true,
    });

    store.addDrawing({
      id: 'box-1',
      tool: 'rect',
      symbol: 'XAUUSD',
      timeframe: '1h',
      points: [
        { time: 1000, price: 2650 },
        { time: 2000, price: 2680 },
      ],
      color: '#2962ff',
      visible: true,
      locked: false,
    });

    const created = useWorkspaceStore.getState().drawings[0];
    expect(created.borderColor).toBe('#f59e0b');
    expect(created.borderWidth).toBe(3);
    expect(created.borderStyle).toBe('dotted');
    expect(created.fillColor).toBe('#089981');
    expect(created.fillOpacity).toBe(0.24);
    expect(created.textColor).toBe('#ffffff');
    expect(created.textBold).toBe(true);
    expect(created.textItalic).toBe(true);
    expect(useWorkspaceStore.getState().selectedDrawingId).toBe('box-1');

    // Arming a drawing tool clears selectedDrawingId so Pre-Draw toolbar activates cleanly
    useWorkspaceStore.getState().setActiveTool('trendline');
    expect(useWorkspaceStore.getState().selectedDrawingId).toBeNull();
    useWorkspaceStore.getState().selectDrawing('box-1');
    useWorkspaceStore.getState().setActiveTool('crosshair');
    expect(useWorkspaceStore.getState().selectedDrawingId).toBe('box-1');

    // Continuous 8-handle drag updates with skipUndo do not bloat undoStack
    const undoBeforeDrag = useWorkspaceStore.getState().undoStack.length;
    useWorkspaceStore.getState().updateDrawing(
      'box-1',
      {
        points: [
          { time: 1000, price: 2650 },
          { time: 2400, price: 2705 },
        ],
      },
      { skipUndo: true },
    );
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoBeforeDrag);
    expect(useWorkspaceStore.getState().drawings[0].points[1].price).toBe(2705);

    // Custom template round-trip preserves borderStyle & fillOpacity
    useWorkspaceStore
      .getState()
      .saveDrawingTemplate('Dotted Amber Zone', useWorkspaceStore.getState().drawings[0]);
    const tpl = useWorkspaceStore
      .getState()
      .drawingTemplates.find((t) => t.name === 'Dotted Amber Zone');
    expect(tpl?.borderStyle).toBe('dotted');
    expect(tpl?.borderColor).toBe('#f59e0b');

    useWorkspaceStore.getState().updateDrawing('box-1', {
      borderStyle: 'solid',
      borderColor: '#ffffff',
    });
    useWorkspaceStore.getState().applyDrawingTemplate('box-1', tpl!.id);
    expect(useWorkspaceStore.getState().drawings[0].borderStyle).toBe('dotted');
    expect(useWorkspaceStore.getState().drawings[0].borderColor).toBe('#f59e0b');
  });

  it('manages 7-tab chartAppearanceStore settings, ICT templates, timezone/grid sync, and Cancel snapshot revert', () => {
    useChartAppearanceStore.getState().resetAppearanceDefaults();
    const snapshot = useChartAppearanceStore.getState().getSnapshot();
    expect(snapshot.bodyUpColor).toBe(DEFAULT_CHART_APPEARANCE.bodyUpColor);
    expect(snapshot.colorBasedOnPrevClose).toBe(false);

    useChartAppearanceStore.getState().updateAppearance({
      colorBasedOnPrevClose: true,
      bodyUpColor: '#2962ff',
      borderDownColor: '#ff9800',
      wickUpColor: '#00bcd4',
      precisionOverride: '4',
      timezone: 'America/New_York',
      gridMode: 'none',
    });

    expect(useChartAppearanceStore.getState().colorBasedOnPrevClose).toBe(true);
    expect(useChartAppearanceStore.getState().precisionOverride).toBe('4');
    expect(useWorkspaceStore.getState().timezone).toBe('America/New_York');
    expect(useWorkspaceStore.getState().showGrid).toBe(false);

    // Cancel revert restores pre-open snapshot and syncs workspaceStore back
    useChartAppearanceStore.getState().restoreSnapshot(snapshot);
    expect(useChartAppearanceStore.getState().colorBasedOnPrevClose).toBe(false);
    expect(useChartAppearanceStore.getState().bodyUpColor).toBe('#089981');
    expect(useWorkspaceStore.getState().timezone).toBe('UTC');
    expect(useWorkspaceStore.getState().showGrid).toBe(true);

    // Apply ICT Clean White template matching user screenshot
    useChartAppearanceStore.getState().applyChartTemplate('ict-paper-white');
    expect(useChartAppearanceStore.getState().bodyUpColor).toBe('#d1d4dc');
    expect(useChartAppearanceStore.getState().bodyDownColor).toBe('#000000');
    expect(useChartAppearanceStore.getState().borderUpColor).toBe('#000000');
    expect(useChartAppearanceStore.getState().backgroundColor).toBe('#ffffff');

    const saved = useChartAppearanceStore
      .getState()
      .saveCustomChartTemplate('Institutional Desk');
    expect(saved).not.toBeNull();
    useChartAppearanceStore.getState().deleteCustomChartTemplate(saved!.id);
    expect(
      useChartAppearanceStore
        .getState()
        .chartTemplates.some((t) => t.id === saved!.id),
    ).toBe(false);
    useChartAppearanceStore.getState().resetAppearanceDefaults();
  });
});
