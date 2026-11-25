import { GoogleGenAI, type GoogleGenAIOptions } from '@google/genai';
import type {
  ChartContextPayload,
  ConnectionErrorCode,
  GeminiConfig,
  GeminiInvokeRequest,
  GeminiInvokeResponse,
  GeminiTestResponse,
} from '../../shared/types.js';
import { scrubSecrets, validateHttpUrl } from './connectionsStore.js';

function resolveGeminiCredentials(config: GeminiConfig): {
  apiKey?: string;
  options?: GoogleGenAIOptions;
  errorStatus?: number;
  errorCode?: ConnectionErrorCode;
  errorMessage?: string;
} {
  let baseUrl: string | undefined;
  if (config.baseUrl?.trim()) {
    try {
      baseUrl = validateHttpUrl(config.baseUrl, 'gemini.baseUrl');
    } catch (err) {
      return {
        errorStatus: 400,
        errorCode: 'BAD_REQUEST',
        errorMessage: err instanceof Error ? err.message : 'Invalid Gemini baseUrl.',
      };
    }
  }

  const apiVersion = config.apiVersion || 'v1beta';

  if (config.authMode === 'vertexai') {
    const project = config.vertexProject?.trim();
    if (!project) {
      return {
        errorStatus: 400,
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage: 'Vertex AI project ID is required.',
      };
    }
    return {
      options: {
        vertexai: true,
        project,
        location: config.vertexLocation?.trim() || 'us-central1',
        httpOptions: {
          apiVersion,
          timeout: 10_000,
          ...(baseUrl ? { baseUrl } : {}),
        },
      },
    };
  }

  // IMPORTANT: Check explicitly before constructing GoogleGenAI so apiKey mode
  // never falls back to process.env.GEMINI_API_KEY / GOOGLE_API_KEY.
  let apiKey = '';
  if (config.authMode === 'envKey') {
    apiKey =
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      '';
    if (!apiKey) {
      return {
        errorStatus: 400,
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage: 'Server GEMINI_API_KEY environment variable is not set.',
      };
    }
  } else {
    apiKey = config.apiKey?.trim() || '';
    if (!apiKey) {
      return {
        errorStatus: 400,
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage: 'Gemini API key is required.',
      };
    }
  }

  return {
    apiKey,
    options: {
      apiKey,
      httpOptions: {
        apiVersion,
        timeout: 10_000,
        ...(baseUrl ? { baseUrl } : {}),
      },
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms waiting for ${label}`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function classifyGeminiError(
  err: unknown,
  extraSecret?: string,
): { status: number; code: ConnectionErrorCode; message: string } {
  const errObj =
    err && typeof err === 'object' ? (err as { status?: number; message?: string }) : {};
  const rawMessage = errObj.message ?? (err instanceof Error ? err.message : String(err));
  let safeMessage = scrubSecrets(rawMessage);
  if (extraSecret && extraSecret.length >= 4) {
    safeMessage = safeMessage.split(extraSecret).join('[REDACTED]');
  }
  const lower = safeMessage.toLowerCase();
  const statusHint =
    typeof errObj.status === 'number'
      ? errObj.status
      : lower.includes('401') || lower.includes('unauthenticated')
        ? 401
        : lower.includes('403') || lower.includes('permission_denied')
          ? 403
          : lower.includes('429') || lower.includes('resource_exhausted')
            ? 429
            : lower.includes('404') || lower.includes('not_found')
              ? 404
              : lower.includes('400') || lower.includes('invalid_argument')
                ? 400
                : 0;

  if (
    statusHint === 401 ||
    statusHint === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated')
  ) {
    return {
      status: 401,
      code: 'AUTH_INVALID',
      message: 'Invalid or unauthorized Gemini API key.',
    };
  }

  if (statusHint === 429 || lower.includes('quota') || lower.includes('rate limit')) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Gemini quota or rate limit exceeded.',
    };
  }

  if (statusHint === 404 || lower.includes('model') && lower.includes('not found')) {
    return {
      status: 404,
      code: 'MODEL_NOT_FOUND',
      message: 'Selected Gemini model is unavailable at this endpoint.',
    };
  }

  if (
    lower.includes('unexpected token') ||
    lower.includes('invalid json') ||
    lower.includes('json')
  ) {
    return {
      status: 502,
      code: 'INVALID_RESPONSE',
      message: 'Gemini endpoint returned an invalid response payload.',
    };
  }

  if (
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  ) {
    return {
      status: 502,
      code: 'UNREACHABLE',
      message: `Failed to reach Gemini endpoint (${safeMessage}).`,
    };
  }

  if (statusHint === 400) {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message: safeMessage || 'Invalid Gemini request.',
    };
  }

  return {
    status: 502,
    code: 'UNREACHABLE',
    message: safeMessage || 'Failed to invoke Gemini endpoint.',
  };
}

function buildGeminiPrompt(req: GeminiInvokeRequest): string {
  const ctx: ChartContextPayload = req.chartContext;
  const parts: string[] = [];

  if (req.workflow === 'sql_copilot') {
    parts.push(
      'Role: BigQuery AI/ML SQL Copilot. Generate valid BigQuery SQL using Table-Valued Functions (AI.FORECAST, AI.DETECT_ANOMALIES, AI.EVALUATE, ML.DESCRIBE_DATA) in the FROM clause with => named parameters.',
    );
  } else if (req.workflow === 'indicator_explainer') {
    parts.push(
      'Role: Technical Indicator & Anomaly Analyst. Explain indicator readings and market structure clearly.',
    );
  } else if (req.workflow === 'ta_brief') {
    parts.push(
      'Role: Quantitative Technical Analyst. Provide a concise TradingView chart brief covering trend, key levels, indicators, and BigQuery ML overlays.',
    );
  }

  parts.push(`Symbol: ${ctx.symbol} | Timeframe: ${ctx.timeframe}`);
  if (ctx.lastBar) {
    parts.push(
      `Latest Bar: O=${ctx.lastBar.open}, H=${ctx.lastBar.high}, L=${ctx.lastBar.low}, C=${ctx.lastBar.close}, V=${ctx.lastBar.volume}`,
    );
  }
  if (ctx.activeIndicators && ctx.activeIndicators.length > 0) {
    parts.push(
      `Active Indicators: ${ctx.activeIndicators
        .map((i) => `${i.name}(${Object.values(i.params).join(',')})`)
        .join(', ')}`,
    );
  }
  if (ctx.selectedRange) {
    parts.push(
      `Selected AI Range: ${ctx.selectedRange.barCount} bars from ${new Date(ctx.selectedRange.startTime * 1000).toISOString()} to ${new Date(ctx.selectedRange.endTime * 1000).toISOString()}`,
    );
  }
  if (ctx.chartOverlay?.forecast) {
    const pts = ctx.chartOverlay.forecast.points;
    const end = pts[pts.length - 1];
    parts.push(
      `BigQuery Forecast (${ctx.chartOverlay.forecast.executionMode}): ${ctx.chartOverlay.forecast.label}, target=${end ? end.value.toFixed(2) : 'n/a'}`,
    );
  }
  if (ctx.chartOverlay?.anomalies && ctx.chartOverlay.anomalies.length > 0) {
    parts.push(`BigQuery Anomalies Flagged: ${ctx.chartOverlay.anomalies.length}`);
  }
  if (ctx.recentBars && ctx.recentBars.length > 0) {
    parts.push(
      `Recent Closes: ${ctx.recentBars
        .slice(-8)
        .map((b) => b.close)
        .join(', ')}`,
    );
  }
  parts.push(
    'Chart Actions Protocol: When asked to draw levels/fib/positions, add indicators, switch symbol/timeframe, toggle Volume Profile (toggle_vp) or Smart Money Concepts (toggle_smc), or open Strategy Tester (open_backtester), you may include a ```chart-actions\n[{"type":"draw_hline","label":"Support","payload":{"price":100,"color":"#089981"}}]\n``` JSON array block.',
  );

  parts.push(`Prompt:\n${req.prompt.trim()}`);
  return parts.join('\n');
}

function extractInteractionText(interaction: unknown): string {
  if (!interaction || typeof interaction !== 'object') return '';
  const obj = interaction as Record<string, unknown>;
  if (typeof obj.output_text === 'string' && obj.output_text.trim()) {
    return obj.output_text;
  }
  if (Array.isArray(obj.outputs)) {
    const texts: string[] = [];
    for (const out of obj.outputs) {
      if (
        out &&
        typeof out === 'object' &&
        typeof (out as Record<string, unknown>).text === 'string'
      ) {
        texts.push((out as Record<string, unknown>).text as string);
      }
    }
    if (texts.length > 0) return texts.join('\n');
  }
  if (Array.isArray(obj.steps)) {
    const texts: string[] = [];
    for (const step of obj.steps) {
      if (step && typeof step === 'object') {
        const content = (step as Record<string, unknown>).content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (
              item &&
              typeof item === 'object' &&
              typeof (item as Record<string, unknown>).text === 'string'
            ) {
              texts.push((item as Record<string, unknown>).text as string);
            }
          }
        }
      }
    }
    if (texts.length > 0) return texts.join('\n');
  }
  return '';
}

export async function testGeminiConnection(
  config: GeminiConfig,
): Promise<{ status: number; body: GeminiTestResponse }> {
  const creds = resolveGeminiCredentials(config);
  if (!creds.options) {
    return {
      status: creds.errorStatus ?? 400,
      body: {
        ok: false,
        code: creds.errorCode ?? 'MISSING_CREDENTIALS',
        message: creds.errorMessage ?? 'Gemini credentials are missing.',
      },
    };
  }

  try {
    const client = new GoogleGenAI(creds.options);
    const pager = await withTimeout(client.models.list(), 5000, 'Gemini models.list');
    const models: string[] = [];
    const pageItems = pager.page ?? [];
    for (const item of pageItems) {
      const rawName = item.name ?? '';
      const clean = rawName.startsWith('models/')
        ? rawName.slice('models/'.length)
        : rawName;
      if (clean) models.push(clean);
    }

    return {
      status: 200,
      body: {
        ok: true,
        message: `Connected to Gemini (${config.model}).`,
        models: models.length > 0 ? models : [config.model],
      },
    };
  } catch (err) {
    const classified = classifyGeminiError(err, creds.apiKey);
    return {
      status: classified.status,
      body: {
        ok: false,
        code: classified.code,
        message: classified.message,
      },
    };
  }
}

export async function invokeGemini(
  config: GeminiConfig,
  req: GeminiInvokeRequest,
): Promise<{ status: number; body: GeminiInvokeResponse }> {
  if (!req.prompt || !req.prompt.trim()) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'BAD_REQUEST',
        message: 'Prompt cannot be empty.',
      },
    };
  }

  const creds = resolveGeminiCredentials(config);
  if (!creds.options) {
    return {
      status: creds.errorStatus ?? 400,
      body: {
        ok: false,
        code: creds.errorCode ?? 'MISSING_CREDENTIALS',
        message: creds.errorMessage ?? 'Gemini credentials are missing.',
      },
    };
  }

  const model = req.model ?? config.model;
  const assembledInput = buildGeminiPrompt(req);

  try {
    const client = new GoogleGenAI(creds.options);

    try {
      const interaction = await withTimeout(
        client.interactions.create({
          model,
          input: assembledInput,
          ...(req.previousInteractionId
            ? { previous_interaction_id: req.previousInteractionId }
            : {}),
        }),
        10_000,
        'Gemini interactions.create',
      );
      const text = extractInteractionText(interaction);
      const interactionId =
        typeof (interaction as { id?: unknown }).id === 'string'
          ? (interaction as { id: string }).id
          : undefined;

      return {
        status: 200,
        body: {
          ok: true,
          text,
          interactionId,
        },
      };
    } catch (interactionErr) {
      const classified = classifyGeminiError(interactionErr, creds.apiKey);
      // Fallback to generateContent only when /interactions returns 404 (not supported by proxy)
      if (classified.code !== 'MODEL_NOT_FOUND') {
        return {
          status: classified.status,
          body: {
            ok: false,
            code: classified.code,
            message: classified.message,
          },
        };
      }

      const generated = await withTimeout(
        client.models.generateContent({
          model,
          contents: assembledInput,
        }),
        10_000,
        'Gemini generateContent',
      );
      return {
        status: 200,
        body: {
          ok: true,
          text: generated.text ?? '',
        },
      };
    }
  } catch (err) {
    const classified = classifyGeminiError(err, creds.apiKey);
    return {
      status: classified.status,
      body: {
        ok: false,
        code: classified.code,
        message: classified.message,
      },
    };
  }
}
