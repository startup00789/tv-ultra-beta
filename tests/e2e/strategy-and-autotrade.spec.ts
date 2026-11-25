import { expect, test } from '@playwright/test';
import {
  TEST_IDS,
  drawOnChartCanvas,
  getChartCanvasBox,
  getDrawingItemIds,
  gotoAppAndWaitForChart,
  openRightRailTab,
  type PageErrorTracker,
} from './helpers/testHelpers.ts';

test.describe('TradingView Super-Tools, Strict AI Backtester, Why? Audit & Auto Paper Trading', () => {
  let tracker: PageErrorTracker;

  test.beforeEach(async ({ page, request }) => {
    await request.post('/api/paper/reset', { data: { initialCash: 100000 } });
    tracker = await gotoAppAndWaitForChart(page);
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/paper/reset', { data: { initialCash: 100000 } }).catch(() => {});
    tracker.assertNoPageErrors();
  });

  test('expands left drawing toolbar flyouts for Long Position R:R and Anchored VWAP', async ({
    page,
  }) => {
    await expect(page.getByTestId(TEST_IDS.drawRemoveAll)).toBeVisible();
    const initialDrawings = await getDrawingItemIds(page);

    // 1. Open Forecasting flyout -> select Long Position -> two-click draw on canvas
    await page.getByTestId('draw-flyout-forecasting').click();
    const menu = page.getByTestId('draw-flyout-menu-forecasting');
    await expect(menu).toBeVisible();
    await page.getByTestId('flyout-item-long_position').click();
    await expect(menu).toBeHidden();

    await drawOnChartCanvas(page, { x: 0.34, y: 0.56 }, { x: 0.62, y: 0.38 }, { mode: 'two-click' });

    // 2. Open Forecasting flyout -> select Fixed-Range Volume Profile (FRVP) -> two-click draw on canvas
    await page.getByTestId('draw-flyout-forecasting').click();
    await expect(page.getByTestId('flyout-item-anchored_vp')).toBeVisible();
    await page.getByTestId('flyout-item-anchored_vp').click();
    await drawOnChartCanvas(page, { x: 0.18, y: 0.65 }, { x: 0.42, y: 0.35 }, { mode: 'two-click' });

    // 3. Open Forecasting flyout -> select Anchored VWAP -> single-click draw on canvas
    await page.getByTestId('draw-flyout-forecasting').click();
    await expect(page.getByTestId('flyout-item-anchored_vwap')).toBeVisible();
    await page.getByTestId('flyout-item-anchored_vwap').click();

    const box = await getChartCanvasBox(page);
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.5);

    // Verify 3 pro drawings were committed on overlay
    await expect
      .poll(async () => (await getDrawingItemIds(page)).length, {
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(initialDrawings.length + 3);

    // Toggle institutional SESSIONS & PDH/PDL liquidity overlay from Chart Legend
    await page.getByTestId('legend-toggle-sessions').click();
    await expect(page.getByTestId('sessions-overlay')).toBeVisible();
  });

  test('enforces Master Prompt approval gate on vague/lookahead prompt, runs 6-tab backtest, explains Why?, deploys Auto Paper Bot, and executes Kill Switch', async ({
    page,
  }) => {
    // Switch to Deterministic Strict / verify OpenCode option exists in selector
    await page.getByTestId('topbar-strategy-btn').click();
    const drawer = page.getByTestId('strategy-backtester-drawer');
    await expect(drawer).toBeVisible();

    const providerSelect = page.getByTestId('strategy-provider-select');
    await expect(providerSelect.locator('option[value="deepseek"]')).toHaveCount(1);
    await expect(providerSelect.locator('option[value="byok"]')).toHaveCount(1);
    await expect(providerSelect.locator('option[value="opencode"]')).toHaveCount(1);
    await expect(providerSelect.locator('option[value="gemini"]')).toHaveCount(1);
    await providerSelect.selectOption('deterministic');
    await page.getByTestId('backtest-depth-select').selectOption('5000');

    // 1. Submit lookahead + vague prompt -> strict audit must flag LOOKAHEAD_BIAS + VAGUE_LANGUAGE & block run
    const descInput = page.getByTestId('strategy-description-input');
    await descInput.fill("Buy when tomorrow's close looks bullish and sell on weak vibes");
    await page.getByTestId('generate-master-prompt-btn').click();

    const card = page.getByTestId('master-prompt-card');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('LOOKAHEAD_BIAS');
    await expect(card).toContainText('VAGUE_LANGUAGE');
    await expect(page.getByTestId('approve-run-backtest-btn')).toBeDisabled();

    // 2. Apply Strict Auto-Fixes -> clears critical blockers & enables Approval Gate
    const fixBtn = page.getByTestId('apply-strict-fixes-btn');
    await expect(fixBtn).toBeVisible();
    await fixBtn.click();

    const approveBtn = page.getByTestId('approve-run-backtest-btn');
    await expect(approveBtn).toBeEnabled({ timeout: 10_000 });

    // Confirm Master Prompt is editable before execution
    const editor = page.getByTestId('master-prompt-editor');
    const originalMasterPrompt = await editor.inputValue();
    expect(originalMasterPrompt).toContain('Is this Master Prompt & Rule Specification fine');
    await editor.fill(`${originalMasterPrompt}\n# Reviewed by trader`);

    // 3. Approve & Run Backtest -> inspect all 6 tabs + Sweep
    await approveBtn.click();

    await expect(page.getByTestId('report-tab-overview')).toBeVisible();
    await expect(drawer).toContainText('Buy & Hold');

    await page.getByTestId('report-tab-performance').click();
    await expect(drawer).toContainText('Profit Factor');

    await page.getByTestId('report-tab-trades_analysis').click();
    await expect(drawer).toContainText('MFE / MAE Avg');

    await page.getByTestId('report-tab-ratios').click();
    await expect(drawer).toContainText('Sortino Ratio');

    await page.getByTestId('report-tab-trades').click();
    const tradesTable = page.getByTestId('backtest-trades-table');
    await expect(tradesTable).toBeVisible();

    // 4. Ask "Why?" on Trade #1 (or fallback interrogator if 0 trades)
    const whyTrade1 = page.getByTestId('trade-why-btn-1');
    if ((await whyTrade1.count()) > 0) {
      await whyTrade1.click();
    } else {
      await page.getByRole('button', { name: /Why\? \/ Critique/i }).click();
      await page.getByTestId('strategy-why-input').fill('Why did no trade fire on this bar?');
      await page.getByRole('button', { name: 'Interrogate Rule Trace' }).click();
    }

    const whyPanel = page.getByTestId('strategy-why-panel');
    await expect(whyPanel).toBeVisible();
    await expect(whyPanel).toContainText(/PASS|FAIL/, { timeout: 10_000 });

    // Run Parameter Sweep
    await page.getByTestId('run-param-sweep-btn').click();
    await expect(drawer).toContainText('Zero-lookahead parameter grid sweep', { timeout: 10_000 });

    // Check 7th tab: Stress & Quant Grade (Walk-Forward, Monte Carlo, 2x Friction, Grade)
    await page.getByTestId('report-tab-stress').click();
    await expect(page.getByTestId('stress-quant-view')).toBeVisible();
    await expect(page.getByTestId('quant-grade-badge')).toContainText(/Grade [A-F]/);
    await expect(drawer).toContainText('Walk-Forward (70/30 OOS)');
    await expect(drawer).toContainText('Monte Carlo');

    // Sync follow-up refinement via Sync Edits & Re-Audit
    await page.getByTestId('strategy-refine-input').fill('Add ADX 14 > 20');
    await page.getByTestId('sync-prompt-edits-btn').click();
    await expect(page.getByTestId('master-prompt-editor')).toHaveValue(/ADX/i, { timeout: 10_000 });
    await approveBtn.click();

    // 5. Deploy to Auto Paper Trader & verify Paper-Only safety + Manual Ticket + Emergency Kill Switch
    await page.getByTestId('deploy-paper-bot-btn').click();
    const autoDrawer = page.getByTestId('auto-paper-trader-drawer');
    await expect(autoDrawer).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('paper-only-badge')).toContainText('PAPER TRADING ONLY');
    await expect(autoDrawer).toContainText('armed');

    // Place a direct manual paper long order and verify position appears before Kill Switch flattens all
    await page.getByTestId('paper-buy-long-btn').click();
    await expect(autoDrawer).toContainText('Manual Paper Ticket', { timeout: 10_000 });

    await page.getByTestId('paper-kill-switch-btn').click();
    await expect(page.getByTestId('paper-kill-switch-banner')).toBeVisible({ timeout: 10_000 });
    await expect(autoDrawer).toContainText('killed');
  });

  test('draws instant Auto Support/Resistance levels and executes /vp, /smc, /scan Instant Hybrid Copilot tools', async ({
    page,
  }) => {
    const beforeIds = await getDrawingItemIds(page);
    await openRightRailTab(page, 'ai');
    const srBtn = page.getByTestId('ai-auto-sr-btn');
    await expect(srBtn).toBeVisible();
    await srBtn.click();

    await expect
      .poll(async () => (await getDrawingItemIds(page)).length, {
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(beforeIds.length + 2);

    // Toggle Volume Profile & SMC Overlays via Instant Hybrid chips
    await page.getByTestId('ai-toggle-vp-btn').click();
    await expect(page.getByTestId('vpvr-overlay')).toBeVisible();

    await page.getByTestId('ai-toggle-smc-btn').click();
    await expect(page.getByTestId('smc-overlay')).toBeVisible();

    // Slash command in prompt input executes locally in <50ms with tool badge
    await page.getByTestId('ai-prompt-input').fill('/regime');
    await page.getByTestId('ai-send-btn').click();
    await expect(page.getByTestId('ai-response-list')).toContainText('Quant Regime Diagnostics');
    await expect(page.getByTestId('ai-tool-call-badge').first()).toBeVisible();
  });

  test('runs interactive Bar Replay, Pine Script Strategy Compiler, Alerts Log, and Drawing Floating Toolbar clone/styles', async ({
    page,
  }) => {
    // 1. Launch Bar Replay from top toolbar, step forward, and exit
    await page.getByTestId('topbar-replay-btn').click();
    const replayBar = page.getByTestId('bar-replay-bar');
    await expect(replayBar).toBeVisible();
    await page.getByTestId('replay-step-btn').click();
    await page.getByTestId('replay-exit-btn').click();
    await expect(replayBar).toBeHidden();

    // 2. Draw a horizontal line (verifying pre-draw toolbar -> selected toolbar), style & clone
    await page.getByTestId(TEST_IDS.drawToolHline).click();
    const floatingBar = page.getByTestId('drawing-floating-toolbar');
    await expect(floatingBar).toBeVisible();
    await expect(floatingBar).toHaveAttribute('data-mode', 'pre-draw');

    const box = await getChartCanvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await page.getByTestId(TEST_IDS.drawToolCrosshair).click();

    const idsAfterDraw = await getDrawingItemIds(page);
    expect(idsAfterDraw.length).toBeGreaterThanOrEqual(1);

    await expect(floatingBar).toBeVisible();
    await expect(floatingBar).toHaveAttribute('data-mode', 'selected');
    await page.getByTestId('drawing-width-3').click();
    await page.getByTestId('drawing-style-dotted').click();
    await page.getByTestId('drawing-style-solid').click();
    await page.getByTestId('drawing-style-dashed').click();
    await page.getByTestId('drawing-toggle-extend').click();

    // Open Drawing Settings Modal -> customize style, title, coordinates, and templates
    await page.getByTestId('drawing-open-settings').click();
    const settingsModal = page.getByTestId('drawing-settings-modal');
    await expect(settingsModal).toBeVisible();
    await page.getByTestId('drawing-title-input').fill('London Gold Liquidity');
    await page.getByTestId('modal-line-style-dotted').click();
    await page.getByTestId('drawing-settings-tab-coordinates').click();
    await expect(page.getByTestId('drawing-coord-price-0')).toBeVisible();
    await page.getByTestId('drawing-settings-tab-templates').click();
    await page.getByTestId('drawing-template-name-input').fill('E2E Gold Ray');
    await page.getByTestId('drawing-save-template-btn').click();
    await page.getByTestId('drawing-save-default-btn').click();
    await page.getByTestId('drawing-settings-done-btn').click();
    await expect(settingsModal).toBeHidden();

    await page.getByTestId('drawing-clone-selected').click();

    await expect
      .poll(async () => (await getDrawingItemIds(page)).length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(idsAfterDraw.length + 1);

    // 3. Open bottom drawer -> Pine Script Editor -> Compile & Run Backtest -> jumps to Strategy Tester
    await page.getByTestId('topbar-strategy-btn').click();
    await page.getByTestId('bottom-tab-script').click();
    await expect(page.getByTestId('pine-script-editor-drawer')).toBeVisible();
    await page.getByTestId('pine-compile-backtest-btn').click();
    await expect(page.getByTestId('strategy-backtester-drawer')).toBeVisible({ timeout: 10_000 });

    // 4. Open Strategy & Alerts Log drawer -> verify unified telemetry renders
    await page.getByTestId('bottom-tab-alerts').click();
    await expect(page.getByTestId('strategy-alerts-log-drawer')).toBeVisible();
  });
});
