import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  TEST_IDS,
  addIndicator,
  addWatchlistSymbol,
  captureChartScreenshot,
  clickRedo,
  clickUndo,
  deleteSelectedDrawing,
  drawOnChartCanvas,
  getChartCanvasBox,
  getDrawingItemIds,
  getLegendIndicatorIds,
  gotoAppAndWaitForChart,
  openIndicatorSettings,
  openRightRailTab,
  removeAllDrawings,
  removeIndicator,
  removeWatchlistSymbol,
  selectDrawingTool,
  selectWatchlistSymbol,
  switchChartStyle,
  switchSymbol,
  switchTimeframe,
  toggleDrawingModifier,
  toggleIndicatorVisibility,
  toggleTheme,
  type PageErrorTracker,
} from './helpers/testHelpers.ts';

const JUDGE_DIR = path.resolve('tests/e2e/judge-screenshots');

test.describe('R1: TradingView Core Charting & Visual Parity', () => {
  let tracker: PageErrorTracker;

  test.beforeAll(() => {
    fs.mkdirSync(JUDGE_DIR, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    tracker = await gotoAppAndWaitForChart(page);
  });

  test.afterEach(() => {
    tracker.assertNoPageErrors();
    tracker.dispose();
  });

  test('renders 5-zone TradingView dark layout geometry and toggles dark/light theme', async ({
    page,
  }) => {
    const topBox = await page.getByTestId(TEST_IDS.topToolbar).boundingBox();
    const leftBox = await page.getByTestId(TEST_IDS.leftDrawingToolbar).boundingBox();
    const mainBox = await page.getByTestId(TEST_IDS.mainChartArea).boundingBox();
    const rightPanelBox = await page.getByTestId(TEST_IDS.rightSidebarPanel).boundingBox();
    const rightRailBox = await page.getByTestId(TEST_IDS.rightIconRail).boundingBox();
    const bottomBox = await page.getByTestId(TEST_IDS.bottomRangeBar).boundingBox();

    expect(topBox).not.toBeNull();
    expect(topBox!.height).toBeGreaterThanOrEqual(34);
    expect(topBox!.height).toBeLessThanOrEqual(46);

    expect(leftBox).not.toBeNull();
    expect(leftBox!.width).toBeGreaterThanOrEqual(46);
    expect(leftBox!.width).toBeLessThanOrEqual(56);

    expect(mainBox).not.toBeNull();
    expect(mainBox!.width).toBeGreaterThan(700);
    expect(mainBox!.height).toBeGreaterThan(500);

    expect(rightPanelBox).not.toBeNull();
    expect(rightPanelBox!.width).toBeGreaterThanOrEqual(280);
    expect(rightPanelBox!.width).toBeLessThanOrEqual(320);

    expect(rightRailBox).not.toBeNull();
    expect(rightRailBox!.width).toBeGreaterThanOrEqual(42);
    expect(rightRailBox!.width).toBeLessThanOrEqual(50);

    expect(bottomBox).not.toBeNull();
    expect(bottomBox!.height).toBeGreaterThanOrEqual(34);
    expect(bottomBox!.height).toBeLessThanOrEqual(44);

    // Default dark theme on initial load
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.screenshot({
      path: path.join(JUDGE_DIR, '01-default-dark.png'),
      fullPage: true,
    });

    // Toggle to light and back to dark
    await toggleTheme(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggleTheme(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('renders candlesticks/OHLC, switches timeframes & chart styles, toggles scales and updates hover legend', async ({
    page,
  }) => {
    const initialBuf = await captureChartScreenshot(page);
    expect(initialBuf.byteLength).toBeGreaterThan(1000);

    // Timeframes: 1D -> 1h -> 5m
    await switchTimeframe(page, '1h');
    const tf1hBuf = await captureChartScreenshot(page);
    expect(tf1hBuf.equals(initialBuf)).toBe(false);

    await switchTimeframe(page, '5m');
    await expect(page.getByTestId(TEST_IDS.chartLegend)).toContainText('5m');

    // Chart styles: Hollow Candles -> Bars -> Line -> Area -> Candles
    await switchChartStyle(page, 'hollow_candles');
    await page.waitForTimeout(150);
    const hollowBuf = await captureChartScreenshot(page);
    expect(hollowBuf.equals(tf1hBuf)).toBe(false);

    await switchChartStyle(page, 'bars');
    await page.waitForTimeout(150);
    const barsBuf = await captureChartScreenshot(page);
    expect(barsBuf.equals(hollowBuf)).toBe(false);

    await switchChartStyle(page, 'line');
    await page.waitForTimeout(150);
    const lineBuf = await captureChartScreenshot(page);
    expect(lineBuf.equals(barsBuf)).toBe(false);

    await switchChartStyle(page, 'area');
    await switchChartStyle(page, 'candles');

    // Hover across chart canvas updates legend OHLCV readout
    const box = await getChartCanvasBox(page);
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45);
    await page.waitForTimeout(120);
    const legendText = (await page.getByTestId(TEST_IDS.chartLegend).textContent()) ?? '';
    expect(legendText).toMatch(/O\d+\.\d+.*H\d+\.\d+.*L\d+\.\d+.*C\d+\.\d+/);

    // Scale toggles & date range shortcuts
    await page.getByRole('button', { name: 'Logarithmic scale' }).click();
    await expect(page.getByRole('button', { name: 'Logarithmic scale' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Percent scale' }).click();
    await expect(page.getByRole('button', { name: 'Percent scale' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Percent scale' }).click();

    await page.getByTestId(TEST_IDS.bottomRangeBar).getByRole('button', { name: '1M', exact: true }).click();
    await page.getByTestId(TEST_IDS.bottomRangeBar).getByRole('button', { name: 'All', exact: true }).click();
  });

  test('filters Symbol Search modal by asset class, switches symbol, and adds/removes compare symbol', async ({
    page,
  }) => {
    await page.getByTestId(TEST_IDS.symbolSearchTrigger).click();
    const modal = page.getByTestId(TEST_IDS.symbolSearchModal);
    await expect(modal).toBeVisible();

    await page.screenshot({
      path: path.join(JUDGE_DIR, '03-symbol-search-modal.png'),
      fullPage: true,
    });

    await modal.getByRole('button', { name: 'Crypto', exact: true }).click();
    await expect(modal.getByText('BTCUSDT')).toBeVisible();

    await modal.getByRole('button', { name: 'Metals', exact: true }).click();
    await expect(modal.getByText('XAUUSD')).toBeVisible();
    await expect(modal.getByText('XAGUSD')).toBeVisible();

    await modal.getByRole('button', { name: 'Forex', exact: true }).click();
    await expect(modal.getByText('USDJPY')).toBeVisible();
    await expect(modal.getByText('GBPJPY')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    await switchSymbol(page, 'NVDA', { assetClass: 'Stocks' });
    await expect(page.getByTestId(TEST_IDS.chartLegend)).toContainText('NVDA');

    // Add comparison symbol and remove it
    await page.getByTestId(TEST_IDS.symbolSearchTrigger).click();
    await expect(modal).toBeVisible();
    await page.getByTestId(TEST_IDS.symbolSearchInput).fill('MSFT');
    await modal.getByRole('button', { name: 'Compare MSFT' }).click();
    await expect(page.getByTestId(TEST_IDS.chartLegend)).toContainText('Compare: MSFT');
    await page.getByRole('button', { name: 'Remove compare MSFT' }).click();
    await expect(page.getByTestId(TEST_IDS.chartLegend)).not.toContainText('Compare: MSFT');
  });

  test('adds, toggles visibility, edits settings, and cleanly removes overlay and sub-pane indicators', async ({
    page,
  }) => {
    const [smaId] = await addIndicator(page, 'sma', { searchQuery: 'Simple' });
    const [rsiId] = await addIndicator(page, 'rsi', { searchQuery: 'Relative' });
    const [macdId] = await addIndicator(page, 'macd', { searchQuery: 'MACD' });

    const legendIds = await getLegendIndicatorIds(page);
    expect(legendIds).toContain(smaId);
    expect(legendIds).toContain(rsiId);
    expect(legendIds).toContain(macdId);

    // Multi-pane check: canvas count > 1 when sub-panes exist
    const canvasCountWithPanes = await page
      .getByTestId(TEST_IDS.chartCanvasPane)
      .locator('canvas')
      .count();
    expect(canvasCountWithPanes).toBeGreaterThan(2);

    // Toggle visibility (Eye)
    await toggleIndicatorVisibility(page, smaId);
    await expect(page.getByTestId(TEST_IDS.legendIndicator(smaId))).toHaveClass(/opacity-50/);
    await toggleIndicatorVisibility(page, smaId);
    await expect(page.getByTestId(TEST_IDS.legendIndicator(smaId))).not.toHaveClass(/opacity-50/);

    // Edit settings (Gear): change SMA period 20 -> 50
    await openIndicatorSettings(page, smaId);
    const periodInput = page
      .getByTestId(TEST_IDS.chartLegend)
      .locator('input[type="number"]')
      .first();
    await periodInput.fill('50');
    await page.getByTestId(TEST_IDS.chartLegend).getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId(TEST_IDS.legendIndicator(smaId))).toContainText('(50)');

    // Remove sub-pane indicators cleanly
    await removeIndicator(page, macdId);
    await removeIndicator(page, rsiId);
    await removeIndicator(page, smaId);
    expect(await getLegendIndicatorIds(page)).toEqual([]);
  });

  test('creates, modifies, hides, deletes, and undoes/redoes drawing annotations alongside indicators', async ({
    page,
  }) => {
    await addIndicator(page, 'sma');
    await addIndicator(page, 'rsi');

    // Draw Trend Line (two-click)
    await drawOnChartCanvas(
      page,
      { x: 0.18, y: 0.65 },
      { x: 0.48, y: 0.35 },
      { tool: 'trendline', mode: 'two-click' },
    );
    let ids = await getDrawingItemIds(page);
    expect(ids).toHaveLength(1);
    const trendId = ids[0];

    // Draw Fib Retracement (drag)
    await drawOnChartCanvas(
      page,
      { x: 0.52, y: 0.7 },
      { x: 0.78, y: 0.3 },
      { tool: 'fib', mode: 'drag' },
    );
    ids = await getDrawingItemIds(page);
    expect(ids).toHaveLength(2);

    // Single-click Horizontal Line
    await selectDrawingTool(page, 'hline');
    const box = await getChartCanvasBox(page);
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.42);
    ids = await getDrawingItemIds(page);
    expect(ids).toHaveLength(3);

    // Draw Rectangle
    await drawOnChartCanvas(
      page,
      { x: 0.25, y: 0.3 },
      { x: 0.38, y: 0.48 },
      { tool: 'rect', mode: 'drag' },
    );
    ids = await getDrawingItemIds(page);
    expect(ids).toHaveLength(4);

    // Capture Judge Screenshot 02 with Indicators + Drawings active
    await page.screenshot({
      path: path.join(JUDGE_DIR, '02-indicators-drawings.png'),
      fullPage: true,
    });

    // Hide all & unhide all
    await toggleDrawingModifier(page, 'hide');
    expect(await getDrawingItemIds(page)).toHaveLength(0);
    await toggleDrawingModifier(page, 'hide');
    expect(await getDrawingItemIds(page)).toHaveLength(4);

    // Lock toggle + Keep Drawing toggle
    await toggleDrawingModifier(page, 'lock');
    await expect(page.getByTestId(TEST_IDS.drawToggleLock)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await toggleDrawingModifier(page, 'lock');

    // Delete currently selected drawing via floating toolbar
    await expect(page.getByTestId(TEST_IDS.drawingDeleteSelected)).toBeVisible();
    await deleteSelectedDrawing(page);
    expect(await getDrawingItemIds(page)).toHaveLength(3);

    // Undo restores deleted drawing, Redo deletes it again
    await clickUndo(page);
    expect(await getDrawingItemIds(page)).toHaveLength(4);
    await clickRedo(page);
    expect(await getDrawingItemIds(page)).toHaveLength(3);

    // Remove all + Undo restores
    await removeAllDrawings(page);
    expect(await getDrawingItemIds(page)).toHaveLength(0);
    await clickUndo(page);
    expect(await getDrawingItemIds(page)).toHaveLength(3);
    expect(ids).toContain(trendId);
  });

  test('selects symbols from watchlist, adds/removes tickers, syncs details card, and switches sidebar tabs', async ({
    page,
  }) => {
    await selectWatchlistSymbol(page, 'TSLA');
    await expect(page.getByTestId(TEST_IDS.chartLegend)).toContainText('TSLA');
    await expect(page.getByTestId(TEST_IDS.symbolDetailsCard)).toContainText('TSLA');

    await selectWatchlistSymbol(page, 'BTCUSDT');
    await expect(page.getByTestId(TEST_IDS.chartLegend)).toContainText('BTCUSDT');
    await expect(page.getByTestId(TEST_IDS.symbolDetailsCard)).toContainText('BTCUSDT');

    await addWatchlistSymbol(page, 'AMZN');
    await expect(page.getByTestId(TEST_IDS.watchlistRow('AMZN'))).toBeVisible();
    await removeWatchlistSymbol(page, 'AMZN');
    await expect(page.getByTestId(TEST_IDS.watchlistRow('AMZN'))).toBeHidden();

    // Object Tree and Alerts tabs
    await openRightRailTab(page, 'objects');
    await expect(page.getByTestId(TEST_IDS.rightSidebarPanel)).toContainText('Object Tree');

    await openRightRailTab(page, 'alerts');
    await expect(page.getByTestId(TEST_IDS.rightSidebarPanel)).toContainText('Price Alerts');

    // Collapse right sidebar panel by clicking active tab again
    await page.getByTestId(TEST_IDS.railTabAlerts).click();
    await expect(page.getByTestId(TEST_IDS.rightSidebarPanel)).toBeHidden();
    await openRightRailTab(page, 'watchlist');
    await expect(page.getByTestId(TEST_IDS.watchlistPanel)).toBeVisible();
  });

  test('loads real live market data by default and toggles between LIVE and SIM feeds cleanly', async ({
    page,
  }) => {
    const toggle = page.getByTestId('market-feed-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('LIVE');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Verify backend returns real live market data on explicit ?live=true query and default runtime
    const liveOhlcvRes = await page.request.get(
      '/api/market/ohlcv?symbol=AAPL&timeframe=1D&limit=10',
    );
    expect(liveOhlcvRes.ok()).toBe(true);
    const liveOhlcv = (await liveOhlcvRes.json()) as {
      source: string;
      bars: Array<{ close: number }>;
    };
    expect(liveOhlcv.source).toBe('live');
    expect(liveOhlcv.bars.length).toBeGreaterThan(2);

    // Toggle LIVE -> SIM and assert live=false request returns seeded data
    const simResponsePromise = page.waitForResponse(
      (res) =>
        (res.url().includes('/api/market/ohlcv') ||
          res.url().includes('/api/market/history')) &&
        res.url().includes('live=false') &&
        res.status() === 200,
    );
    await toggle.click();
    const simResponse = await simResponsePromise;
    const simPayload = (await simResponse.json()) as { source: string };
    expect(simPayload.source).toBe('seeded');
    await expect(toggle).toContainText('SIM');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId(TEST_IDS.chartLegend)).toContainText('SIM');

    // Toggle SIM -> LIVE again
    const backLivePromise = page.waitForResponse(
      (res) =>
        (res.url().includes('/api/market/ohlcv') ||
          res.url().includes('/api/market/history')) &&
        res.url().includes('live=true') &&
        res.status() === 200,
    );
    await toggle.click();
    const backLiveRes = await backLivePromise;
    const backLivePayload = (await backLiveRes.json()) as { source: string };
    expect(['live', 'ultra_hybrid']).toContain(backLivePayload.source);
    await expect(toggle).toContainText('LIVE');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Verify live SSE market stream pushes real-time bar/quote ticks on 24/7 crypto pair (BTCUSDT 1m)
    await switchSymbol(page, 'BTCUSDT');
    await switchTimeframe(page, '1m');
    await expect(page.getByTestId(TEST_IDS.chartLegend)).toContainText('Open');
    await expect(page.getByTestId('chart-feed-badge')).toContainText('LIVE');

    const streamStats = await page.evaluate(async () => {
      return await new Promise<{ events: number; types: string[] }>((resolve, reject) => {
        const es = new EventSource(
          '/api/market/stream?symbol=BTCUSDT&timeframe=1m&watchlist=BTCUSDT,ETHUSDT',
        );
        const types: string[] = [];
        const timeout = window.setTimeout(() => {
          es.close();
          reject(new Error(`Timed out waiting for live SSE market events (got ${types.join(',')})`));
        }, 12_000);

        const record = (kind: string) => {
          types.push(kind);
          if (types.filter((t) => t === 'quote' || t === 'bar').length >= 2) {
            window.clearTimeout(timeout);
            es.close();
            resolve({ events: types.length, types });
          }
        };

        es.addEventListener('bar', () => record('bar'));
        es.addEventListener('quote', () => record('quote'));
      });
    });
    expect(streamStats.events).toBeGreaterThanOrEqual(2);
  });

  test('customizes 7-tab Settings modal (Candles, Precision, Timezone, ICT template) with Cancel revert and Ok commit', async ({
    page,
  }) => {
    const beforeBuf = await captureChartScreenshot(page);

    await page.getByRole('button', { name: 'Chart settings' }).click();
    const modal = page.getByTestId('chart-settings-modal');
    await expect(modal).toBeVisible();

    // Navigate all 7 TradingView Settings tabs and assert each section renders
    const tabs = [
      ['settings-tab-symbol', 'settings-panel-symbol'],
      ['settings-tab-status_line', 'settings-panel-status_line'],
      ['settings-tab-scales', 'settings-panel-scales'],
      ['settings-tab-canvas', 'settings-panel-canvas'],
      ['settings-tab-trading', 'settings-panel-trading'],
      ['settings-tab-alerts', 'settings-panel-alerts'],
      ['settings-tab-events', 'settings-panel-events'],
    ] as const;

    for (const [tabId, panelId] of tabs) {
      await page.getByTestId(tabId).click();
      await expect(page.getByTestId(panelId)).toBeVisible();
    }

    // Return to Symbol tab and edit Candles + Data Modification
    await page.getByTestId('settings-tab-symbol').click();
    const prevCloseCheckbox = page.getByTestId('settings-prev-close-checkbox');
    await expect(prevCloseCheckbox).not.toBeChecked();
    await prevCloseCheckbox.check();
    await expect(prevCloseCheckbox).toBeChecked();

    // Change Body Up, Borders Up, and Wick Down colors via TradingView swatch popover
    await page.getByTestId('swatch-body-up').click();
    await expect(page.getByTestId('tv-color-popover')).toBeVisible();
    await page.getByTestId('color-swatch-2962ff').click();
    await page.getByTestId('tv-color-popover').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('swatch-body-up')).toHaveAttribute('title', /#2962ff/i);

    await page.getByTestId('swatch-border-up').click();
    await expect(page.getByTestId('tv-color-popover')).toBeVisible();
    await page.getByTestId('color-swatch-ff9800').click();
    await page.getByTestId('tv-color-popover').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('swatch-border-up')).toHaveAttribute('title', /#ff9800/i);

    await page.getByTestId('swatch-wick-down').click();
    await expect(page.getByTestId('tv-color-popover')).toBeVisible();
    await page.getByTestId('color-swatch-e91e63').click();
    await page.getByTestId('tv-color-popover').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('swatch-wick-down')).toHaveAttribute('title', /#e91e63/i);

    // Change Precision & Timezone
    await page.getByTestId('settings-precision-select').selectOption('4');
    await page.getByTestId('settings-timezone-select').selectOption('America/New_York');
    await expect(page.getByTestId('settings-precision-select')).toHaveValue('4');
    await expect(page.getByTestId('settings-timezone-select')).toHaveValue('America/New_York');

    // Click Cancel -> must revert pre-open snapshot cleanly
    await page.getByTestId('settings-cancel-btn').click();
    await expect(modal).toBeHidden();

    await page.getByRole('button', { name: 'Chart settings' }).click();
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('settings-prev-close-checkbox')).not.toBeChecked();
    await expect(page.getByTestId('swatch-body-up')).toHaveAttribute('title', /#089981/i);
    await expect(page.getByTestId('settings-precision-select')).toHaveValue('default');
    await expect(page.getByTestId('settings-timezone-select')).toHaveValue('UTC');

    // Apply ICT template from Template ⌄ dropdown, set Precision & Timezone, and commit via Ok
    await page.getByTestId('settings-template-btn').click();
    await expect(page.getByTestId('settings-template-menu')).toBeVisible();
    await page.getByTestId('template-option-ict-monochrome').click();
    await expect(page.getByTestId('swatch-body-up')).toHaveAttribute('title', /#d1d4dc/i);
    await expect(page.getByTestId('swatch-body-down')).toHaveAttribute('title', /#000000/i);

    await page.getByTestId('settings-precision-select').selectOption('2');
    await page.getByTestId('settings-timezone-select').selectOption('America/New_York');
    await page.getByTestId('settings-ok-btn').click();
    await expect(modal).toBeHidden();

    await page.waitForTimeout(150);
    const afterCommitBuf = await captureChartScreenshot(page);
    expect(afterCommitBuf.equals(beforeBuf)).toBe(false);

    // Reopen to confirm Ok persisted ICT template, Precision, and Timezone
    await page.getByRole('button', { name: 'Chart settings' }).click();
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('swatch-body-down')).toHaveAttribute('title', /#000000/i);
    await expect(page.getByTestId('settings-precision-select')).toHaveValue('2');
    await expect(page.getByTestId('settings-timezone-select')).toHaveValue('America/New_York');
    await page.getByTestId('settings-ok-btn').click();
  });

  test('customizes pre-draw floating style bar, line/border styles (Normal/Dashed/Dotted), border/fill popovers, 8-point resize handles, and DrawingSettingsModal', async ({
    page,
  }) => {
    const floatingBar = page.getByTestId('drawing-floating-toolbar');

    // 1. Arm Trendline -> verify Pre-Draw floating toolbar appears before drawing
    await selectDrawingTool(page, 'trendline');
    await expect(floatingBar).toBeVisible();
    await expect(floatingBar).toHaveAttribute('data-mode', 'pre-draw');
    await expect(page.getByTestId('drawing-toolbar-mode-badge')).toContainText('Pre-Draw');

    await page.getByTestId('drawing-style-dotted').click();
    await page.getByTestId('drawing-width-3').click();
    await page.getByTestId('drawing-color-popover-btn').click();
    await expect(page.getByTestId('drawing-color-popover')).toBeVisible();
    await page.getByTestId('drawing-color-swatch-ff9800').click();
    await page.getByTestId('drawing-color-popover-btn').click();

    await drawOnChartCanvas(
      page,
      { x: 0.16, y: 0.68 },
      { x: 0.44, y: 0.36 },
      { mode: 'two-click' },
    );
    await expect(floatingBar).toHaveAttribute('data-mode', 'selected');
    expect(await getDrawingItemIds(page)).toHaveLength(1);

    // 2. Arm Rectangle -> verify Pre-Draw floating toolbar configures independent Border & Fill
    await selectDrawingTool(page, 'rect');
    await expect(floatingBar).toHaveAttribute('data-mode', 'pre-draw');

    await page.getByTestId('drawing-border-popover-btn').click();
    await expect(page.getByTestId('drawing-border-popover')).toBeVisible();
    await page.getByTestId('drawing-border-swatch-f59e0b').click();
    await page.getByTestId('drawing-border-width-3').click();
    await page.getByTestId('drawing-border-style-dashed').click();
    await page.getByTestId('drawing-border-popover-btn').click();

    await page.getByTestId('drawing-fill-popover-btn').click();
    await expect(page.getByTestId('drawing-fill-popover')).toBeVisible();
    await page.getByTestId('drawing-fill-swatch-089981').click();
    await page.getByTestId('drawing-toolbar-fill-opacity-slider').fill('32');
    await page.getByTestId('drawing-fill-popover-btn').click();

    await drawOnChartCanvas(
      page,
      { x: 0.32, y: 0.34 },
      { x: 0.58, y: 0.62 },
      { mode: 'drag' },
    );
    await expect(floatingBar).toHaveAttribute('data-mode', 'selected');
    expect(await getDrawingItemIds(page)).toHaveLength(2);

    // 3. Verify all 8 resize handles (NW, N, NE, E, SE, S, SW, W) render & drag East + North handles
    for (const handleId of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
      await expect(page.getByTestId(`drawing-handle-${handleId}`)).toBeVisible();
    }

    const eastHandle = page.getByTestId('drawing-handle-e');
    const eastBefore = await eastHandle.boundingBox();
    expect(eastBefore).not.toBeNull();

    await page.mouse.move(
      eastBefore!.x + eastBefore!.width / 2,
      eastBefore!.y + eastBefore!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      eastBefore!.x + eastBefore!.width / 2 + 55,
      eastBefore!.y + eastBefore!.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const eastAfter = await eastHandle.boundingBox();
    expect(eastAfter).not.toBeNull();
    expect(eastAfter!.x).toBeGreaterThan(eastBefore!.x + 25);

    const northHandle = page.getByTestId('drawing-handle-n');
    const northBefore = await northHandle.boundingBox();
    expect(northBefore).not.toBeNull();

    await page.mouse.move(
      northBefore!.x + northBefore!.width / 2,
      northBefore!.y + northBefore!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      northBefore!.x + northBefore!.width / 2,
      northBefore!.y + northBefore!.height / 2 - 35,
      { steps: 8 },
    );
    await page.mouse.up();

    const northAfter = await northHandle.boundingBox();
    expect(northAfter).not.toBeNull();
    expect(northAfter!.y).toBeLessThan(northBefore!.y - 15);

    // Cycle border style Normal -> Dashed -> Dotted on floating bar
    await page.getByTestId('drawing-style-solid').click();
    await page.getByTestId('drawing-style-dashed').click();
    await page.getByTestId('drawing-style-dotted').click();

    // 4. Customize in DrawingSettingsModal & verify Cancel revert vs Ok commit
    await page.getByTestId('drawing-open-settings').click();
    const dModal = page.getByTestId('drawing-settings-modal');
    await expect(dModal).toBeVisible();

    await page.getByTestId('drawing-title-input').fill('Discarded Draft Name');
    await page.getByTestId('modal-border-style-solid').click();
    await page.getByTestId('drawing-settings-cancel-btn').click();
    await expect(dModal).toBeHidden();
    await expect(page.getByTestId('drawing-toolbar-mode-badge')).not.toContainText(
      'Discarded Draft Name',
    );

    await page.getByTestId('drawing-open-settings').click();
    await expect(dModal).toBeVisible();
    await expect(page.getByTestId('drawing-title-input')).toHaveValue('');
    await page.getByTestId('drawing-title-input').fill('ICT Institutional Zone');
    await page.getByTestId('modal-border-width-4').click();
    await page.getByTestId('modal-border-style-dotted').click();
    await page.getByTestId('drawing-fill-opacity-slider').fill('26');
    await page.getByTestId('drawing-settings-tab-text').click();
    await page.getByTestId('drawing-label-input').fill('Bullish OB + FVG');
    await page.getByTestId('drawing-settings-done-btn').click();
    await expect(dModal).toBeHidden();
    await expect(page.getByTestId('drawing-toolbar-mode-badge')).toContainText(
      'ICT Institutional Zone',
    );
  });
});
