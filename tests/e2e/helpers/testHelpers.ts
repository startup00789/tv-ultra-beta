import { expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page, Request, Response } from '@playwright/test';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M';
export type ChartStyle = 'candles' | 'hollow_candles' | 'bars' | 'line' | 'area';
export type ScaleMode = 'regular' | 'percent' | 'log';
export type AssetClassFilter = 'All' | 'Stocks' | 'Crypto' | 'Forex' | 'Metals' | 'Indices';
export type DrawingToolId =
  | 'crosshair'
  | 'trendline'
  | 'hline'
  | 'vline'
  | 'ray'
  | 'fib'
  | 'rect'
  | 'brush'
  | 'text'
  | 'measure'
  | 'ai-range';
export type RightRailTab = 'watchlist' | 'ai' | 'bigquery' | 'objects' | 'alerts' | 'connections';
export type ConnectionsTab = 'deepseek' | 'opencode' | 'byok' | 'gemini' | 'bigquery';
export type AIProvider = 'deepseek' | 'opencode' | 'byok' | 'gemini';
export type BigQueryPreset = 'forecast' | 'anomalies' | 'evaluate' | 'regime';

export interface ChartBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OpenCodeConfigInput {
  enabled?: boolean;
  serverUrl?: string;
  authMode?: 'none' | 'basic' | 'bearer';
  username?: string;
  secret?: string;
  providerId?: string;
  modelId?: string;
}

export interface GeminiConfigInput {
  enabled?: boolean;
  authMode?: 'apiKey';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface BigQueryConfigInput {
  mode?: 'sandbox' | 'live';
  projectId?: string;
  datasetId?: string;
  tableId?: string;
  location?: string;
  authMethod?: 'adc' | 'serviceAccount';
  credentialsPath?: string;
  credentialsJson?: string;
}

export interface ConnectionsUpdatePayload {
  deepseek?: {
    enabled?: boolean;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  byok?: {
    enabled?: boolean;
    providerName?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  opencode?: OpenCodeConfigInput;
  gemini?: GeminiConfigInput;
  bigquery?: BigQueryConfigInput;
}

export interface MaskedConnectionsResponse {
  opencode: {
    enabled: boolean;
    serverUrl: string;
    authMode: 'none' | 'basic' | 'bearer';
    username?: string;
    hasSecret?: boolean;
    secretMasked?: string;
    providerId?: string;
    modelId?: string;
  };
  gemini: {
    enabled: boolean;
    authMode?: string;
    hasApiKey?: boolean;
    apiKeyMasked?: string;
    baseUrl?: string;
    model: string;
  };
  bigquery: {
    mode: 'sandbox' | 'live';
    projectId?: string;
    datasetId?: string;
    tableId?: string;
    location?: string;
    authMethod?: string;
    hasCredentials?: boolean;
  };
}

export interface PageErrorTracker {
  readonly pageErrors: ReadonlyArray<string>;
  readonly consoleErrors: ReadonlyArray<string>;
  assertNoPageErrors(): void;
  reset(): void;
  dispose(): void;
}

export interface RecordedApiResponse {
  url: string;
  status: number;
  bodyText: string;
}

export interface NetworkRecorder {
  readonly responses: ReadonlyArray<RecordedApiResponse>;
  flush(): Promise<void>;
  clear(): void;
  dispose(): void;
}

export const TEST_IDS = {
  // 1. Layout zones (9)
  topToolbar: 'top-toolbar',
  leftDrawingToolbar: 'left-drawing-toolbar',
  mainChartArea: 'main-chart-area',
  chartCanvasPane: 'chart-canvas-pane',
  chartLegend: 'chart-legend',
  bottomRangeBar: 'bottom-range-bar',
  rightSidebarPanel: 'right-sidebar-panel',
  rightIconRail: 'right-icon-rail',
  bottomDrawer: 'bottom-drawer',

  // 2. Top toolbar (12 static + 3 parameterized = 15)
  symbolSearchTrigger: 'symbol-search-trigger',
  symbolSearchModal: 'symbol-search-modal',
  symbolSearchInput: 'symbol-search-input',
  timeframeBtn: (tf: Timeframe | string): string => `timeframe-btn-${tf}`,
  timeframeDropdownTrigger: 'timeframe-dropdown-trigger',
  chartStyleTrigger: 'chart-style-trigger',
  chartStyleOption: (style: ChartStyle | string): string => `chart-style-option-${style}`,
  indicatorsTrigger: 'indicators-trigger',
  indicatorsModal: 'indicators-modal',
  indicatorsSearchInput: 'indicators-search-input',
  indicatorOption: (id: string): string => `indicator-option-${id}`,
  undoBtn: 'undo-btn',
  redoBtn: 'redo-btn',
  themeToggleBtn: 'theme-toggle-btn',
  connectionsTrigger: 'connections-trigger',

  // 3. Legend items (4 parameterized)
  legendIndicator: (instanceId: string): string => `legend-indicator-${instanceId}`,
  legendIndicatorToggle: (instanceId: string): string =>
    `legend-indicator-toggle-${instanceId}`,
  legendIndicatorSettings: (instanceId: string): string =>
    `legend-indicator-settings-${instanceId}`,
  legendIndicatorRemove: (instanceId: string): string =>
    `legend-indicator-remove-${instanceId}`,

  // 4. Left drawing toolbar (17 static + 1 parameterized = 18)
  drawToolCrosshair: 'draw-tool-crosshair',
  drawToolTrendline: 'draw-tool-trendline',
  drawToolHline: 'draw-tool-hline',
  drawToolVline: 'draw-tool-vline',
  drawToolRay: 'draw-tool-ray',
  drawToolFib: 'draw-tool-fib',
  drawToolRect: 'draw-tool-rect',
  drawToolBrush: 'draw-tool-brush',
  drawToolText: 'draw-tool-text',
  drawToolMeasure: 'draw-tool-measure',
  drawToolAiRange: 'draw-tool-ai-range',
  drawTool: (tool: DrawingToolId): string => `draw-tool-${tool}`,
  drawToggleMagnet: 'draw-toggle-magnet',
  drawToggleKeep: 'draw-toggle-keep',
  drawToggleLock: 'draw-toggle-lock',
  drawToggleHide: 'draw-toggle-hide',
  drawRemoveAll: 'draw-remove-all',
  drawingItem: (id: string): string => `drawing-item-${id}`,
  drawingDeleteSelected: 'drawing-delete-selected',

  // 5. Right rail & Watchlist (10 static + 2 parameterized = 12)
  railTabWatchlist: 'rail-tab-watchlist',
  railTabAi: 'rail-tab-ai',
  railTabBigquery: 'rail-tab-bigquery',
  railTabObjects: 'rail-tab-objects',
  railTabAlerts: 'rail-tab-alerts',
  railTabConnections: 'rail-tab-connections',
  railTab: (tab: RightRailTab): string => `rail-tab-${tab}`,
  watchlistPanel: 'watchlist-panel',
  watchlistAddInput: 'watchlist-add-input',
  watchlistAddBtn: 'watchlist-add-btn',
  watchlistRow: (symbol: string): string => `watchlist-row-${symbol}`,
  watchlistRemove: (symbol: string): string => `watchlist-remove-${symbol}`,
  symbolDetailsCard: 'symbol-details-card',

  // 6. Connections Modal (20)
  connectionsModal: 'connections-modal',
  connTabOpencode: 'conn-tab-opencode',
  connTabGemini: 'conn-tab-gemini',
  connTabBigquery: 'conn-tab-bigquery',
  connTab: (tab: ConnectionsTab): string => `conn-tab-${tab}`,
  opencodeUrlInput: 'opencode-url-input',
  opencodeAuthMode: 'opencode-auth-mode',
  opencodeSecretInput: 'opencode-secret-input',
  opencodeTestBtn: 'opencode-test-btn',
  opencodeSaveBtn: 'opencode-save-btn',
  opencodeStatusBadge: 'opencode-status-badge',
  geminiApikeyInput: 'gemini-apikey-input',
  geminiBaseurlInput: 'gemini-baseurl-input',
  geminiModelSelect: 'gemini-model-select',
  geminiTestBtn: 'gemini-test-btn',
  geminiSaveBtn: 'gemini-save-btn',
  geminiStatusBadge: 'gemini-status-badge',
  bigqueryModeSelect: 'bigquery-mode-select',
  bigqueryProjectInput: 'bigquery-project-input',
  bigqueryTestBtn: 'bigquery-test-btn',
  bigquerySaveBtn: 'bigquery-save-btn',

  // 7. AI & BigQuery panels (14)
  aiPromptInput: 'ai-prompt-input',
  aiProviderSelect: 'ai-provider-select',
  aiSendBtn: 'ai-send-btn',
  aiResponseList: 'ai-response-list',
  aiErrorBanner: 'ai-error-banner',
  bqPresetForecast: 'bq-preset-forecast',
  bqPresetAnomalies: 'bq-preset-anomalies',
  bqPresetEvaluate: 'bq-preset-evaluate',
  bqPresetRegime: 'bq-preset-regime',
  bqPreset: (preset: BigQueryPreset): string => `bq-preset-${preset}`,
  bqSqlEditor: 'bq-sql-editor',
  bqDryrunBtn: 'bq-dryrun-btn',
  bqExecuteBtn: 'bq-execute-btn',
  bqResultsTable: 'bq-results-table',
  bqOverlayToggle: 'bq-overlay-toggle',
} as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function selectControlOption(
  page: Page,
  control: Locator,
  value: string,
): Promise<void> {
  const tagName = await control.evaluate((el) => el.tagName.toLowerCase());
  if (tagName === 'select') {
    await control.selectOption(value);
    return;
  }
  await control.click();
  const exactOptionByValue = page.getByRole('option', {
    name: new RegExp(`^${escapeRegex(value)}$`, 'i'),
  });
  if ((await exactOptionByValue.count()) > 0) {
    await exactOptionByValue.first().click();
    return;
  }
  const optionByValue = page.getByRole('option', {
    name: new RegExp(escapeRegex(value), 'i'),
  });
  if ((await optionByValue.count()) > 0) {
    await optionByValue.first().click();
    return;
  }
  await page.getByText(new RegExp(`^${escapeRegex(value)}$`, 'i')).first().click();
}

export function attachPageErrorTracker(page: Page): PageErrorTracker {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  const onPageError = (err: Error): void => {
    pageErrors.push(err.stack ?? err.message ?? String(err));
  };
  const onConsole = (msg: { type(): string; text(): string }): void => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  };

  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  return {
    get pageErrors(): ReadonlyArray<string> {
      return pageErrors;
    },
    get consoleErrors(): ReadonlyArray<string> {
      return consoleErrors;
    },
    assertNoPageErrors(): void {
      expect(
        pageErrors,
        `Expected zero uncaught page errors, observed: ${pageErrors.join('\n')}`,
      ).toEqual([]);
    },
    reset(): void {
      pageErrors.length = 0;
      consoleErrors.length = 0;
    },
    dispose(): void {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    },
  };
}

export async function waitForChartReady(
  page: Page,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const timeout = options.timeoutMs ?? 15_000;
  const mainArea = page.getByTestId(TEST_IDS.mainChartArea);
  const canvasPane = page.getByTestId(TEST_IDS.chartCanvasPane);
  const legend = page.getByTestId(TEST_IDS.chartLegend);

  await expect(mainArea).toBeVisible({ timeout });
  await expect(canvasPane).toBeVisible({ timeout });
  await expect(legend).toBeVisible({ timeout });

  await expect
    .poll(
      async () => {
        const paneBox = await canvasPane.boundingBox();
        if (!paneBox || paneBox.width <= 0 || paneBox.height <= 0) {
          return false;
        }
        const canvases = canvasPane.locator('canvas');
        const count = await canvases.count();
        for (let i = 0; i < count; i += 1) {
          const box = await canvases.nth(i).boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            return true;
          }
        }
        return false;
      },
      {
        timeout,
        message: 'Expected chart-canvas-pane and an internal <canvas> to have non-zero dimensions',
      },
    )
    .toBe(true);

  await expect
    .poll(
      async () => /O\d+/.test((await legend.textContent()) ?? ''),
      {
        timeout,
        message: 'Expected chart-legend to render OHLCV values once initial bars load',
      },
    )
    .toBe(true);
}

export async function gotoAppAndWaitForChart(
  page: Page,
  options: { timeoutMs?: number } = {},
): Promise<PageErrorTracker> {
  const tracker = attachPageErrorTracker(page);
  await page.goto('/');
  await waitForChartReady(page, options);
  return tracker;
}

export async function getChartCanvasBox(page: Page): Promise<ChartBox> {
  const canvasPane = page.getByTestId(TEST_IDS.chartCanvasPane);
  const paneBox = await canvasPane.boundingBox();
  if (paneBox && paneBox.width > 0 && paneBox.height > 0) {
    return paneBox;
  }
  const firstCanvas = canvasPane.locator('canvas').first();
  const canvasBox = await firstCanvas.boundingBox();
  if (canvasBox && canvasBox.width > 0 && canvasBox.height > 0) {
    return canvasBox;
  }
  throw new Error('Chart canvas pane has no visible non-zero bounding box');
}

export async function captureChartScreenshot(page: Page): Promise<Buffer> {
  return page.getByTestId(TEST_IDS.chartCanvasPane).screenshot();
}

export async function switchSymbol(
  page: Page,
  symbol: string,
  options: { assetClass?: AssetClassFilter; timeoutMs?: number } = {},
): Promise<void> {
  const timeout = options.timeoutMs ?? 10_000;
  await page.getByTestId(TEST_IDS.symbolSearchTrigger).click();
  const modal = page.getByTestId(TEST_IDS.symbolSearchModal);
  await expect(modal).toBeVisible({ timeout });

  if (options.assetClass) {
    const filterBtn = modal.getByRole('button', {
      name: new RegExp(`^${escapeRegex(options.assetClass)}$`, 'i'),
    });
    if ((await filterBtn.count()) > 0) {
      await filterBtn.first().click();
    }
  }

  const input = page.getByTestId(TEST_IDS.symbolSearchInput);
  await input.fill(symbol);

  const exactMatcher = new RegExp(`\\b${escapeRegex(symbol)}\\b`, 'i');
  const rowCandidate = modal
    .locator('[role="option"], [role="row"], button, li, tr')
    .filter({ hasText: exactMatcher })
    .first();

  await expect(rowCandidate).toBeVisible({ timeout });
  await rowCandidate.click();
  await expect(modal).toBeHidden({ timeout });

  await expect
    .poll(
      async () => {
        const legendText = (await page.getByTestId(TEST_IDS.chartLegend).textContent()) ?? '';
        const triggerText =
          (await page.getByTestId(TEST_IDS.symbolSearchTrigger).textContent()) ?? '';
        return exactMatcher.test(legendText) || exactMatcher.test(triggerText);
      },
      { timeout, message: `Expected active symbol to switch to ${symbol}` },
    )
    .toBe(true);
}

export async function switchTimeframe(page: Page, tf: Timeframe): Promise<void> {
  const directBtn = page.getByTestId(TEST_IDS.timeframeBtn(tf));
  const alreadyActive =
    (await directBtn.count()) > 0 &&
    ((await directBtn.first().getAttribute('aria-pressed')) === 'true' ||
      (await directBtn.first().getAttribute('data-active')) === 'true');

  const ohlcvPromise = alreadyActive
    ? Promise.resolve(null)
    : page
        .waitForResponse(
          (res) =>
            (res.url().includes('/api/market/ohlcv') ||
              res.url().includes('/api/market/history')) &&
            res.url().includes(`timeframe=${encodeURIComponent(tf)}`) &&
            res.status() === 200,
          { timeout: 10_000 },
        )
        .catch(() => null);

  if ((await directBtn.count()) > 0 && (await directBtn.first().isVisible())) {
    await directBtn.first().click();
  } else {
    await page.getByTestId(TEST_IDS.timeframeDropdownTrigger).click();
    const dropdownBtn = page.getByTestId(TEST_IDS.timeframeBtn(tf));
    if ((await dropdownBtn.count()) > 0 && (await dropdownBtn.first().isVisible())) {
      await dropdownBtn.first().click();
    } else {
      await page
        .getByRole('menuitem', { name: new RegExp(`^${escapeRegex(tf)}$`, 'i') })
        .or(page.getByRole('option', { name: new RegExp(`^${escapeRegex(tf)}$`, 'i') }))
        .or(page.getByRole('button', { name: new RegExp(`^${escapeRegex(tf)}$`, 'i') }))
        .first()
        .click();
    }
  }

  await ohlcvPromise;

  await expect
    .poll(
      async () => {
        const legendText = (await page.getByTestId(TEST_IDS.chartLegend).textContent()) ?? '';
        const btn = page.getByTestId(TEST_IDS.timeframeBtn(tf)).first();
        const isActiveAttr =
          (await btn.count()) > 0
            ? (await btn.getAttribute('aria-pressed')) === 'true' ||
              (await btn.getAttribute('data-active')) === 'true'
            : false;
        return (
          (isActiveAttr || new RegExp(`\\b${escapeRegex(tf)}\\b`).test(legendText)) &&
          /O\d+/.test(legendText)
        );
      },
      { timeout: 10_000, message: `Expected timeframe to switch to ${tf}` },
    )
    .toBe(true);
}

export async function switchChartStyle(page: Page, style: ChartStyle): Promise<void> {
  await page.getByTestId(TEST_IDS.chartStyleTrigger).click();
  const option = page.getByTestId(TEST_IDS.chartStyleOption(style));
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();
}

export async function getLegendIndicatorIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-testid^="legend-indicator-"]'));
    const ids: string[] = [];
    const seen = new Set<string>();
    const pattern = /^legend-indicator-(?!toggle-|settings-|remove-)(.+)$/;
    for (const node of nodes) {
      const testId = node.getAttribute('data-testid');
      if (!testId) {
        continue;
      }
      const match = testId.match(pattern);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        ids.push(match[1]);
      }
    }
    return ids;
  });
}

export async function addIndicator(
  page: Page,
  indicatorId: string,
  options: { searchQuery?: string; closeModal?: boolean } = {},
): Promise<string[]> {
  const beforeIds = new Set(await getLegendIndicatorIds(page));

  await page.getByTestId(TEST_IDS.indicatorsTrigger).click();
  const modal = page.getByTestId(TEST_IDS.indicatorsModal);
  await expect(modal).toBeVisible({ timeout: 5_000 });

  if (options.searchQuery !== undefined) {
    await page.getByTestId(TEST_IDS.indicatorsSearchInput).fill(options.searchQuery);
  }

  const option = page.getByTestId(TEST_IDS.indicatorOption(indicatorId));
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();

  if (options.closeModal !== false && (await modal.isVisible())) {
    await page.keyboard.press('Escape');
    if (await modal.isVisible()) {
      const closeBtn = modal.getByRole('button', { name: /close|done|×/i });
      if ((await closeBtn.count()) > 0) {
        await closeBtn.first().click();
      }
    }
  }

  let addedIds: string[] = [];
  await expect
    .poll(
      async () => {
        const currentIds = await getLegendIndicatorIds(page);
        addedIds = currentIds.filter((id) => !beforeIds.has(id));
        return addedIds.length > 0;
      },
      {
        timeout: 10_000,
        message: `Expected indicator ${indicatorId} to add a new legend-indicator-<instanceId>`,
      },
    )
    .toBe(true);

  return addedIds;
}

export async function toggleIndicatorVisibility(
  page: Page,
  instanceId: string,
): Promise<void> {
  await page.getByTestId(TEST_IDS.legendIndicatorToggle(instanceId)).click();
}

export async function openIndicatorSettings(page: Page, instanceId: string): Promise<void> {
  await page.getByTestId(TEST_IDS.legendIndicatorSettings(instanceId)).click();
}

export async function removeIndicator(page: Page, instanceId: string): Promise<void> {
  await page.getByTestId(TEST_IDS.legendIndicatorRemove(instanceId)).click();
  await expect(page.getByTestId(TEST_IDS.legendIndicator(instanceId))).toBeHidden({
    timeout: 5_000,
  });
}

export async function selectDrawingTool(page: Page, tool: DrawingToolId): Promise<void> {
  await page.getByTestId(TEST_IDS.drawTool(tool)).click();
}

export async function drawOnChartCanvas(
  page: Page,
  fromRel: { x: number; y: number },
  toRel: { x: number; y: number },
  options: { tool?: DrawingToolId; mode?: 'two-click' | 'drag'; steps?: number } = {},
): Promise<void> {
  if (options.tool) {
    await selectDrawingTool(page, options.tool);
  }
  const box = await getChartCanvasBox(page);
  const x1 = box.x + box.width * fromRel.x;
  const y1 = box.y + box.height * fromRel.y;
  const x2 = box.x + box.width * toRel.x;
  const y2 = box.y + box.height * toRel.y;
  const steps = options.steps ?? 8;
  const mode = options.mode ?? 'two-click';

  if (mode === 'drag') {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps });
    await page.mouse.up();
    return;
  }

  await page.mouse.move(x1, y1);
  await page.mouse.click(x1, y1);
  await page.mouse.move(x2, y2, { steps });
  await page.mouse.click(x2, y2);
}

export async function getDrawingItemIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-testid^="drawing-item-"]'));
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      const testId = node.getAttribute('data-testid');
      if (!testId) {
        continue;
      }
      const id = testId.slice('drawing-item-'.length);
      if (id.length > 0 && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  });
}

export async function toggleDrawingModifier(
  page: Page,
  modifier: 'magnet' | 'keep' | 'lock' | 'hide',
): Promise<void> {
  const testIdMap: Record<'magnet' | 'keep' | 'lock' | 'hide', string> = {
    magnet: TEST_IDS.drawToggleMagnet,
    keep: TEST_IDS.drawToggleKeep,
    lock: TEST_IDS.drawToggleLock,
    hide: TEST_IDS.drawToggleHide,
  };
  await page.getByTestId(testIdMap[modifier]).click();
}

export async function removeAllDrawings(page: Page): Promise<void> {
  await page.getByTestId(TEST_IDS.drawRemoveAll).click();
}

export async function deleteSelectedDrawing(page: Page): Promise<void> {
  await page.getByTestId(TEST_IDS.drawingDeleteSelected).click();
}

export async function clickUndo(page: Page): Promise<void> {
  await page.getByTestId(TEST_IDS.undoBtn).click();
}

export async function clickRedo(page: Page): Promise<void> {
  await page.getByTestId(TEST_IDS.redoBtn).click();
}

export async function toggleTheme(page: Page): Promise<void> {
  await page.getByTestId(TEST_IDS.themeToggleBtn).click();
}

export async function openRightRailTab(page: Page, tab: RightRailTab): Promise<void> {
  if (tab === 'connections') {
    const modal = page.getByTestId(TEST_IDS.connectionsModal);
    if (!(await modal.isVisible())) {
      await page.getByTestId(TEST_IDS.railTabConnections).click();
    }
    await expect(modal).toBeVisible({ timeout: 5_000 });
    return;
  }

  const sidebar = page.getByTestId(TEST_IDS.rightSidebarPanel);
  const tabBtn = page.getByTestId(TEST_IDS.railTab(tab));

  const sidebarVisible = await sidebar.isVisible();
  const isTabActive =
    (await tabBtn.getAttribute('aria-selected')) === 'true' ||
    (await tabBtn.getAttribute('aria-pressed')) === 'true' ||
    (await tabBtn.getAttribute('data-active')) === 'true';

  const tabContentAlreadyVisible =
    sidebarVisible &&
    ((tab === 'watchlist' && (await sidebar.getByTestId(TEST_IDS.watchlistPanel).isVisible())) ||
      (tab === 'ai' && (await sidebar.getByTestId(TEST_IDS.aiPromptInput).isVisible())) ||
      (tab === 'bigquery' && (await sidebar.getByTestId(TEST_IDS.bqSqlEditor).isVisible())) ||
      isTabActive);

  if (!tabContentAlreadyVisible) {
    await tabBtn.click();
  }

  await expect(sidebar).toBeVisible({ timeout: 5_000 });
}

export async function selectWatchlistSymbol(page: Page, symbol: string): Promise<void> {
  await openRightRailTab(page, 'watchlist');
  const row = page.getByTestId(TEST_IDS.watchlistRow(symbol));
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.click();
}

export async function addWatchlistSymbol(page: Page, symbol: string): Promise<void> {
  await openRightRailTab(page, 'watchlist');
  await page.getByTestId(TEST_IDS.watchlistAddInput).fill(symbol);
  await page.getByTestId(TEST_IDS.watchlistAddBtn).click();
  await expect(page.getByTestId(TEST_IDS.watchlistRow(symbol))).toBeVisible({ timeout: 5_000 });
}

export async function removeWatchlistSymbol(page: Page, symbol: string): Promise<void> {
  await openRightRailTab(page, 'watchlist');
  const row = page.getByTestId(TEST_IDS.watchlistRow(symbol));
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.hover();
  await page.getByTestId(TEST_IDS.watchlistRemove(symbol)).click();
  await expect(row).toBeHidden({ timeout: 5_000 });
}

export async function openConnectionsModal(
  page: Page,
  tab?: ConnectionsTab,
): Promise<void> {
  const modal = page.getByTestId(TEST_IDS.connectionsModal);
  if (!(await modal.isVisible())) {
    await page.getByTestId(TEST_IDS.connectionsTrigger).click();
  }
  await expect(modal).toBeVisible({ timeout: 5_000 });
  if (tab) {
    await page.getByTestId(TEST_IDS.connTab(tab)).click();
  }
}

export async function configureOpenCodeViaUI(
  page: Page,
  config: {
    serverUrl: string;
    authMode?: 'none' | 'basic' | 'bearer';
    secret?: string;
    save?: boolean;
    test?: boolean;
  },
): Promise<void> {
  await openConnectionsModal(page, 'opencode');
  await page.getByTestId(TEST_IDS.opencodeUrlInput).fill(config.serverUrl);

  if (config.authMode !== undefined) {
    await selectControlOption(
      page,
      page.getByTestId(TEST_IDS.opencodeAuthMode),
      config.authMode,
    );
  }

  if (config.secret !== undefined) {
    await page.getByTestId(TEST_IDS.opencodeSecretInput).fill(config.secret);
  }

  if (config.save !== false) {
    const savePromise = page.waitForResponse(
      (res) => res.url().includes('/api/connections') && res.request().method() === 'POST',
    );
    await page.getByTestId(TEST_IDS.opencodeSaveBtn).click();
    await savePromise;
  }

  if (config.test) {
    const testPromise = page.waitForResponse(
      (res) => res.url().includes('/api/opencode/test') && res.request().method() === 'POST',
    );
    await page.getByTestId(TEST_IDS.opencodeTestBtn).click();
    await testPromise;
  }
}

export async function configureGeminiViaUI(
  page: Page,
  config: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    save?: boolean;
    test?: boolean;
  },
): Promise<void> {
  await openConnectionsModal(page, 'gemini');

  if (config.apiKey !== undefined) {
    await page.getByTestId(TEST_IDS.geminiApikeyInput).fill(config.apiKey);
  }
  if (config.baseUrl !== undefined) {
    await page.getByTestId(TEST_IDS.geminiBaseurlInput).fill(config.baseUrl);
  }
  if (config.model !== undefined) {
    await selectControlOption(
      page,
      page.getByTestId(TEST_IDS.geminiModelSelect),
      config.model,
    );
  }

  if (config.save !== false) {
    const savePromise = page.waitForResponse(
      (res) => res.url().includes('/api/connections') && res.request().method() === 'POST',
    );
    await page.getByTestId(TEST_IDS.geminiSaveBtn).click();
    await savePromise;
  }

  if (config.test) {
    const testPromise = page.waitForResponse(
      (res) => res.url().includes('/api/gemini/test') && res.request().method() === 'POST',
    );
    await page.getByTestId(TEST_IDS.geminiTestBtn).click();
    await testPromise;
  }
}

export async function configureBigQueryViaUI(
  page: Page,
  config: {
    mode?: 'sandbox' | 'live';
    projectId?: string;
    save?: boolean;
    test?: boolean;
  },
): Promise<void> {
  await openConnectionsModal(page, 'bigquery');

  if (config.mode !== undefined) {
    await selectControlOption(
      page,
      page.getByTestId(TEST_IDS.bigqueryModeSelect),
      config.mode,
    );
  }
  if (config.projectId !== undefined) {
    await page.getByTestId(TEST_IDS.bigqueryProjectInput).fill(config.projectId);
  }

  if (config.save !== false) {
    const savePromise = page.waitForResponse(
      (res) => res.url().includes('/api/connections') && res.request().method() === 'POST',
    );
    await page.getByTestId(TEST_IDS.bigquerySaveBtn).click();
    await savePromise;
  }

  if (config.test) {
    const testPromise = page.waitForResponse(
      (res) => res.url().includes('/api/bigquery/test') && res.request().method() === 'POST',
    );
    await page.getByTestId(TEST_IDS.bigqueryTestBtn).click();
    await testPromise;
  }
}

export async function configureConnectionsViaAPI(
  request: APIRequestContext,
  payload: ConnectionsUpdatePayload,
): Promise<MaskedConnectionsResponse> {
  const res = await request.post('/api/connections', { data: payload });
  expect(res.ok(), `POST /api/connections failed with status ${res.status()}`).toBe(true);
  return (await res.json()) as MaskedConnectionsResponse;
}

export async function getConnectionsViaAPI(
  request: APIRequestContext,
): Promise<MaskedConnectionsResponse> {
  const res = await request.get('/api/connections');
  expect(res.ok(), `GET /api/connections failed with status ${res.status()}`).toBe(true);
  return (await res.json()) as MaskedConnectionsResponse;
}

export async function resetConnections(request: APIRequestContext): Promise<void> {
  await configureConnectionsViaAPI(request, {
    deepseek: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    },
    byok: {
      enabled: false,
      providerName: 'OpenRouter',
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'deepseek/deepseek-chat',
    },
    opencode: {
      enabled: false,
      serverUrl: 'http://127.0.0.1:4096',
      authMode: 'none',
      username: 'opencode',
      secret: '',
      providerId: '',
      modelId: '',
    },
    gemini: {
      enabled: false,
      authMode: 'apiKey',
      apiKey: '',
      baseUrl: '',
      model: 'gemini-3.8-flash',
    },
    bigquery: {
      mode: 'sandbox',
      projectId: '',
      datasetId: 'market_analytics',
      tableId: 'ohlcv_bars',
      location: 'US',
      authMethod: 'adc',
      credentialsPath: '',
      credentialsJson: '',
    },
  });
}

export async function invokeAIAssistant(
  page: Page,
  options: { provider: AIProvider; prompt: string; expectError?: boolean },
): Promise<{ responseText: string; errorText: string | null }> {
  await openRightRailTab(page, 'ai');
  await selectControlOption(
    page,
    page.getByTestId(TEST_IDS.aiProviderSelect),
    options.provider,
  );
  await page.getByTestId(TEST_IDS.aiPromptInput).fill(options.prompt);

  const invokePattern =
    options.provider === 'opencode'
      ? '/api/opencode/invoke'
      : options.provider === 'gemini'
        ? '/api/gemini/invoke'
        : '/api/ai/invoke';
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes(invokePattern) && res.request().method() === 'POST',
  );

  await page.getByTestId(TEST_IDS.aiSendBtn).click();
  await responsePromise;

  const errorBanner = page.getByTestId(TEST_IDS.aiErrorBanner);
  const responseList = page.getByTestId(TEST_IDS.aiResponseList);

  if (options.expectError) {
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    return {
      responseText: (await responseList.textContent()) ?? '',
      errorText: (await errorBanner.textContent()) ?? '',
    };
  }

  await expect
    .poll(
      async () => {
        const errVisible = await errorBanner.isVisible();
        const text = ((await responseList.textContent()) ?? '').trim();
        return errVisible || text.length > 0;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const errVisible = await errorBanner.isVisible();
  return {
    responseText: (await responseList.textContent()) ?? '',
    errorText: errVisible ? ((await errorBanner.textContent()) ?? '') : null,
  };
}

export async function openBigQueryPanel(page: Page): Promise<void> {
  await openRightRailTab(page, 'bigquery');
  await expect(page.getByTestId(TEST_IDS.bqSqlEditor)).toBeVisible({ timeout: 5_000 });
}

export async function runBigQueryPreset(
  page: Page,
  preset: BigQueryPreset,
  options: { autoExecuteIfNeeded?: boolean } = {},
): Promise<void> {
  await openBigQueryPanel(page);

  let requestDispatched = false;
  let responseSettled = false;
  let resolveExec!: () => void;
  const execSettledPromise = new Promise<void>((resolve) => {
    resolveExec = resolve;
  });

  const onRequest = (req: Request): void => {
    if (req.url().includes('/api/bigquery/execute') && req.method() === 'POST') {
      requestDispatched = true;
    }
  };
  const onResponse = (res: Response): void => {
    if (res.url().includes('/api/bigquery/execute') && res.request().method() === 'POST') {
      requestDispatched = true;
      responseSettled = true;
      resolveExec();
    }
  };
  const onRequestFailed = (req: Request): void => {
    if (req.url().includes('/api/bigquery/execute') && req.method() === 'POST') {
      requestDispatched = true;
      responseSettled = true;
      resolveExec();
    }
  };

  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  try {
    await page.getByTestId(TEST_IDS.bqPreset(preset)).click();
    if (!requestDispatched) {
      await page.waitForTimeout(50);
    }

    if (requestDispatched) {
      if (!responseSettled) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            execSettledPromise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(new Error('Timed out waiting for BigQuery preset execution response'));
              }, 15_000);
            }),
          ]);
        } finally {
          if (timer !== undefined) {
            clearTimeout(timer);
          }
        }
      }
      await expect(page.getByTestId(TEST_IDS.bqResultsTable)).toBeVisible({ timeout: 10_000 });
    } else if (options.autoExecuteIfNeeded !== false) {
      const execPromise = page.waitForResponse(
        (res) => res.url().includes('/api/bigquery/execute') && res.request().method() === 'POST',
      );
      await page.getByTestId(TEST_IDS.bqExecuteBtn).click();
      await execPromise;
    }
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
  }

  await expect(page.getByTestId(TEST_IDS.bqResultsTable)).toBeVisible({ timeout: 10_000 });
}

export async function dryRunBigQuerySQL(page: Page, sql?: string): Promise<void> {
  await openBigQueryPanel(page);
  if (sql !== undefined) {
    await page.getByTestId(TEST_IDS.bqSqlEditor).fill(sql);
  }
  const dryRunPromise = page.waitForResponse(
    (res) => res.url().includes('/api/bigquery/dry-run') && res.request().method() === 'POST',
  );
  await page.getByTestId(TEST_IDS.bqDryrunBtn).click();
  await dryRunPromise;
}

export async function executeBigQuerySQL(page: Page, sql?: string): Promise<void> {
  await openBigQueryPanel(page);
  if (sql !== undefined) {
    await page.getByTestId(TEST_IDS.bqSqlEditor).fill(sql);
  }
  const executePromise = page.waitForResponse(
    (res) => res.url().includes('/api/bigquery/execute') && res.request().method() === 'POST',
  );
  await page.getByTestId(TEST_IDS.bqExecuteBtn).click();
  await executePromise;
}

export async function toggleBigQueryOverlay(page: Page): Promise<void> {
  await openBigQueryPanel(page);
  await page.getByTestId(TEST_IDS.bqOverlayToggle).click();
}

export function attachNetworkRecorder(page: Page): NetworkRecorder {
  const responses: RecordedApiResponse[] = [];
  const inFlight = new Set<Promise<void>>();

  const onResponse = (res: Response): void => {
    const url = res.url();
    if (!url.includes('/api/')) {
      return;
    }
    const contentType = (res.headers()['content-type'] ?? '').toLowerCase();
    if (
      contentType.startsWith('image/') ||
      contentType.startsWith('font/') ||
      contentType === 'application/octet-stream' ||
      contentType.includes('text/event-stream')
    ) {
      return;
    }
    const task = (async (): Promise<void> => {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        bodyText = '';
      }
      responses.push({
        url,
        status: res.status(),
        bodyText,
      });
    })();
    inFlight.add(task);
    void task.finally(() => {
      inFlight.delete(task);
    });
  };

  page.on('response', onResponse);

  return {
    get responses(): ReadonlyArray<RecordedApiResponse> {
      return responses;
    },
    async flush(): Promise<void> {
      while (inFlight.size > 0) {
        await Promise.allSettled([...inFlight]);
      }
    },
    clear(): void {
      responses.length = 0;
    },
    dispose(): void {
      page.off('response', onResponse);
    },
  };
}

export async function assertSecretNotLeaked(options: {
  page: Page;
  request: APIRequestContext;
  secrets: string[];
  recorder?: NetworkRecorder;
}): Promise<void> {
  const activeSecrets = options.secrets.filter((s) => typeof s === 'string' && s.length > 0);
  if (activeSecrets.length === 0) {
    return;
  }

  if (options.recorder) {
    await options.recorder.flush();
  }

  const domSnapshot = await options.page.evaluate(() => {
    const storageDump: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k !== null) {
        storageDump.push(`${k}=${window.localStorage.getItem(k) ?? ''}`);
      }
    }
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k !== null) {
        storageDump.push(`${k}=${window.sessionStorage.getItem(k) ?? ''}`);
      }
    }
    const inputValues = Array.from(document.querySelectorAll('input, textarea'))
      .map((el) => (el as HTMLInputElement | HTMLTextAreaElement).value ?? '')
      .join('\n');
    return {
      html: document.documentElement.innerHTML,
      text: document.body.innerText,
      storage: storageDump.join('\n'),
      inputValues,
    };
  });

  const connRes = await options.request.get('/api/connections');
  expect(connRes.ok(), `GET /api/connections failed with status ${connRes.status()}`).toBe(true);
  const connText = await connRes.text();

  for (let idx = 0; idx < activeSecrets.length; idx += 1) {
    const secret = activeSecrets[idx];
    const label = `secret[${idx}] (len=${secret.length})`;

    expect(domSnapshot.html.includes(secret), `${label} leaked into DOM innerHTML`).toBe(false);
    expect(domSnapshot.text.includes(secret), `${label} leaked into DOM innerText`).toBe(false);
    expect(domSnapshot.storage.includes(secret), `${label} leaked into Web Storage`).toBe(false);
    expect(
      domSnapshot.inputValues.includes(secret),
      `${label} leaked into <input>/<textarea> value`,
    ).toBe(false);
    expect(connText.includes(secret), `${label} leaked in GET /api/connections response`).toBe(
      false,
    );

    if (options.recorder) {
      for (const recorded of options.recorder.responses) {
        expect(
          recorded.bodyText.includes(secret),
          `${label} leaked in recorded network response ${recorded.url}`,
        ).toBe(false);
      }
    }
  }
}
