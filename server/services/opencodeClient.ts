import type {
  ChartContextPayload,
  OpenCodeConfig,
  OpenCodeInvokeRequest,
  OpenCodeInvokeResponse,
  OpenCodeProviderModel,
  OpenCodeTestResponse,
} from '../../shared/types.js';
import { scrubSecrets, validateHttpUrl } from './connectionsStore.js';

function buildOpenCodeHeaders(config: OpenCodeConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (config.authMode === 'basic') {
    const user = config.username?.trim() || 'opencode';
    const pass = config.secret ?? '';
    const token = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${token}`;
  } else if (config.authMode === 'bearer') {
    headers.Authorization = `Bearer ${config.secret ?? ''}`;
  }
  return headers;
}

const NON_CHAT_MODEL_PATTERN =
  /(?:embedding|imagen|veo|lyria|tts|whisper|image-preview|-image$|live-translate)/i;

function isChatCapableModel(mObj: Record<string, unknown>, modelID: string): boolean {
  if (NON_CHAT_MODEL_PATTERN.test(modelID)) {
    return false;
  }
  const caps =
    mObj.capabilities && typeof mObj.capabilities === 'object'
      ? (mObj.capabilities as Record<string, unknown>)
      : mObj.modalities && typeof mObj.modalities === 'object'
        ? (mObj.modalities as Record<string, unknown>)
        : null;
  if (caps) {
    const out =
      caps.output && typeof caps.output === 'object'
        ? (caps.output as Record<string, unknown>)
        : null;
    const inp =
      caps.input && typeof caps.input === 'object'
        ? (caps.input as Record<string, unknown>)
        : null;
    if (out && out.text === false) return false;
    if (inp && inp.text === false) return false;
  }
  return true;
}

function scoreModelPriority(model: OpenCodeProviderModel): number {
  if (model.providerID === 'opencode') {
    if (model.modelID === 'big-pickle') return 0;
    if (model.modelID.includes('deepseek')) return 1;
    if (model.modelID.includes('mimo')) return 2;
    return 5;
  }
  if (model.providerID === 'google') {
    if (/gemini-3\.[678]-flash|gemini-4-/i.test(model.modelID)) return 10;
    if (/gemini-.*flash/i.test(model.modelID)) return 12;
    if (/gemini-.*pro/i.test(model.modelID)) return 14;
    return 18;
  }
  return 25;
}

export function pickDefaultOpenCodeModel(
  models: OpenCodeProviderModel[],
): OpenCodeProviderModel | null {
  if (models.length === 0) return null;
  const bigPickle = models.find(
    (m) => m.providerID === 'opencode' && m.modelID === 'big-pickle',
  );
  if (bigPickle) return bigPickle;
  const firstOpenCode = models.find((m) => m.providerID === 'opencode');
  if (firstOpenCode) return firstOpenCode;
  return models[0];
}

export function flattenProviderModels(payload: unknown): OpenCodeProviderModel[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const providerList = Array.isArray(obj.all)
    ? obj.all
    : Array.isArray(obj.providers)
      ? obj.providers
      : [];

  const connectedIds = Array.isArray(obj.connected)
    ? new Set(obj.connected.filter((x): x is string => typeof x === 'string'))
    : null;

  const extractFromList = (list: unknown[]): OpenCodeProviderModel[] => {
    const models: OpenCodeProviderModel[] = [];
    for (const prov of list) {
      if (!prov || typeof prov !== 'object') continue;
      const pObj = prov as Record<string, unknown>;
      const providerID = typeof pObj.id === 'string' ? pObj.id : '';
      if (!providerID) continue;

      const rawModels = pObj.models;
      if (Array.isArray(rawModels)) {
        for (const m of rawModels) {
          if (m && typeof m === 'object') {
            const mObj = m as Record<string, unknown>;
            const modelID = typeof mObj.id === 'string' ? mObj.id : '';
            if (modelID && isChatCapableModel(mObj, modelID)) {
              models.push({
                providerID,
                modelID,
                name: typeof mObj.name === 'string' ? mObj.name : modelID,
              });
            }
          }
        }
      } else if (rawModels && typeof rawModels === 'object') {
        for (const [key, val] of Object.entries(rawModels as Record<string, unknown>)) {
          const mObj = val && typeof val === 'object' ? (val as Record<string, unknown>) : {};
          const modelID = typeof mObj.id === 'string' ? mObj.id : key;
          if (modelID && isChatCapableModel(mObj, modelID)) {
            models.push({
              providerID,
              modelID,
              name: typeof mObj.name === 'string' ? mObj.name : modelID,
            });
          }
        }
      }
    }
    return models
      .sort((a, b) => {
        const scoreDiff = scoreModelPriority(a) - scoreModelPriority(b);
        if (scoreDiff !== 0) return scoreDiff;
        const provDiff = a.providerID.localeCompare(b.providerID);
        if (provDiff !== 0) return provDiff;
        return (a.name || a.modelID).localeCompare(b.name || b.modelID);
      })
      .slice(0, 100);
  };

  if (connectedIds && connectedIds.size > 0) {
    const filteredList = providerList.filter((prov) => {
      if (!prov || typeof prov !== 'object') return false;
      const id = (prov as Record<string, unknown>).id;
      return typeof id === 'string' && connectedIds.has(id);
    });
    const connectedModels = extractFromList(filteredList);
    if (connectedModels.length > 0) {
      return connectedModels;
    }
  }

  return extractFromList(providerList);
}

function formatChartContextForOpenCode(ctx: ChartContextPayload): string {
  const lines: string[] = [
    `Active Chart: ${ctx.symbol} (${ctx.timeframe})`,
  ];
  if (ctx.lastBar) {
    lines.push(
      `Latest Bar: time=${new Date(ctx.lastBar.time * 1000).toISOString()} O=${ctx.lastBar.open} H=${ctx.lastBar.high} L=${ctx.lastBar.low} C=${ctx.lastBar.close} V=${ctx.lastBar.volume}`,
    );
  }
  if (ctx.activeIndicators && ctx.activeIndicators.length > 0) {
    const desc = ctx.activeIndicators
      .map((i) => `${i.name}(${Object.values(i.params).join(', ')})`)
      .join(', ');
    lines.push(`Active Indicators: ${desc}`);
  }
  if (ctx.selectedRange) {
    lines.push(
      `Selected AI Range: ${ctx.selectedRange.barCount} bars (${new Date(ctx.selectedRange.startTime * 1000).toISOString()} to ${new Date(ctx.selectedRange.endTime * 1000).toISOString()})`,
    );
  }
  if (ctx.chartOverlay?.forecast) {
    const pts = ctx.chartOverlay.forecast.points;
    const lastPt = pts[pts.length - 1];
    lines.push(
      `BigQuery Forecast (${ctx.chartOverlay.forecast.executionMode}): ${ctx.chartOverlay.forecast.label}, horizon=${pts.length}, endTarget=${lastPt ? lastPt.value.toFixed(2) : 'n/a'}`,
    );
  }
  if (ctx.chartOverlay?.anomalies && ctx.chartOverlay.anomalies.length > 0) {
    lines.push(
      `BigQuery Anomalies Detected: ${ctx.chartOverlay.anomalies.length} bars flagged`,
    );
  }
  if (ctx.recentBars && ctx.recentBars.length > 0) {
    const tail = ctx.recentBars.slice(-5).map((b) => `${b.close}`).join(', ');
    lines.push(`Recent Closes: [${tail}]`);
  }
  lines.push(
    'Chart Actions Tool Protocol: When asked to draw levels/fib/positions, add indicators, switch symbol/timeframe, toggle Volume Profile (toggle_vp) or Smart Money Concepts (toggle_smc), or open Strategy Tester (open_backtester), you may include a ```chart-actions\\n[{"type":"draw_hline","label":"Support","payload":{"price":100,"color":"#089981"}}]\\n``` block.',
  );
  return lines.join('\n');
}

function extractMessageText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.parts)) {
    const texts: string[] = [];
    const reasonings: string[] = [];
    for (const part of obj.parts) {
      if (!part || typeof part !== 'object') continue;
      const p = part as Record<string, unknown>;
      if (p.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0) {
        texts.push(p.text);
      } else if (
        p.type === 'reasoning' &&
        typeof p.text === 'string' &&
        p.text.trim().length > 0
      ) {
        reasonings.push(p.text);
      }
    }
    if (texts.length > 0) return texts.join('\n');
    if (reasonings.length > 0) return reasonings.join('\n');
  }
  if (typeof obj.messageText === 'string') return obj.messageText;
  if (typeof obj.text === 'string') return obj.text;
  return '';
}

function extractOpenCodeInfoError(
  infoObj: Record<string, unknown> | null,
): { name: string; message: string } | null {
  if (!infoObj || !infoObj.error || typeof infoObj.error !== 'object') {
    return null;
  }
  const errObj = infoObj.error as Record<string, unknown>;
  const name = typeof errObj.name === 'string' ? errObj.name : 'OpenCodeError';
  const dataObj =
    errObj.data && typeof errObj.data === 'object'
      ? (errObj.data as Record<string, unknown>)
      : null;
  const rawMessage =
    (typeof dataObj?.message === 'string' && dataObj.message.trim()) ||
    (typeof errObj.message === 'string' && errObj.message.trim()) ||
    name;
  return { name, message: rawMessage };
}

function resolveOpenCodeUrl(config: OpenCodeConfig): { baseUrl?: string; error?: string } {
  const raw = config.serverUrl?.trim();
  if (!raw) {
    return { error: 'OpenCode server URL is required.' };
  }
  try {
    return { baseUrl: validateHttpUrl(raw, 'opencode.serverUrl') };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid OpenCode URL.' };
  }
}

export async function testOpenCodeConnection(
  config: OpenCodeConfig,
): Promise<{ status: number; body: OpenCodeTestResponse }> {
  const resolved = resolveOpenCodeUrl(config);
  if (!resolved.baseUrl) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'BAD_REQUEST',
        message: resolved.error ?? 'Invalid OpenCode server URL.',
      },
    };
  }

  if (config.authMode !== 'none' && !config.secret?.trim()) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'MISSING_CREDENTIALS',
        message: 'OpenCode password or bearer token is required for the selected auth mode.',
      },
    };
  }

  const baseUrl = resolved.baseUrl;
  const headers = buildOpenCodeHeaders(config);
  const timeoutMs = Math.min(config.timeoutMs ?? 5000, 5000);

  try {
    const healthRes = await fetch(`${baseUrl}/global/health`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (healthRes.status === 401 || healthRes.status === 403) {
      return {
        status: 401,
        body: {
          ok: false,
          code: 'AUTH_INVALID',
          message:
            'OpenCode server rejected credentials (HTTP 401). Check username/OPENCODE_SERVER_PASSWORD.',
        },
      };
    }

    if (!healthRes.ok) {
      return {
        status: 502,
        body: {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: `OpenCode health endpoint returned HTTP ${healthRes.status}.`,
        },
      };
    }

    let healthJson: unknown = null;
    try {
      healthJson = (await healthRes.json()) as unknown;
    } catch {
      return {
        status: 502,
        body: {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Endpoint did not return a valid JSON health payload.',
        },
      };
    }

    const healthObj =
      healthJson && typeof healthJson === 'object'
        ? (healthJson as Record<string, unknown>)
        : null;
    if (!healthObj || healthObj.healthy !== true) {
      return {
        status: 502,
        body: {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Endpoint did not return a valid OpenCode health payload.',
        },
      };
    }

    let providers: OpenCodeProviderModel[] = [];
    try {
      const provRes = await fetch(`${baseUrl}/provider`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (provRes.ok) {
        const provJson = (await provRes.json()) as unknown;
        providers = flattenProviderModels(provJson);
      }
    } catch {
      // Provider discovery is best-effort after health succeeds
    }

    const version =
      typeof healthObj.version === 'string' ? healthObj.version : undefined;

    return {
      status: 200,
      body: {
        ok: true,
        message: `Connected to OpenCode server (${version ?? 'healthy'}).`,
        version,
        providers,
      },
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    return {
      status: 502,
      body: {
        ok: false,
        code: 'UNREACHABLE',
        message: scrubSecrets(
          `Cannot reach OpenCode server at ${baseUrl}. Run: cmd /c opencode serve --port 4096 (${rawMsg})`,
        ),
      },
    };
  }
}

export async function invokeOpenCode(
  config: OpenCodeConfig,
  req: OpenCodeInvokeRequest,
): Promise<{ status: number; body: OpenCodeInvokeResponse }> {
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

  const resolved = resolveOpenCodeUrl(config);
  if (!resolved.baseUrl) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'BAD_REQUEST',
        message: resolved.error ?? 'Invalid OpenCode server URL.',
      },
    };
  }

  if (config.authMode !== 'none' && !config.secret?.trim()) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'MISSING_CREDENTIALS',
        message: 'OpenCode password or bearer token is required for the selected auth mode.',
      },
    };
  }

  const baseUrl = resolved.baseUrl;
  const headers: Record<string, string> = {
    ...buildOpenCodeHeaders(config),
    'Content-Type': 'application/json',
  };
  const timeoutMs = config.timeoutMs ?? 60_000;

  try {
    let sessionId = req.sessionId?.trim() || '';
    if (!sessionId) {
      const title =
        req.title ?? `Chart: ${req.chartContext.symbol} (${req.chartContext.timeframe})`;
      const sessRes = await fetch(`${baseUrl}/session`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (sessRes.status === 401 || sessRes.status === 403) {
        return {
          status: 401,
          body: {
            ok: false,
            code: 'AUTH_INVALID',
            message: 'OpenCode server rejected credentials while creating session.',
          },
        };
      }

      if (!sessRes.ok) {
        return {
          status: 502,
          body: {
            ok: false,
            code: 'INVALID_RESPONSE',
            message: `Failed to create OpenCode session (HTTP ${sessRes.status}).`,
          },
        };
      }

      let sessJson: unknown;
      try {
        sessJson = (await sessRes.json()) as unknown;
      } catch {
        return {
          status: 502,
          body: {
            ok: false,
            code: 'INVALID_RESPONSE',
            message: 'Invalid JSON returned from OpenCode /session.',
          },
        };
      }

      const id =
        sessJson && typeof sessJson === 'object'
          ? (sessJson as Record<string, unknown>).id
          : null;
      if (typeof id !== 'string' || !id) {
        return {
          status: 502,
          body: {
            ok: false,
            code: 'INVALID_RESPONSE',
            message: 'OpenCode /session response did not include a session id.',
          },
        };
      }
      sessionId = id;
    }

    const contextHeader = formatChartContextForOpenCode(req.chartContext);
    const assembledPrompt = `${contextHeader}\n\nUser Request:\n${req.prompt.trim()}`;

    let selectedModel =
      req.model ??
      (config.providerId && config.modelId
        ? { providerID: config.providerId, modelID: config.modelId }
        : undefined);

    // If no model was explicitly selected, probe /provider and prefer a ready free
    // `opencode/*` chat model (e.g. opencode/big-pickle) so servers whose internal
    // default points at an unconfigured image/external provider don't fail silently.
    if (!selectedModel) {
      try {
        const provRes = await fetch(`${baseUrl}/provider`, {
          method: 'GET',
          headers: buildOpenCodeHeaders(config),
          signal: AbortSignal.timeout(3_000),
        });
        if (provRes.ok) {
          const provJson = (await provRes.json()) as unknown;
          const discovered = flattenProviderModels(provJson);
          const preferred = pickDefaultOpenCodeModel(discovered);
          if (preferred && preferred.providerID === 'opencode') {
            selectedModel = {
              providerID: preferred.providerID,
              modelID: preferred.modelID,
            };
          }
        }
      } catch {
        // Non-fatal: let OpenCode server resolve its own default model
      }
    }

    const payload: Record<string, unknown> = {
      parts: [{ type: 'text', text: assembledPrompt }],
      chartContext: req.chartContext,
    };
    if (selectedModel) {
      payload.model = selectedModel;
    }

    let msgRes = await fetch(
      `${baseUrl}/session/${encodeURIComponent(sessionId)}/message`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );

    // Some strict OpenCode server schemas reject unknown top-level keys like chartContext (HTTP 400);
    // retry cleanly with standard { parts, model } since chart context is already embedded in assembledPrompt.
    if (msgRes.status === 400) {
      const strippedPayload: Record<string, unknown> = {
        parts: payload.parts,
      };
      if (selectedModel) {
        strippedPayload.model = selectedModel;
      }
      msgRes = await fetch(
        `${baseUrl}/session/${encodeURIComponent(sessionId)}/message`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(strippedPayload),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    }

    if (msgRes.status === 401 || msgRes.status === 403) {
      return {
        status: 401,
        body: {
          ok: false,
          code: 'AUTH_INVALID',
          message: 'OpenCode server rejected credentials when sending message.',
        },
      };
    }

    if (msgRes.status === 404) {
      return {
        status: 404,
        body: {
          ok: false,
          code: 'MODEL_NOT_FOUND',
          message: 'OpenCode session or message endpoint not found (HTTP 404).',
        },
      };
    }

    if (!msgRes.ok) {
      return {
        status: 502,
        body: {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: `OpenCode message endpoint returned HTTP ${msgRes.status}.`,
        },
      };
    }

    let msgJson: unknown;
    try {
      msgJson = (await msgRes.json()) as unknown;
    } catch {
      return {
        status: 502,
        body: {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'OpenCode returned malformed JSON in message response.',
        },
      };
    }

    const messageText = extractMessageText(msgJson);
    const infoObj =
      msgJson &&
      typeof msgJson === 'object' &&
      (msgJson as Record<string, unknown>).info &&
      typeof (msgJson as Record<string, unknown>).info === 'object'
        ? ((msgJson as Record<string, unknown>).info as Record<string, unknown>)
        : null;
    const rawModel =
      infoObj && typeof infoObj.providerID === 'string' && typeof infoObj.modelID === 'string'
        ? `${infoObj.providerID}/${infoObj.modelID}`
        : undefined;

    const infoErr = extractOpenCodeInfoError(infoObj);
    if (infoErr) {
      const lower = `${infoErr.name} ${infoErr.message}`.toLowerCase();
      const isAuth =
        lower.includes('auth') ||
        lower.includes('api key') ||
        lower.includes('unauthorized') ||
        lower.includes('credential');
      const isQuota = lower.includes('429') || lower.includes('rate limit') || lower.includes('quota');
      const code = isAuth ? 'AUTH_INVALID' : isQuota ? 'RATE_LIMITED' : 'INVALID_RESPONSE';
      const status = isAuth ? 401 : isQuota ? 429 : 502;
      return {
        status,
        body: {
          ok: false,
          code,
          sessionId,
          rawModel,
          message: scrubSecrets(
            `OpenCode model${rawModel ? ` (${rawModel})` : ''} error: ${infoErr.message}`,
          ),
        },
      };
    }

    if (!messageText.trim()) {
      return {
        status: 502,
        body: {
          ok: false,
          code: 'INVALID_RESPONSE',
          sessionId,
          rawModel,
          message: `OpenCode${rawModel ? ` (${rawModel})` : ''} returned an empty response. Try selecting another model (e.g. opencode/big-pickle).`,
        },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        sessionId,
        messageText,
        rawModel,
      },
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    return {
      status: 502,
      body: {
        ok: false,
        code: 'UNREACHABLE',
        message: scrubSecrets(`Failed to invoke OpenCode at ${baseUrl}: ${rawMsg}`),
      },
    };
  }
}
