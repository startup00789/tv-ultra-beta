import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../server/index.js';
import { resetConnectionsConfig } from '../../server/services/connectionsStore.js';
import {
  flattenProviderModels,
  pickDefaultOpenCodeModel,
} from '../../server/services/opencodeClient.js';
import {
  startGeminiMockServer,
  type GeminiMockServer,
} from '../e2e/mocks/geminiMockServer.js';
import {
  startOpenCodeMockServer,
  type OpenCodeMockServer,
} from '../e2e/mocks/opencodeMockServer.js';

describe('Connections, OpenCode & Gemini API Integration', () => {
  let ocServer: OpenCodeMockServer;
  let gemServer: GeminiMockServer;

  beforeEach(async () => {
    resetConnectionsConfig();
  });

  afterAll(async () => {
    await ocServer?.close();
    await gemServer?.close();
  });

  it('masks stored secrets on GET /api/connections and preserves partial secret updates', async () => {
    const app = await buildApp({ logger: false, serveStatic: false });

    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        opencode: {
          enabled: true,
          serverUrl: 'http://127.0.0.1:4096/',
          authMode: 'basic',
          username: 'opencode',
          secret: 'super-secret-oc-9911',
        },
        gemini: {
          enabled: true,
          authMode: 'apiKey',
          apiKey: 'AIzaSyTestSecretKey7788',
          model: 'gemini-3.8-flash',
        },
      },
    });
    expect(saveRes.statusCode).toBe(200);
    const savedText = saveRes.body;
    expect(savedText).not.toContain('super-secret-oc-9911');
    expect(savedText).not.toContain('AIzaSyTestSecretKey7788');

    const getRes = await app.inject({ method: 'GET', url: '/api/connections' });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body).not.toContain('super-secret-oc-9911');
    expect(getRes.body).not.toContain('AIzaSyTestSecretKey7788');

    const masked = getRes.json();
    expect(masked.opencode.hasSecret).toBe(true);
    expect(masked.opencode.secretPreview).toBe('••••9911');
    expect(masked.gemini.hasApiKey).toBe(true);
    expect(masked.gemini.apiKeyPreview).toBe('••••7788');

    // Partial update without secret preserves existing secrets
    const patchRes = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        gemini: { model: 'gemini-4-argon' },
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = patchRes.json();
    expect(patched.opencode.hasSecret).toBe(true);
    expect(patched.gemini.hasApiKey).toBe(true);
    expect(patched.gemini.model).toBe('gemini-4-argon');

    await app.close();
  });

  it('rejects invalid URLs and unsupported models on POST /api/connections', async () => {
    const app = await buildApp({ logger: false, serveStatic: false });

    const badUrl = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: { opencode: { serverUrl: 'ftp://invalid.host' } },
    });
    expect(badUrl.statusCode).toBe(400);

    const badModel = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: { gemini: { model: 'gemini-1.5-pro' } },
    });
    expect(badModel.statusCode).toBe(400);

    await app.close();
  });

  it('connects, authenticates, handles errors, and invokes OpenCode against mock server', async () => {
    ocServer = await startOpenCodeMockServer({
      authMode: 'basic',
      username: 'opencode',
      secret: 'oc-pass-42',
    });

    const app = await buildApp({ logger: false, serveStatic: false });

    // Missing secret when authMode=basic
    await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        opencode: {
          enabled: true,
          serverUrl: ocServer.baseUrl,
          authMode: 'basic',
          secret: '',
        },
      },
    });
    const missingCreds = await app.inject({ method: 'POST', url: '/api/opencode/test' });
    expect(missingCreds.statusCode).toBe(400);
    expect(missingCreds.json().code).toBe('MISSING_CREDENTIALS');

    // Invalid Basic Auth password -> 401 AUTH_INVALID
    await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        opencode: {
          enabled: true,
          serverUrl: ocServer.baseUrl,
          authMode: 'basic',
          secret: 'wrong-pass',
        },
      },
    });
    const badAuth = await app.inject({ method: 'POST', url: '/api/opencode/test' });
    expect(badAuth.statusCode).toBe(401);
    expect(badAuth.json().code).toBe('AUTH_INVALID');

    // Valid Basic Auth -> 200 connected + provider discovery
    await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        opencode: {
          enabled: true,
          serverUrl: ocServer.baseUrl,
          authMode: 'basic',
          username: 'opencode',
          secret: 'oc-pass-42',
        },
      },
    });
    const goodTest = await app.inject({ method: 'POST', url: '/api/opencode/test' });
    expect(goodTest.statusCode).toBe(200);
    const testJson = goodTest.json();
    expect(testJson.ok).toBe(true);
    expect(testJson.version).toBe('1.19.5-mock');
    expect(testJson.providers.length).toBeGreaterThan(0);

    // Invoke OpenCode with chart context
    const invokeRes = await app.inject({
      method: 'POST',
      url: '/api/opencode/invoke',
      payload: {
        prompt: 'Write a moving average crossover strategy',
        chartContext: {
          symbol: 'NVDA',
          timeframe: '4h',
          lastBar: {
            time: 1795190400,
            open: 140,
            high: 145,
            low: 139,
            close: 144,
            volume: 1000000,
          },
          activeIndicators: [{ name: 'RSI', params: { period: 14 } }],
        },
      },
    });
    expect(invokeRes.statusCode).toBe(200);
    const invokeJson = invokeRes.json();
    expect(invokeJson.ok).toBe(true);
    expect(invokeJson.sessionId).toMatch(/^ses_mock_/);
    expect(invokeJson.messageText).toContain('NVDA');
    expect(invokeJson.messageText).not.toContain('oc-pass-42');

    // Closed port / unreachable server
    await ocServer.close();
    const unreachable = await app.inject({ method: 'POST', url: '/api/opencode/test' });
    expect(unreachable.statusCode).toBe(502);
    expect(unreachable.json().code).toBe('UNREACHABLE');

    await app.close();
  });

  it('reports quiet 200 status on GET /api/opencode/status and filters OpenCode models to connected providers', async () => {
    const app = await buildApp({ logger: false, serveStatic: false });

    // Point at a guaranteed-closed port -> still returns quiet HTTP 200 running: false
    const closedServer = http.createServer();
    await new Promise<void>((resolve) => closedServer.listen(0, '127.0.0.1', () => resolve()));
    const closedPort = (closedServer.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closedServer.close(() => resolve()));

    await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        opencode: {
          enabled: true,
          serverUrl: `http://127.0.0.1:${closedPort}`,
          authMode: 'none',
        },
      },
    });
    const offlineStatus = await app.inject({ method: 'GET', url: '/api/opencode/status' });
    expect(offlineStatus.statusCode).toBe(200);
    expect(offlineStatus.json().running).toBe(false);

    // Point at live mock server -> running: true with version & providers
    ocServer = await startOpenCodeMockServer({ authMode: 'none' });
    await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        opencode: {
          enabled: true,
          serverUrl: ocServer.baseUrl,
          authMode: 'none',
        },
      },
    });
    const liveStatus = await app.inject({ method: 'GET', url: '/api/opencode/status' });
    expect(liveStatus.statusCode).toBe(200);
    expect(liveStatus.json()).toMatchObject({
      running: true,
      serverUrl: ocServer.baseUrl,
      version: '1.19.5-mock',
    });
    expect(liveStatus.json().providers.length).toBeGreaterThan(0);

    await ocServer.close();
    await app.close();

    // flattenProviderModels keeps only connected chat-capable models and prioritizes opencode/big-pickle
    const models = flattenProviderModels({
      connected: ['google', 'opencode'],
      all: [
        {
          id: 'unconnected-xyz',
          models: { 'foo-1': { id: 'foo-1', name: 'Foo 1' } },
        },
        {
          id: 'google',
          models: {
            'gemini-embedding-2': { id: 'gemini-embedding-2', name: 'Gemini Embedding 2' },
            'gemini-2.5-flash-preview-tts': {
              id: 'gemini-2.5-flash-preview-tts',
              name: 'Gemini TTS',
            },
            'gemini-3-pro-image': { id: 'gemini-3-pro-image', name: 'Gemini Image' },
            'no-text-output': {
              id: 'no-text-output',
              name: 'Audio Only',
              capabilities: { output: { text: false } },
            },
            'gemini-3.8-flash': { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
          },
        },
        {
          id: 'opencode',
          models: {
            'big-pickle': { id: 'big-pickle', name: 'Big Pickle' },
          },
        },
      ],
    });
    expect(models).toEqual([
      { providerID: 'opencode', modelID: 'big-pickle', name: 'Big Pickle' },
      { providerID: 'google', modelID: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
    ]);
    expect(pickDefaultOpenCodeModel(models)).toEqual({
      providerID: 'opencode',
      modelID: 'big-pickle',
      name: 'Big Pickle',
    });
  });

  it('surfaces OpenCode HTTP 200 info.error and empty responses as clean errors instead of empty text', async () => {
    let mode: 'provider_auth_error' | 'empty_parts' = 'provider_auth_error';
    const rawServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/provider') {
        res.end(JSON.stringify({ all: [], connected: [] }));
        return;
      }
      if (req.url === '/session' && req.method === 'POST') {
        res.end(JSON.stringify({ id: 'ses_err_1' }));
        return;
      }
      if (req.url === '/session/ses_err_1/message' && req.method === 'POST') {
        if (mode === 'provider_auth_error') {
          res.end(
            JSON.stringify({
              info: {
                id: 'msg_1',
                role: 'assistant',
                providerID: 'google',
                modelID: 'gemini-3-pro-image',
                error: {
                  name: 'ProviderAuthError',
                  data: {
                    providerID: 'google',
                    message: 'Google Generative AI API key is missing.',
                  },
                },
              },
              parts: [],
            }),
          );
          return;
        }
        res.end(
          JSON.stringify({
            info: {
              id: 'msg_2',
              role: 'assistant',
              providerID: 'opencode',
              modelID: 'big-pickle',
            },
            parts: [],
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });

    await new Promise<void>((resolve) => rawServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (rawServer.address() as AddressInfo).port;
    const app = await buildApp({ logger: false, serveStatic: false });

    try {
      await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload: {
          opencode: {
            enabled: true,
            serverUrl: `http://127.0.0.1:${port}`,
            authMode: 'none',
            providerId: 'google',
            modelId: 'gemini-3-pro-image',
          },
        },
      });

      const authErrRes = await app.inject({
        method: 'POST',
        url: '/api/opencode/invoke',
        payload: {
          prompt: 'hi',
          chartContext: { symbol: 'BTCUSDT', timeframe: '1D' },
        },
      });
      expect(authErrRes.statusCode).toBe(401);
      expect(authErrRes.json()).toMatchObject({
        ok: false,
        code: 'AUTH_INVALID',
      });
      expect(authErrRes.json().message).toContain('Google Generative AI API key is missing');

      mode = 'empty_parts';
      const emptyRes = await app.inject({
        method: 'POST',
        url: '/api/opencode/invoke',
        payload: {
          prompt: 'hi',
          chartContext: { symbol: 'BTCUSDT', timeframe: '1D' },
          model: { providerID: 'opencode', modelID: 'big-pickle' },
        },
      });
      expect(emptyRes.statusCode).toBe(502);
      expect(emptyRes.json()).toMatchObject({
        ok: false,
        code: 'INVALID_RESPONSE',
      });
      expect(emptyRes.json().message).toContain('empty response');
    } finally {
      await app.close();
      await new Promise<void>((resolve) => rawServer.close(() => resolve()));
    }
  });

  it('validates and invokes Gemini via @google/genai against mock server and classifies errors', async () => {
    gemServer = await startGeminiMockServer({ expectedApiKey: 'valid-gem-key-1234' });
    const app = await buildApp({ logger: false, serveStatic: false });

    // Missing API key MUST fail even if process.env.GEMINI_API_KEY is set
    await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        gemini: {
          enabled: true,
          authMode: 'apiKey',
          apiKey: '',
          baseUrl: gemServer.baseUrl,
          model: 'gemini-3.8-flash',
        },
      },
    });
    const missingKey = await app.inject({ method: 'POST', url: '/api/gemini/test' });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json().code).toBe('MISSING_CREDENTIALS');

    // Invalid API key -> 401 AUTH_INVALID without leaking key
    await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        gemini: {
          enabled: true,
          authMode: 'apiKey',
          apiKey: 'bad-secret-key-9999',
          baseUrl: gemServer.baseUrl,
          model: 'gemini-3.8-flash',
        },
      },
    });
    const badKey = await app.inject({ method: 'POST', url: '/api/gemini/test' });
    expect(badKey.statusCode).toBe(401);
    expect(badKey.json().code).toBe('AUTH_INVALID');
    expect(badKey.body).not.toContain('bad-secret-key-9999');

    // Valid API key -> 200 + model list + invocation
    await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        gemini: {
          enabled: true,
          authMode: 'apiKey',
          apiKey: 'valid-gem-key-1234',
          baseUrl: gemServer.baseUrl,
          model: 'gemini-3.8-flash',
        },
      },
    });
    const okTest = await app.inject({ method: 'POST', url: '/api/gemini/test' });
    expect(okTest.statusCode).toBe(200);
    expect(okTest.json().ok).toBe(true);
    expect(okTest.json().models).toContain('gemini-3.8-flash');

    const invokeRes = await app.inject({
      method: 'POST',
      url: '/api/gemini/invoke',
      payload: {
        workflow: 'ta_brief',
        prompt: 'Summarize trend and BigQuery forecast',
        chartContext: {
          symbol: 'AAPL',
          timeframe: '1D',
          activeIndicators: [{ name: 'SMA', params: { period: 20 } }],
        },
      },
    });
    expect(invokeRes.statusCode).toBe(200);
    const invJson = invokeRes.json();
    expect(invJson.ok).toBe(true);
    expect(invJson.interactionId).toMatch(/^v1_mock_int_/);
    expect(invJson.text).toContain('AAPL');
    expect(invJson.text).not.toContain('valid-gem-key-1234');

    // Rate limit 429 fault
    gemServer.setFault(429);
    const rateLimited = await app.inject({
      method: 'POST',
      url: '/api/gemini/invoke',
      payload: {
        prompt: 'Check quota handling',
        chartContext: { symbol: 'AAPL', timeframe: '1D' },
      },
    });
    expect(rateLimited.statusCode).toBe(429);
    expect(rateLimited.json().code).toBe('RATE_LIMITED');
    gemServer.clearFault();

    await app.close();
  });
});
