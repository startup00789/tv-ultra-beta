import type {
  AIProviderInvokeRequest,
  AIProviderInvokeResponse,
  AIProviderTestResponse,
  ByokConfig,
  DeepSeekConfig,
} from '../../shared/types.js';
import { scrubSecrets } from './connectionsStore.js';

function resolveApiEndpoint(baseUrl: string, pathSuffix: string): string {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  if (cleanBase.endsWith('/v1') || cleanBase.endsWith('/v1beta')) {
    return `${cleanBase}${pathSuffix}`;
  }
  return `${cleanBase}/v1${pathSuffix}`;
}

function isLocalhostEndpoint(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch {
    return false;
  }
}

export async function testOpenAICompatConnection(
  provider: 'deepseek' | 'byok',
  cfg: DeepSeekConfig | ByokConfig,
): Promise<{ status: number; body: AIProviderTestResponse }> {
  const apiKey = cfg.apiKey?.trim() ?? '';
  const baseUrl = cfg.baseUrl?.trim() || (provider === 'deepseek' ? 'https://api.deepseek.com' : '');
  const model = cfg.model?.trim() || (provider === 'deepseek' ? 'deepseek-chat' : '');

  if (!baseUrl) {
    return {
      status: 200,
      body: {
        ok: false,
        provider,
        code: 'BAD_REQUEST',
        message: 'Base URL is required.',
      },
    };
  }

  if (!apiKey && !isLocalhostEndpoint(baseUrl)) {
    return {
      status: 200,
      body: {
        ok: false,
        provider,
        code: 'MISSING_CREDENTIALS',
        message:
          provider === 'deepseek'
            ? 'DeepSeek API key is missing. Paste your sk-... key from platform.deepseek.com.'
            : 'API key is required for remote Bring-Your-Own-API endpoints.',
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    // Probe chat/completions with a 1-token ping to verify both auth and model availability
    const url = resolveApiEndpoint(baseUrl, '/chat/completions');
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 4,
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        status: 200,
        body: {
          ok: false,
          provider,
          code: 'AUTH_INVALID',
          message: `Authentication rejected (${res.status}). Check your API key.`,
        },
      };
    }

    if (res.status === 404) {
      return {
        status: 200,
        body: {
          ok: false,
          provider,
          code: 'MODEL_NOT_FOUND',
          message: `Endpoint or model "${model}" returned 404 at ${url}.`,
        },
      };
    }

    if (!res.ok) {
      const errTxt = scrubSecrets(await res.text().catch(() => ''));
      return {
        status: 200,
        body: {
          ok: false,
          provider,
          code: res.status === 429 ? 'RATE_LIMITED' : 'BAD_REQUEST',
          message: `HTTP ${res.status}: ${errTxt.slice(0, 180) || 'Provider returned an error.'}`,
        },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        provider,
        model,
        message: `Connected to ${provider === 'deepseek' ? 'DeepSeek' : (cfg as ByokConfig).providerName || 'Custom API'} (${model}).`,
      },
    };
  } catch (err) {
    return {
      status: 200,
      body: {
        ok: false,
        provider,
        code: 'UNREACHABLE',
        message: scrubSecrets(
          err instanceof Error ? `Unreachable: ${err.message}` : 'Failed to reach API endpoint.',
        ),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function invokeOpenAICompat(
  provider: 'deepseek' | 'byok',
  cfg: DeepSeekConfig | ByokConfig,
  req: AIProviderInvokeRequest,
): Promise<{ status: number; body: AIProviderInvokeResponse }> {
  const apiKey = cfg.apiKey?.trim() ?? '';
  const baseUrl = cfg.baseUrl?.trim() || (provider === 'deepseek' ? 'https://api.deepseek.com' : '');
  const model = req.modelOverride?.trim() || cfg.model?.trim() || 'deepseek-chat';

  if (!apiKey && !isLocalhostEndpoint(baseUrl)) {
    return {
      status: 200,
      body: {
        ok: false,
        provider,
        code: 'MISSING_CREDENTIALS',
        message:
          provider === 'deepseek'
            ? 'Configure your DeepSeek API key in Connections first (or switch to OpenCode / Instant Hybrid).'
            : 'Configure your Bring-Your-Own-API key and Base URL in Connections first.',
      },
    };
  }

  const ctx = req.chartContext;
  const loadedSummary = req.loadedStrategy
    ? [
        `LOADED BACKTESTED STRATEGY IN WORKSPACE:`,
        `- Name: ${req.loadedStrategy.spec.name} (${req.loadedStrategy.spec.symbol} · ${req.loadedStrategy.spec.timeframe})`,
        `- Risk: SL ${req.loadedStrategy.spec.risk.stopLossPct}%, TP ${req.loadedStrategy.spec.risk.takeProfitPct}%, Risk/Trade ${req.loadedStrategy.spec.risk.riskPerTradePct}%`,
        req.loadedStrategy.reportSummary
          ? `- Backtest Results (${req.loadedStrategy.reportSummary.barCount} bars): Net ${req.loadedStrategy.reportSummary.netProfitPercent.toFixed(2)}%, WinRate ${req.loadedStrategy.reportSummary.winRatePct.toFixed(1)}%, PF ${req.loadedStrategy.reportSummary.profitFactor.toFixed(2)}, MaxDD -${req.loadedStrategy.reportSummary.maxDrawdownPercent.toFixed(2)}%, Grade ${req.loadedStrategy.reportSummary.grade ?? 'N/A'}`
          : '',
        `- Full Spec JSON: ${JSON.stringify(req.loadedStrategy.spec)}`,
      ]
        .filter(Boolean)
        .join('\n')
    : 'No backtested strategy currently loaded.';

  const systemPrompt = [
    `You are an institutional quantitative trading copilot & forward-test strategist inside a TradingView Ultra workstation.`,
    `Active Chart: ${ctx.symbol} (${ctx.timeframe}), Last Close: ${ctx.lastBar?.close ?? 'N/A'}.`,
    loadedSummary,
    `If the user asks to execute, forward-test, or run their loaded/described strategy in the Live Demo, include \`\`\`forward-test\n{"startForwardTest": true}\n\`\`\` at the end of your response.`,
    `If the user asks to draw levels, fibs, indicators, or switch symbols on the chart, you may include a \`\`\`chart-actions\n[...]\n\`\`\` JSON array.`,
    `Be sharp, quantitative, zero-lookahead, and concise.`,
  ].join('\n\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const url = resolveApiEndpoint(baseUrl, '/chat/completions');
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: req.prompt },
        ],
        temperature: 0.25,
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        status: 200,
        body: {
          ok: false,
          provider,
          code: 'AUTH_INVALID',
          message: `Authentication failed (${res.status}). Verify your API key.`,
        },
      };
    }

    if (!res.ok) {
      const errTxt = scrubSecrets(await res.text().catch(() => ''));
      return {
        status: 200,
        body: {
          ok: false,
          provider,
          code: res.status === 429 ? 'RATE_LIMITED' : 'BAD_REQUEST',
          message: `HTTP ${res.status}: ${errTxt.slice(0, 220) || 'AI request failed.'}`,
        },
      };
    }

    const data = (await res.json()) as {
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
    };

    const choice = data.choices?.[0]?.message;
    const rawContent = scrubSecrets(choice?.content?.trim() ?? '');
    const reasoningText = choice?.reasoning_content
      ? scrubSecrets(choice.reasoning_content.trim())
      : undefined;

    const startForwardTest = /```forward-test[\s\S]*?"startForwardTest"\s*:\s*true[\s\S]*?```/i.test(
      rawContent,
    );
    const cleanedText = rawContent.replace(/```forward-test[\s\S]*?```/gi, '').trim();

    return {
      status: 200,
      body: {
        ok: true,
        provider,
        text: cleanedText || '(Empty response)',
        reasoningText,
        modelLabel: data.model || model,
        startForwardTest,
      },
    };
  } catch (err) {
    return {
      status: 200,
      body: {
        ok: false,
        provider,
        code: 'UNREACHABLE',
        message: scrubSecrets(
          err instanceof Error ? err.message : 'Failed to reach AI endpoint.',
        ),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
