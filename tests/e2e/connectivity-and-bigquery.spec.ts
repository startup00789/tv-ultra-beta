import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  TEST_IDS,
  assertSecretNotLeaked,
  attachNetworkRecorder,
  configureGeminiViaUI,
  configureOpenCodeViaUI,
  drawOnChartCanvas,
  gotoAppAndWaitForChart,
  invokeAIAssistant,
  openRightRailTab,
  resetConnections,
  type NetworkRecorder,
  type PageErrorTracker,
} from './helpers/testHelpers.ts';
import { startGeminiMockServer, type GeminiMockServer } from './mocks/geminiMockServer.ts';
import {
  startOpenCodeMockServer,
  type OpenCodeMockServer,
} from './mocks/opencodeMockServer.ts';

const JUDGE_DIR = path.resolve('tests/e2e/judge-screenshots');

interface OpenAICompatMockServer {
  baseUrl: string;
  requests: Array<{ auth: string; body: unknown }>;
  close(): Promise<void>;
}

async function startOpenAICompatMockServer(expectedKey: string): Promise<OpenAICompatMockServer> {
  const requests: Array<{ auth: string; body: unknown }> = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += String(chunk);
    });
    req.on('end', () => {
      const auth = String(req.headers.authorization ?? '');
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      requests.push({ auth, body: parsed });

      if (auth !== `Bearer ${expectedKey}`) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
        return;
      }

      const messages = Array.isArray(parsed.messages)
        ? (parsed.messages as Array<{ role?: string; content?: string }>)
        : [];
      const allText = messages.map((m) => m.content ?? '').join('\n');
      const wantsForward = /forward|demo|execute/i.test(allText);

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          model: String(parsed.model ?? 'deepseek-reasoner'),
          choices: [
            {
              message: {
                reasoning_content:
                  'Audited loaded backtest strategy risk-reward and zero-lookahead entry signals on active chart.',
                content: wantsForward
                  ? 'Loaded strategy verified on AAPL. Starting Live Demo Forward Test now.\n```forward-test\n{"startForwardTest": true}\n```'
                  : 'DeepSeek R1 institutional analysis complete for AAPL.',
              },
            },
          ],
        }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.describe('R2 & R3: OpenCode, DeepSeek, BYOK, Gemini & 40k Ultra History Integration', () => {
  let ocMock: OpenCodeMockServer;
  let gemMock: GeminiMockServer;
  let dsMock: OpenAICompatMockServer;
  let tracker: PageErrorTracker;
  let recorder: NetworkRecorder;

  test.beforeAll(async () => {
    fs.mkdirSync(JUDGE_DIR, { recursive: true });
    ocMock = await startOpenCodeMockServer({
      authMode: 'basic',
      username: 'opencode',
      secret: 'e2e-oc-secret-99',
    });
    gemMock = await startGeminiMockServer({
      expectedApiKey: 'e2e-gemini-key-88',
    });
    dsMock = await startOpenAICompatMockServer('sk-e2e-deepseek-ultra-55');
  });

  test.afterAll(async () => {
    await ocMock?.close();
    await gemMock?.close();
    await dsMock?.close();
  });

  test.beforeEach(async ({ page, request }) => {
    ocMock.clearFault();
    ocMock.clearRequests();
    gemMock.clearFault();
    gemMock.clearRequests();
    await resetConnections(request);
    recorder = attachNetworkRecorder(page);
    tracker = await gotoAppAndWaitForChart(page);
  });

  test.afterEach(() => {
    recorder.dispose();
    tracker.assertNoPageErrors();
    tracker.dispose();
  });

  test('saves, masks, validates, handles errors, and invokes OpenCode with AI Range chart context', async ({
    page,
    request,
  }) => {
    const badSecret = 'wrong-oc-secret-11';
    const goodSecret = 'e2e-oc-secret-99';

    // Top-bar "Connect OpenCode" trigger opens Connections modal directly to OpenCode tab with Launch & Connect option
    const topOpenCodeBtn = page.getByTestId('topbar-opencode-btn');
    await expect(topOpenCodeBtn).toBeVisible();
    await topOpenCodeBtn.click();
    await expect(page.getByTestId(TEST_IDS.connectionsModal)).toBeVisible();
    await expect(page.getByTestId(TEST_IDS.opencodeUrlInput)).toBeVisible();
    await expect(page.getByTestId('opencode-autostart-btn')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(TEST_IDS.connectionsModal)).toBeHidden();

    // Invalid Basic Auth -> error status badge, no secret leak
    await configureOpenCodeViaUI(page, {
      serverUrl: ocMock.baseUrl,
      authMode: 'basic',
      secret: badSecret,
      save: true,
      test: true,
    });
    await expect(page.getByTestId(TEST_IDS.opencodeStatusBadge)).toContainText(/error/i);
    await assertSecretNotLeaked({
      page,
      request,
      secrets: [badSecret],
      recorder,
    });

    // Valid Basic Auth -> connected status badge
    await configureOpenCodeViaUI(page, {
      serverUrl: ocMock.baseUrl,
      authMode: 'basic',
      secret: goodSecret,
      save: true,
      test: true,
    });
    await expect(page.getByTestId(TEST_IDS.opencodeStatusBadge)).toContainText(/connected/i);
    await assertSecretNotLeaked({
      page,
      request,
      secrets: [goodSecret],
      recorder,
    });

    // Close modal, mark an AI Range on the chart, and invoke OpenCode
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(TEST_IDS.connectionsModal)).toBeHidden();

    await drawOnChartCanvas(
      page,
      { x: 0.4, y: 0.35 },
      { x: 0.65, y: 0.65 },
      { tool: 'ai-range', mode: 'drag' },
    );
    await expect(page.getByTestId(TEST_IDS.rightSidebarPanel)).toContainText('AI Range: AAPL');

    // Select a specific model directly inside the OpenCode AI Assistant panel
    const modelSelect = page.getByTestId('opencode-model-select');
    await expect(modelSelect).toBeVisible();
    await modelSelect.selectOption('openai/gpt-4o');

    const { responseText, errorText } = await invokeAIAssistant(page, {
      provider: 'opencode',
      prompt: 'Analyze this AAPL range and suggest an EMA strategy.',
    });
    expect(errorText).toBeNull();
    expect(responseText).toContain('AAPL');
    expect(responseText).not.toContain(goodSecret);
    const msgReq = ocMock.getRequests().find((r) => r.pathname.endsWith('/message'));
    expect(msgReq).toBeDefined();
    expect((msgReq?.jsonBody as { model?: unknown })?.model).toEqual({
      providerID: 'openai',
      modelID: 'gpt-4o',
    });

    // Fault injection: 401 on message -> clean error banner
    ocMock.setFault({ fault: 401, pathPrefix: '/session', once: true });
    const faultRes = await invokeAIAssistant(page, {
      provider: 'opencode',
      prompt: 'Trigger auth error cleanly',
      expectError: true,
    });
    expect(faultRes.errorText).toBeTruthy();
  });

  test('saves, masks, validates missing/invalid keys, and invokes Gemini via @google/genai', async ({
    page,
    request,
  }) => {
    // Missing key MUST trigger clean error (not silently fall back to host env var)
    await configureGeminiViaUI(page, {
      apiKey: '',
      baseUrl: gemMock.baseUrl,
      model: 'gemini-3.8-flash',
      save: true,
      test: true,
    });
    await expect(page.getByTestId(TEST_IDS.geminiStatusBadge)).toContainText(/error/i);

    // Invalid API key -> error badge without leaking secret
    const badGemKey = 'bad-gem-key-7777';
    await configureGeminiViaUI(page, {
      apiKey: badGemKey,
      baseUrl: gemMock.baseUrl,
      model: 'gemini-3.8-flash',
      save: true,
      test: true,
    });
    await expect(page.getByTestId(TEST_IDS.geminiStatusBadge)).toContainText(/error/i);
    await assertSecretNotLeaked({
      page,
      request,
      secrets: [badGemKey],
      recorder,
    });

    // Valid API key -> connected + invokes /v1beta/interactions
    const goodGemKey = 'e2e-gemini-key-88';
    await configureGeminiViaUI(page, {
      apiKey: goodGemKey,
      baseUrl: gemMock.baseUrl,
      model: 'gemini-4-argon',
      save: true,
      test: true,
    });
    await expect(page.getByTestId(TEST_IDS.geminiStatusBadge)).toContainText(/connected/i);
    await assertSecretNotLeaked({
      page,
      request,
      secrets: [goodGemKey],
      recorder,
    });

    await page.keyboard.press('Escape');
    const { responseText, errorText } = await invokeAIAssistant(page, {
      provider: 'gemini',
      prompt: 'Summarize trend and BigQuery SQL options for AAPL.',
    });
    expect(errorText).toBeNull();
    expect(responseText).toContain('AAPL');
    expect(responseText).not.toContain(goodGemKey);
    expect(gemMock.getRequests().some((r) => r.pathname.includes('/interactions'))).toBe(
      true,
    );
  });

  test('connects DeepSeek R1 & BYOK without leaking keys, loads 15k+ Ultra historical bars, and executes a backtested strategy in Live Demo Forward Test', async ({
    page,
    request,
  }) => {
    const badDsKey = 'sk-wrong-deepseek-000';
    const goodDsKey = 'sk-e2e-deepseek-ultra-55';
    await request.post('/api/paper/reset', { data: { initialCash: 100000 } });

    // 1. Verify TradingView Ultra historical depth loader (+15k bars -> >= 15,000 candles on chart)
    await expect(page.getByTestId('ultra-bars-badge')).toBeVisible();
    const load15kPromise = page.waitForResponse(
      (res) => res.url().includes('/api/market/history') && res.status() === 200,
    );
    await page.getByTestId('load-15k-bars-btn').click();
    await load15kPromise;
    await expect(page.getByTestId('ultra-bars-badge')).toContainText(/1[5-9],\d{3}|[2-4]\d,\d{3}/);

    // 2. Open DeepSeek tab in Connections -> verify bad key errors cleanly without leaking secret
    await page.getByTestId('topbar-deepseek-btn').click();
    await expect(page.getByTestId(TEST_IDS.connectionsModal)).toBeVisible();
    await page.getByTestId('deepseek-model-select').selectOption('deepseek-reasoner');
    await page.getByTestId('deepseek-baseurl-input').fill(dsMock.baseUrl);
    await page.getByTestId('deepseek-apikey-input').fill(badDsKey);
    await page.getByTestId('deepseek-test-btn').click();
    await expect(page.getByTestId('deepseek-status-badge')).toContainText(/error/i);
    await assertSecretNotLeaked({ page, request, secrets: [badDsKey], recorder });

    // 3. Save valid DeepSeek key & also verify BYOK tab connects to OpenAI-compatible endpoint
    await page.getByTestId('deepseek-apikey-input').fill(goodDsKey);
    await page.getByTestId('deepseek-test-btn').click();
    await expect(page.getByTestId('deepseek-status-badge')).toContainText(/connected/i);

    await page.getByTestId('conn-tab-byok').click();
    await page.getByTestId('byok-baseurl-input').fill(dsMock.baseUrl);
    await page.getByTestId('byok-model-input').fill('deepseek/deepseek-r1');
    await page.getByTestId('byok-apikey-input').fill(goodDsKey);
    await page.getByTestId('byok-test-btn').click();
    await expect(page.getByTestId('byok-status-badge')).toContainText(/connected/i);
    await assertSecretNotLeaked({ page, request, secrets: [goodDsKey], recorder });
    await page.keyboard.press('Escape');

    // 4. Backtest a strategy -> verify it automatically loads into AI Copilot & tell DeepSeek to execute it in Demo Forward Test
    await page.getByTestId('topbar-strategy-btn').click();
    await page.getByTestId('strategy-provider-select').selectOption('deterministic');
    await page.getByTestId('generate-master-prompt-btn').click();
    await expect(page.getByTestId('approve-run-backtest-btn')).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId('approve-run-backtest-btn').click();
    await expect(page.getByTestId('strategy-backtester-drawer')).toContainText('Auto-loaded', {
      timeout: 10_000,
    });

    // Tell DeepSeek in plain words to execute the loaded strategy in Live Demo Forward Test
    const aiRes = await invokeAIAssistant(page, {
      provider: 'deepseek',
      prompt: 'Execute my loaded backtest strategy in the demo forward test now.',
    });
    expect(aiRes.errorText).toBeNull();
    expect(aiRes.responseText).toContain('Live Demo Forward Test');
    await assertSecretNotLeaked({ page, request, secrets: [goodDsKey], recorder });

    // Confirm Live Demo Forward-Test Workstation automatically opened and armed the loaded strategy
    const forwardDrawer = page.getByTestId('auto-paper-trader-drawer');
    await expect(forwardDrawer).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('forward-test-status-badge')).toContainText('STREAMING FORWARD TEST ACTIVE');
    await expect(page.getByTestId('forward-loaded-strategy-card')).toBeVisible();

    await page.screenshot({
      path: path.join(JUDGE_DIR, '04-ai-and-bigquery-overlay.png'),
      fullPage: true,
    });

    await openRightRailTab(page, 'watchlist');
  });
});
