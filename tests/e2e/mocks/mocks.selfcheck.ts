import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startOpenCodeMockServer } from './opencodeMockServer.ts';
import type { OpenCodeMockServer } from './opencodeMockServer.ts';
import { startGeminiMockServer } from './geminiMockServer.ts';
import type { GeminiMockServer } from './geminiMockServer.ts';

interface ParsedSseEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseSseEvents(rawText: string): ParsedSseEvent[] {
  const blocks = rawText
    .split(/\r?\n\r?\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  const events: ParsedSseEvent[] = [];
  for (const block of blocks) {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }
    if (dataLines.length > 0) {
      events.push({
        event: eventName,
        data: JSON.parse(dataLines.join('\n')) as Record<string, unknown>,
      });
    }
  }
  return events;
}

describe('opencodeMockServer', () => {
  test('binds ephemeral port, serves happy paths, logs/clears requests, and closes cleanly', async (t) => {
    const server: OpenCodeMockServer = await startOpenCodeMockServer();
    t.after(async () => {
      await server.close();
    });

    assert.ok(server.port > 0, 'Expected ephemeral port > 0');
    assert.equal(server.baseUrl, `http://127.0.0.1:${server.port}`);

    const healthRes = await fetch(`${server.baseUrl}/global/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { healthy: boolean; version: string };
    assert.deepEqual(healthJson, { healthy: true, version: '1.19.5-mock' });

    const providerRes = await fetch(`${server.baseUrl}/provider`);
    assert.equal(providerRes.status, 200);
    const providerJson = (await providerRes.json()) as {
      all: Array<{ id: string }>;
      default: { model: string };
      connected: string[];
    };
    assert.ok(Array.isArray(providerJson.all) && providerJson.all.length >= 2);
    assert.equal(providerJson.default.model, 'anthropic/claude-sonnet-4-5');
    assert.ok(providerJson.connected.includes('anthropic'));

    const configProvidersRes = await fetch(`${server.baseUrl}/config/providers`);
    assert.equal(configProvidersRes.status, 200);
    const configProvidersJson = (await configProvidersRes.json()) as {
      providers: Array<{ id: string }>;
      default: { model: string };
    };
    assert.ok(
      Array.isArray(configProvidersJson.providers) && configProvidersJson.providers.length >= 2,
    );
    assert.equal(configProvidersJson.default.model, 'anthropic/claude-sonnet-4-5');

    const doubleSlashHealthRes = await fetch(`${server.baseUrl}//global/health`);
    assert.equal(doubleSlashHealthRes.status, 200);
    const doubleSlashHealthJson = (await doubleSlashHealthRes.json()) as { healthy: boolean };
    assert.equal(doubleSlashHealthJson.healthy, true);

    const configRes = await fetch(`${server.baseUrl}/config`);
    assert.equal(configRes.status, 200);
    const configJson = (await configRes.json()) as {
      model: string;
      server: { port: number };
    };
    assert.equal(configJson.model, 'anthropic/claude-sonnet-4-5');
    assert.equal(configJson.server.port, server.port);

    const sessionRes = await fetch(`${server.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'AAPL Strategy' }),
    });
    assert.equal(sessionRes.status, 200);
    const sessionJson = (await sessionRes.json()) as { id: string; title: string };
    assert.ok(sessionJson.id.startsWith('ses_mock_'));
    assert.equal(sessionJson.title, 'AAPL Strategy');

    const msgRes = await fetch(`${server.baseUrl}/session/${sessionJson.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
        chartContext: { symbol: 'AAPL', timeframe: '4h' },
        parts: [{ type: 'text', text: 'Draft EMA crossover strategy' }],
      }),
    });
    assert.equal(msgRes.status, 200);
    const msgJson = (await msgRes.json()) as {
      info: { id: string; sessionID: string; role: string };
      parts: Array<{ type: string; text: string }>;
    };
    assert.equal(msgJson.info.sessionID, sessionJson.id);
    assert.equal(msgJson.info.role, 'assistant');
    assert.equal(msgJson.parts[0]?.type, 'text');
    assert.match(msgJson.parts[0]?.text ?? '', /AAPL/);
    assert.match(msgJson.parts[0]?.text ?? '', /Draft EMA crossover strategy/);

    server.setMessageResponder(({ sessionId, promptText }) => `Custom(${sessionId}): ${promptText}`);
    const customRes = await fetch(`${server.baseUrl}/session/${sessionJson.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello custom' }),
    });
    const customJson = (await customRes.json()) as { parts: Array<{ text: string }> };
    assert.equal(customJson.parts[0]?.text, `Custom(${sessionJson.id}): Hello custom`);

    const logged = server.getRequests();
    assert.equal(logged.length, 8);
    assert.equal(logged[5]?.pathname, '/session');
    assert.equal((logged[6]?.jsonBody as Record<string, unknown>)?.['chartContext'] !== undefined, true);
    server.clearRequests();
    assert.equal(server.getRequests().length, 0);

    await server.close();
    await server.close(); // idempotent
    await assert.rejects(
      () => fetch(`${server.baseUrl}/global/health`),
      (err: unknown) => {
        const msg = String(err);
        const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
        return causeCode === 'ECONNREFUSED' || msg.includes('ECONNREFUSED') || msg.includes('fetch failed');
      },
    );
  });

  test('enforces Basic (including colons in secret) and Bearer authentication', async (t) => {
    const server = await startOpenCodeMockServer({
      authMode: 'basic',
      username: 'opencode',
      secret: 'pass:with:colons',
      version: '1.19.5-custom',
    });
    t.after(async () => {
      await server.close();
    });

    const missingBasic = await fetch(`${server.baseUrl}/global/health`);
    assert.equal(missingBasic.status, 401);
    assert.match(missingBasic.headers.get('www-authenticate') ?? '', /^Basic/i);

    const wrongPass = await fetch(`${server.baseUrl}/global/health`, {
      headers: {
        Authorization: `Basic ${Buffer.from('opencode:wrong', 'utf8').toString('base64')}`,
      },
    });
    assert.equal(wrongPass.status, 401);

    const noColon = await fetch(`${server.baseUrl}/global/health`, {
      headers: {
        Authorization: `Basic ${Buffer.from('opencode', 'utf8').toString('base64')}`,
      },
    });
    assert.equal(noColon.status, 401);

    const validBasic = await fetch(`${server.baseUrl}/global/health`, {
      headers: {
        Authorization: `Basic ${Buffer.from('opencode:pass:with:colons', 'utf8').toString('base64')}`,
      },
    });
    assert.equal(validBasic.status, 200);
    const health = (await validBasic.json()) as { version: string };
    assert.equal(health.version, '1.19.5-custom');

    server.setAuth({ authMode: 'bearer', secret: 'tok-secret-999' });

    const missingBearer = await fetch(`${server.baseUrl}/provider`);
    assert.equal(missingBearer.status, 401);
    assert.match(missingBearer.headers.get('www-authenticate') ?? '', /^Bearer/i);

    const wrongBearer = await fetch(`${server.baseUrl}/provider`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    assert.equal(wrongBearer.status, 401);

    const validBearer = await fetch(`${server.baseUrl}/provider`, {
      headers: { Authorization: 'Bearer tok-secret-999' },
    });
    assert.equal(validBearer.status, 200);
  });

  test('injects 401, 404, 500, invalid_json, once-rules, and hang faults with clean close', async (t) => {
    const server = await startOpenCodeMockServer();
    t.after(async () => {
      await server.close();
    });

    for (const status of [401, 404, 500] as const) {
      server.setFault(status);
      const res = await fetch(`${server.baseUrl}/global/health`);
      assert.equal(res.status, status);
    }

    server.setFault('invalid_json');
    const badJsonRes = await fetch(`${server.baseUrl}/global/health`);
    assert.equal(badJsonRes.status, 200);
    const badJsonText = await badJsonRes.text();
    assert.throws(() => JSON.parse(badJsonText), SyntaxError);

    server.setFault({ fault: 500, pathPrefix: '/session', method: 'POST', once: true });
    const unaffected = await fetch(`${server.baseUrl}/global/health`);
    assert.equal(unaffected.status, 200);
    const onceFault = await fetch(`${server.baseUrl}/session`, { method: 'POST', body: '{}' });
    assert.equal(onceFault.status, 500);
    const afterOnce = await fetch(`${server.baseUrl}/session`, { method: 'POST', body: '{}' });
    assert.equal(afterOnce.status, 200);

    server.setFault('hang');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120);
    await assert.rejects(
      () => fetch(`${server.baseUrl}/global/health`, { signal: ac.signal }),
      (err: unknown) => (err as Error).name === 'AbortError',
    );
    clearTimeout(timer);

    const startClose = Date.now();
    await server.close();
    assert.ok(Date.now() - startClose < 1500, 'Expected fast socket teardown');
  });

  test('guards malformed percent-encoding without crashing and normalizes fault pathPrefix trailing slashes', async (t) => {
    const server = await startOpenCodeMockServer();
    t.after(async () => {
      await server.close();
    });

    const malformedIdRes = await fetch(`${server.baseUrl}/session/%ZZ/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'bad encoding' }),
    });
    assert.equal(malformedIdRes.status, 400);

    // Server remains healthy and responsive after malformed URI encoding
    const recoveryHealthRes = await fetch(`${server.baseUrl}/global/health`);
    assert.equal(recoveryHealthRes.status, 200);

    server.setFault({ fault: 500, pathPrefix: '/global/health/', once: true });
    const trailingSlashFault = await fetch(`${server.baseUrl}/global/health/`);
    assert.equal(trailingSlashFault.status, 500);
    const recoveredAfterTrailingFault = await fetch(`${server.baseUrl}/global/health/`);
    assert.equal(recoveredAfterTrailingFault.status, 200);
  });
});

describe('geminiMockServer', () => {
  test('serves models, interactions (JSON + SSE + multi-turn), and generateContent/streamGenerateContent', async (t) => {
    const server: GeminiMockServer = await startGeminiMockServer({
      expectedApiKey: 'gem-secret-key',
    });
    t.after(async () => {
      await server.close();
    });

    assert.ok(server.port > 0);
    assert.equal(server.baseUrl, `http://127.0.0.1:${server.port}`);

    // GET /v1beta/models via x-goog-api-key
    const modelsRes = await fetch(`${server.baseUrl}/v1beta/models`, {
      headers: { 'x-goog-api-key': 'gem-secret-key' },
    });
    assert.equal(modelsRes.status, 200);
    const modelsJson = (await modelsRes.json()) as { models: Array<{ name: string }> };
    const modelNames = modelsJson.models.map((m) => m.name);
    assert.ok(modelNames.includes('models/gemini-3.8-flash'));
    assert.ok(modelNames.includes('models/gemini-4-argon'));
    assert.ok(modelNames.includes('models/gemini-3.5-flash-lite'));
    assert.ok(modelNames.includes('models/gemini-3.1-flash-lite'));

    // GET /v1beta/models/:modelId via ?key= query parameter
    const singleModelRes = await fetch(
      `${server.baseUrl}/v1beta/models/gemini-3.8-flash?key=gem-secret-key`,
    );
    assert.equal(singleModelRes.status, 200);
    const missingModelRes = await fetch(
      `${server.baseUrl}/v1beta/models/unknown-model?key=gem-secret-key`,
    );
    assert.equal(missingModelRes.status, 404);

    // POST /v1beta/interactions (unary + previous_interaction_id + GET)
    const intTurn1Res = await fetch(`${server.baseUrl}/v1beta/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': 'gem-secret-key',
      },
      body: JSON.stringify({
        model: 'gemini-3.8-flash',
        input: 'Summarize NVDA momentum',
      }),
    });
    assert.equal(intTurn1Res.status, 200);
    const intTurn1 = (await intTurn1Res.json()) as {
      id: string;
      model: string;
      status: string;
      created: string;
      updated: string;
      previous_interaction_id: string | null;
      output_text: string;
      outputs: Array<{ type: string; text: string }>;
      steps: Array<{ type: string; content: Array<{ type: string; text: string }> }>;
      usage: { total_tokens: number };
    };
    assert.ok(intTurn1.id.startsWith('v1_mock_int_'));
    assert.equal(intTurn1.status, 'completed');
    assert.equal(intTurn1.previous_interaction_id, null);
    assert.match(intTurn1.output_text, /Summarize NVDA momentum/);
    assert.equal(intTurn1.outputs[0]?.text, intTurn1.output_text);
    assert.equal(intTurn1.steps[0]?.type, 'model_output');
    assert.equal(intTurn1.steps[0]?.content[0]?.text, intTurn1.output_text);
    assert.ok(intTurn1.usage.total_tokens > 0);

    const intTurn2Res = await fetch(`${server.baseUrl}/v1beta/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': 'gem-secret-key',
      },
      body: JSON.stringify({
        model: 'gemini-3.8-flash',
        previous_interaction_id: intTurn1.id,
        input: 'Follow up question',
      }),
    });
    const intTurn2 = (await intTurn2Res.json()) as { previous_interaction_id: string | null };
    assert.equal(intTurn2.previous_interaction_id, intTurn1.id);

    const getIntRes = await fetch(`${server.baseUrl}/v1beta/interactions/${intTurn1.id}`, {
      headers: { 'x-goog-api-key': 'gem-secret-key' },
    });
    assert.equal(getIntRes.status, 200);
    const fetchedInt = (await getIntRes.json()) as { id: string };
    assert.equal(fetchedInt.id, intTurn1.id);

    // POST /v1beta/interactions (SSE streaming)
    const sseRes = await fetch(`${server.baseUrl}/v1beta/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': 'gem-secret-key',
      },
      body: JSON.stringify({
        model: 'gemini-3.8-flash',
        input: 'Stream forecast analysis for TSLA',
        stream: true,
      }),
    });
    assert.equal(sseRes.status, 200);
    assert.match(sseRes.headers.get('content-type') ?? '', /text\/event-stream/);
    const sseText = await sseRes.text();
    const events = parseSseEvents(sseText);
    const eventNames = events.map((e) => e.event);
    assert.equal(eventNames[0], 'interaction.created');
    assert.equal(eventNames[1], 'step.start');
    assert.ok(eventNames.includes('step.delta'));
    assert.equal(eventNames[eventNames.length - 2], 'step.stop');
    assert.equal(eventNames[eventNames.length - 1], 'interaction.completed');
    const deltaText = events
      .filter((e) => e.event === 'step.delta')
      .map((e) => ((e.data.delta as { text?: string })?.text ?? ''))
      .join('');
    assert.match(deltaText, /Stream forecast analysis for TSLA/);

    // POST /v1beta/models/:model:generateContent
    const genRes = await fetch(
      `${server.baseUrl}/v1beta/models/gemini-3.8-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gem-secret-key',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Explain Bollinger Bands' }] }],
        }),
      },
    );
    assert.equal(genRes.status, 200);
    const genJson = (await genRes.json()) as {
      candidates: Array<{
        finishReason: string;
        content: { parts: Array<{ text: string }> };
      }>;
      usageMetadata: { totalTokenCount: number };
    };
    assert.equal(genJson.candidates[0]?.finishReason, 'STOP');
    assert.match(genJson.candidates[0]?.content.parts[0]?.text ?? '', /Explain Bollinger Bands/);
    assert.ok(genJson.usageMetadata.totalTokenCount > 0);

    // POST /v1beta/models/:model:streamGenerateContent?alt=sse
    const streamGenSse = await fetch(
      `${server.baseUrl}/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gem-secret-key',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Stream generate content test' }] }],
        }),
      },
    );
    assert.equal(streamGenSse.status, 200);
    assert.match(streamGenSse.headers.get('content-type') ?? '', /text\/event-stream/);
    const streamGenEvents = parseSseEvents(await streamGenSse.text());
    assert.ok(streamGenEvents.length >= 1);

    // POST /v1beta/models/:model:streamGenerateContent (JSON array mode)
    const streamGenJsonRes = await fetch(
      `${server.baseUrl}/v1beta/models/gemini-3.8-flash:streamGenerateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gem-secret-key',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Array stream test' }] }],
        }),
      },
    );
    assert.equal(streamGenJsonRes.status, 200);
    const arrayChunks = (await streamGenJsonRes.json()) as Array<{
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    }>;
    assert.ok(Array.isArray(arrayChunks) && arrayChunks.length >= 1);

    // Request logging & clear
    assert.ok(server.getRequests().length >= 8);
    server.clearRequests();
    assert.equal(server.getRequests().length, 0);
  });

  test('validates API keys, injects all fault statuses, and closes cleanly', async (t) => {
    const server = await startGeminiMockServer({ expectedApiKey: 'valid-key-123' });
    t.after(async () => {
      await server.close();
    });

    const missingKeyRes = await fetch(`${server.baseUrl}/v1beta/models`);
    assert.equal(missingKeyRes.status, 400);
    const missingBody = (await missingKeyRes.json()) as { error: { status: string } };
    assert.equal(missingBody.error.status, 'INVALID_ARGUMENT');

    const wrongKeyRes = await fetch(`${server.baseUrl}/v1beta/models`, {
      headers: { 'x-goog-api-key': 'wrong-key' },
    });
    assert.equal(wrongKeyRes.status, 401);
    const wrongBody = (await wrongKeyRes.json()) as { error: { status: string } };
    assert.equal(wrongBody.error.status, 'UNAUTHENTICATED');

    const expectedStatuses: Record<400 | 401 | 403 | 404 | 429 | 500, string> = {
      400: 'INVALID_ARGUMENT',
      401: 'UNAUTHENTICATED',
      403: 'PERMISSION_DENIED',
      404: 'NOT_FOUND',
      429: 'RESOURCE_EXHAUSTED',
      500: 'INTERNAL',
    };

    for (const code of [400, 401, 403, 404, 429, 500] as const) {
      server.setFault(code);
      const res = await fetch(`${server.baseUrl}/v1beta/models`, {
        headers: { 'x-goog-api-key': 'valid-key-123' },
      });
      assert.equal(res.status, code);
      const payload = (await res.json()) as { error: { code: number; status: string } };
      assert.equal(payload.error.code, code);
      assert.equal(payload.error.status, expectedStatuses[code]);
    }

    server.setFault('invalid_json');
    const badJsonRes = await fetch(`${server.baseUrl}/v1beta/models`, {
      headers: { 'x-goog-api-key': 'valid-key-123' },
    });
    assert.equal(badJsonRes.status, 200);
    const badText = await badJsonRes.text();
    assert.throws(() => JSON.parse(badText), SyntaxError);

    server.setFault({ fault: 429, pathPrefix: '/v1beta/interactions', once: true });
    const modelsOk = await fetch(`${server.baseUrl}/v1beta/models`, {
      headers: { 'x-goog-api-key': 'valid-key-123' },
    });
    assert.equal(modelsOk.status, 200);
    const intRateLimited = await fetch(`${server.baseUrl}/v1beta/interactions`, {
      method: 'POST',
      headers: { 'x-goog-api-key': 'valid-key-123', 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hi' }),
    });
    assert.equal(intRateLimited.status, 429);
    const intRecovered = await fetch(`${server.baseUrl}/v1beta/interactions`, {
      method: 'POST',
      headers: { 'x-goog-api-key': 'valid-key-123', 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hi again' }),
    });
    assert.equal(intRecovered.status, 200);

    server.setFault('hang');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120);
    await assert.rejects(
      () =>
        fetch(`${server.baseUrl}/v1beta/models`, {
          headers: { 'x-goog-api-key': 'valid-key-123' },
          signal: ac.signal,
        }),
      (err: unknown) => (err as Error).name === 'AbortError',
    );
    clearTimeout(timer);

    const closeStart = Date.now();
    await server.close();
    await server.close();
    assert.ok(Date.now() - closeStart < 1500, 'Expected fast socket teardown');

    await assert.rejects(
      () =>
        fetch(`${server.baseUrl}/v1beta/models`, {
          headers: { 'x-goog-api-key': 'valid-key-123' },
        }),
      (err: unknown) => {
        const msg = String(err);
        const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
        return causeCode === 'ECONNREFUSED' || msg.includes('ECONNREFUSED') || msg.includes('fetch failed');
      },
    );
  });

  test('supports /v1/* routes, double-slash normalization, malformed %ZZ guard, and trailing-slash fault pathPrefix', async (t) => {
    const server = await startGeminiMockServer({ expectedApiKey: 'v1-gem-key' });
    t.after(async () => {
      await server.close();
    });

    // Leading double-slash normalization
    const doubleSlashModels = await fetch(`${server.baseUrl}//v1beta/models`, {
      headers: { 'x-goog-api-key': 'v1-gem-key' },
    });
    assert.equal(doubleSlashModels.status, 200);

    // /v1/models and /v1/models/:id
    const v1ModelsRes = await fetch(`${server.baseUrl}/v1/models`, {
      headers: { 'x-goog-api-key': 'v1-gem-key' },
    });
    assert.equal(v1ModelsRes.status, 200);
    const v1ModelsJson = (await v1ModelsRes.json()) as { models: Array<{ name: string }> };
    assert.ok(v1ModelsJson.models.some((m) => m.name === 'models/gemini-3.8-flash'));

    const v1SingleModelRes = await fetch(`${server.baseUrl}/v1/models/gemini-3.8-flash`, {
      headers: { 'x-goog-api-key': 'v1-gem-key' },
    });
    assert.equal(v1SingleModelRes.status, 200);

    // /v1/interactions (POST + GET)
    const v1IntRes = await fetch(`${server.baseUrl}/v1/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'v1-gem-key' },
      body: JSON.stringify({ model: 'gemini-3.8-flash', input: 'Test v1 interactions' }),
    });
    assert.equal(v1IntRes.status, 200);
    const v1IntJson = (await v1IntRes.json()) as { id: string; output_text: string };
    assert.match(v1IntJson.output_text, /Test v1 interactions/);

    const v1GetIntRes = await fetch(`${server.baseUrl}/v1/interactions/${v1IntJson.id}`, {
      headers: { 'x-goog-api-key': 'v1-gem-key' },
    });
    assert.equal(v1GetIntRes.status, 200);

    // /v1/models/:model:generateContent
    const v1GenRes = await fetch(
      `${server.baseUrl}/v1/models/gemini-3.8-flash:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'v1-gem-key' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Hello v1 generateContent' }] }],
        }),
      },
    );
    assert.equal(v1GenRes.status, 200);
    const v1GenJson = (await v1GenRes.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    assert.match(v1GenJson.candidates[0]?.content.parts[0]?.text ?? '', /Hello v1 generateContent/);

    // Malformed percent-encoding guards
    const badModelIdRes = await fetch(`${server.baseUrl}/v1/models/%ZZ`, {
      headers: { 'x-goog-api-key': 'v1-gem-key' },
    });
    assert.equal(badModelIdRes.status, 400);

    const badIntIdRes = await fetch(`${server.baseUrl}/v1/interactions/%ZZ`, {
      headers: { 'x-goog-api-key': 'v1-gem-key' },
    });
    assert.equal(badIntIdRes.status, 400);

    const badActionModelRes = await fetch(
      `${server.baseUrl}/v1/models/%ZZ:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'v1-gem-key' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
      },
    );
    assert.equal(badActionModelRes.status, 400);

    // Fault pathPrefix trailing-slash normalization
    server.setFault({ fault: 500, pathPrefix: '/v1beta/models/', once: true });
    const trailingFaultRes = await fetch(`${server.baseUrl}/v1beta/models/`, {
      headers: { 'x-goog-api-key': 'v1-gem-key' },
    });
    assert.equal(trailingFaultRes.status, 500);
    const recoveredRes = await fetch(`${server.baseUrl}/v1beta/models/`, {
      headers: { 'x-goog-api-key': 'v1-gem-key' },
    });
    assert.equal(recoveredRes.status, 200);
  });
});
