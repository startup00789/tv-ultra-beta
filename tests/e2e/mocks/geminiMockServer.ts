import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

export type GeminiFault =
  | null
  | 400
  | 401
  | 403
  | 404
  | 429
  | 500
  | 'invalid_json'
  | 'hang';

export interface GeminiFaultRule {
  fault: GeminiFault;
  pathPrefix?: string;
  method?: string;
  once?: boolean;
}

export interface GeminiCapturedRequest {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  pathname: string;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  apiKeyReceived: string | null;
  rawBody: string;
  jsonBody: unknown | null;
}

export interface GeminiMockOptions {
  /** Expected API key; if set, missing key -> 400 (or 401), wrong key -> 401. Default: 'test-gemini-api-key' */
  expectedApiKey?: string | null;
  /** HTTP status returned when API key is completely missing. Default: 400 */
  missingKeyStatus?: 400 | 401;
  /** Default models returned by GET /v1beta/models */
  models?: string[];
  strictModels?: boolean;
  initialFault?: GeminiFault | GeminiFaultRule | null;
  /** Optional custom responder for interactions & generateContent */
  textResponder?: (ctx: {
    endpoint: 'interactions' | 'generateContent' | 'streamGenerateContent';
    model: string;
    promptText: string;
    body: Record<string, unknown> | null;
  }) => string;
}

export interface GeminiMockServer {
  readonly port: number;
  readonly baseUrl: string;
  readonly requests: ReadonlyArray<GeminiCapturedRequest>;
  getRequests(): GeminiCapturedRequest[];
  clearRequests(): void;
  setExpectedApiKey(key: string | null): void;
  setFault(fault: GeminiFault | GeminiFaultRule | null): void;
  clearFault(): void;
  setTextResponder(fn?: GeminiMockOptions['textResponder']): void;
  close(): Promise<void>;
}

interface GeminiModelDescriptor {
  name: string;
  baseModelId: string;
  version: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
}

interface StoredInteraction {
  id: string;
  model: string;
  status: 'completed';
  created: string;
  updated: string;
  previous_interaction_id: string | null;
  output_text: string;
  outputs: Array<{ type: 'text'; text: string }>;
  steps: Array<{
    type: 'model_output';
    content: Array<{ type: 'text'; text: string }>;
  }>;
  usage: {
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
  };
}

const DEFAULT_MODELS = [
  'gemini-3.8-flash',
  'gemini-4-argon',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

function normalizePathname(pathname: string): string {
  const collapsed = pathname.replace(/\/+/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1);
  }
  return collapsed || '/';
}

function normalizeFaultRule(
  input: GeminiFault | GeminiFaultRule | null | undefined,
): GeminiFaultRule | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input === 'object') {
    if (input.fault === null) {
      return null;
    }
    return {
      fault: input.fault,
      pathPrefix: input.pathPrefix ? normalizePathname(input.pathPrefix) : undefined,
      method: input.method?.toUpperCase(),
      once: input.once,
    };
  }
  return { fault: input };
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(body, 'utf8')),
  });
  res.end(body);
}

function sendGeminiError(
  res: ServerResponse,
  code: 400 | 401 | 403 | 404 | 429 | 500,
  message: string,
  reason?: string,
): void {
  const statusMap: Record<400 | 401 | 403 | 404 | 429 | 500, string> = {
    400: 'INVALID_ARGUMENT',
    401: 'UNAUTHENTICATED',
    403: 'PERMISSION_DENIED',
    404: 'NOT_FOUND',
    429: 'RESOURCE_EXHAUSTED',
    500: 'INTERNAL',
  };
  const errorPayload: Record<string, unknown> = {
    code,
    message,
    status: statusMap[code],
  };
  if (reason) {
    errorPayload.details = [
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason,
      },
    ];
  }
  sendJson(res, code, { error: errorPayload });
}

function getHeaderString(
  headers: IncomingMessage['headers'],
  name: string,
): string | null {
  const val = headers[name.toLowerCase()];
  if (typeof val === 'string') {
    return val;
  }
  if (Array.isArray(val) && val.length > 0) {
    return val[0] ?? null;
  }
  return null;
}

function buildModelDescriptor(id: string): GeminiModelDescriptor {
  const cleanId = id.startsWith('models/') ? id.slice('models/'.length) : id;
  const versionMatch = cleanId.match(/gemini-(\d+(?:\.\d+)?)/i);
  const version = versionMatch ? versionMatch[1] : '1.0';
  const displayName = cleanId
    .split('-')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
  return {
    name: `models/${cleanId}`,
    baseModelId: cleanId,
    version,
    displayName,
    description: `Mock ${displayName}`,
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent', 'countTokens'],
  };
}

function extractInteractionInputText(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  if (Array.isArray(input)) {
    const parts: string[] = [];
    for (const item of input) {
      if (typeof item === 'string') {
        parts.push(item);
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.text === 'string') {
          parts.push(obj.text);
        } else if (Array.isArray(obj.content)) {
          parts.push(extractInteractionInputText(obj.content));
        } else if (Array.isArray(obj.parts)) {
          parts.push(extractInteractionInputText(obj.parts));
        }
      }
    }
    return parts.filter(Boolean).join('\n');
  }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (typeof obj.text === 'string') {
      return obj.text;
    }
    return JSON.stringify(input);
  }
  return '';
}

function extractGenerateContentPromptText(contents: unknown): string {
  if (typeof contents === 'string') {
    return contents;
  }
  if (Array.isArray(contents)) {
    const texts: string[] = [];
    for (const item of contents) {
      if (typeof item === 'string') {
        texts.push(item);
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.text === 'string') {
          texts.push(obj.text);
        } else if (Array.isArray(obj.parts)) {
          for (const part of obj.parts) {
            if (part && typeof part === 'object') {
              const pObj = part as Record<string, unknown>;
              if (typeof pObj.text === 'string') {
                texts.push(pObj.text);
              }
            }
          }
        }
      }
    }
    return texts.join('\n');
  }
  if (contents && typeof contents === 'object') {
    return JSON.stringify(contents);
  }
  return '';
}

function splitIntoChunks(text: string): string[] {
  if (text.length === 0) {
    return [''];
  }
  if (text.length <= 12) {
    return [text];
  }
  const mid = Math.ceil(text.length / 3);
  const second = Math.ceil((text.length * 2) / 3);
  const chunks = [
    text.slice(0, mid),
    text.slice(mid, second),
    text.slice(second),
  ].filter((c) => c.length > 0);
  return chunks.length > 0 ? chunks : [text];
}

export async function startGeminiMockServer(
  options: GeminiMockOptions = {},
): Promise<GeminiMockServer> {
  let expectedApiKey: string | null =
    options.expectedApiKey === undefined ? 'test-gemini-api-key' : options.expectedApiKey;
  const missingKeyStatus = options.missingKeyStatus ?? 400;
  const modelIds = options.models ?? DEFAULT_MODELS;
  const modelDescriptors = modelIds.map(buildModelDescriptor);
  const strictModels = options.strictModels ?? false;
  let faultRule: GeminiFaultRule | null = normalizeFaultRule(options.initialFault);
  let textResponder = options.textResponder;

  const capturedRequests: GeminiCapturedRequest[] = [];
  const interactions = new Map<string, StoredInteraction>();
  const sockets = new Set<Socket>();
  let requestCounter = 0;
  let interactionCounter = 0;
  let responseCounter = 0;
  let closePromise: Promise<void> | null = null;
  let serverPort = 0;

  const matchAndConsumeFault = (method: string, pathname: string): GeminiFault => {
    if (!faultRule || faultRule.fault === null) {
      return null;
    }
    if (faultRule.method && faultRule.method !== method) {
      return null;
    }
    if (faultRule.pathPrefix && !pathname.startsWith(faultRule.pathPrefix)) {
      return null;
    }
    const matched = faultRule.fault;
    if (faultRule.once) {
      faultRule = null;
    }
    return matched;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const method = (req.method ?? 'GET').toUpperCase();
      const rawUrl = req.url ?? '/';
      const safeUrl = rawUrl.startsWith('//') ? rawUrl.replace(/^\/+/, '/') : rawUrl;
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(safeUrl, `http://127.0.0.1:${serverPort || 80}`);
      } catch {
        if (!res.writableEnded) {
          sendGeminiError(res, 400, 'Malformed request URL.');
        }
        return;
      }
      const pathname = normalizePathname(parsedUrl.pathname);
      const query: Record<string, string> = {};
      parsedUrl.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      const headerKey = getHeaderString(req.headers, 'x-goog-api-key');
      const queryKey = query.key ?? null;
      const apiKeyReceived = headerKey ?? queryKey;

      let rawBody = '';
      try {
        rawBody = await readRequestBody(req);
      } catch {
        if (!res.writableEnded) {
          sendGeminiError(res, 400, 'Failed to read request body');
        }
        return;
      }

      let jsonBody: unknown | null = null;
      let jsonParseFailed = false;
      if (rawBody.trim().length > 0) {
        try {
          jsonBody = JSON.parse(rawBody) as unknown;
        } catch {
          jsonParseFailed = true;
        }
      }

      requestCounter += 1;
      capturedRequests.push({
        id: `gem_req_${requestCounter}`,
        timestamp: new Date().toISOString(),
        method,
        url: rawUrl,
        pathname,
        query,
        headers: { ...req.headers },
        apiKeyReceived,
        rawBody,
        jsonBody,
      });

      const activeFault = matchAndConsumeFault(method, pathname);
      if (activeFault !== null) {
        if (activeFault === 'hang') {
          return;
        }
        if (activeFault === 'invalid_json') {
          const corrupt = '{invalid-gemini-json';
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': String(Buffer.byteLength(corrupt, 'utf8')),
          });
          res.end(corrupt);
          return;
        }
        const faultMessages: Record<400 | 401 | 403 | 404 | 429 | 500, string> = {
          400: 'Bad request (injected 400 fault).',
          401: 'Invalid or unauthorized Gemini API key (injected 401 fault).',
          403: 'Permission denied for Gemini resource (injected 403 fault).',
          404: 'Requested Gemini model or resource not found (injected 404 fault).',
          429: 'Gemini quota or rate limit exceeded (injected 429 fault).',
          500: 'Internal Gemini mock error (injected 500 fault).',
        };
        sendGeminiError(res, activeFault, faultMessages[activeFault]);
        return;
      }

      if (expectedApiKey !== null) {
        if (!apiKeyReceived || apiKeyReceived.trim() === '') {
          sendGeminiError(
            res,
            missingKeyStatus,
            'API key is missing. Pass x-goog-api-key header or ?key= parameter.',
            'API_KEY_INVALID',
          );
          return;
        }
        if (!timingSafeEqualStrings(apiKeyReceived, expectedApiKey)) {
          sendGeminiError(
            res,
            401,
            'API key not valid. Please pass a valid API key.',
            'API_KEY_INVALID',
          );
          return;
        }
      }

      if (method === 'GET' && /^\/v1(?:beta)?\/models$/.test(pathname)) {
        sendJson(res, 200, { models: modelDescriptors });
        return;
      }

      const singleModelMatch = pathname.match(/^\/v1(?:beta)?\/models\/([^/:]+)$/);
      if (method === 'GET' && singleModelMatch) {
        let requestedId: string;
        try {
          requestedId = decodeURIComponent(singleModelMatch[1]);
        } catch {
          sendGeminiError(res, 400, 'Malformed model ID encoding.');
          return;
        }
        const found = modelDescriptors.find((m) => m.baseModelId === requestedId);
        if (!found) {
          sendGeminiError(res, 404, `Model ${requestedId} not found.`);
          return;
        }
        sendJson(res, 200, found);
        return;
      }

      if (method === 'POST' && /^\/v1(?:beta)?\/interactions$/.test(pathname)) {
        if (jsonParseFailed) {
          sendGeminiError(res, 400, 'Invalid JSON body.');
          return;
        }
        const bodyObj =
          jsonBody && typeof jsonBody === 'object' && !Array.isArray(jsonBody)
            ? (jsonBody as Record<string, unknown>)
            : {};
        const model =
          typeof bodyObj.model === 'string' && bodyObj.model.length > 0
            ? bodyObj.model
            : typeof bodyObj.agent === 'string' && bodyObj.agent.length > 0
              ? bodyObj.agent
              : modelDescriptors[0]?.baseModelId ?? 'gemini-3.8-flash';
        const promptText = extractInteractionInputText(bodyObj.input);
        const replyText = textResponder
          ? textResponder({
              endpoint: 'interactions',
              model,
              promptText,
              body: bodyObj,
            })
          : `[Gemini Mock] ${promptText.slice(0, 200)}`;

        interactionCounter += 1;
        const interactionId = `v1_mock_int_${interactionCounter}`;
        const created = new Date().toISOString();
        const updated = new Date().toISOString();
        const previousInteractionId =
          typeof bodyObj.previous_interaction_id === 'string'
            ? bodyObj.previous_interaction_id
            : null;

        const inputTokens = Math.max(1, Math.ceil(promptText.length / 4));
        const outputTokens = Math.max(1, Math.ceil(replyText.length / 4));
        const usage = {
          total_input_tokens: inputTokens,
          total_output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        };

        const record: StoredInteraction = {
          id: interactionId,
          model,
          status: 'completed',
          created,
          updated,
          previous_interaction_id: previousInteractionId,
          output_text: replyText,
          outputs: [{ type: 'text', text: replyText }],
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'text', text: replyText }],
            },
          ],
          usage,
        };
        interactions.set(interactionId, record);

        const isStream = bodyObj.stream === true || query.alt === 'sse';
        if (isStream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });

          const writeEvent = (eventName: string, data: unknown): void => {
            res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
          };

          writeEvent('interaction.created', {
            event_type: 'interaction.created',
            interaction: {
              id: interactionId,
              model,
              status: 'in_progress',
              created,
              previous_interaction_id: previousInteractionId,
            },
          });

          writeEvent('step.start', {
            event_type: 'step.start',
            step: {
              index: 0,
              type: 'model_output',
              id: 'step_0',
            },
          });

          for (const chunk of splitIntoChunks(replyText)) {
            writeEvent('step.delta', {
              event_type: 'step.delta',
              step_index: 0,
              delta: { type: 'text', text: chunk },
              step: { delta: { type: 'text', text: chunk } },
            });
          }

          writeEvent('step.stop', {
            event_type: 'step.stop',
            index: 0,
            step: { index: 0, type: 'model_output' },
          });

          writeEvent('interaction.completed', {
            event_type: 'interaction.completed',
            interaction: record,
          });

          res.end();
          return;
        }

        sendJson(res, 200, record);
        return;
      }

      const getInteractionMatch = pathname.match(/^\/v1(?:beta)?\/interactions\/([^/]+)$/);
      if (method === 'GET' && getInteractionMatch) {
        let id: string;
        try {
          id = decodeURIComponent(getInteractionMatch[1]);
        } catch {
          sendGeminiError(res, 400, 'Malformed interaction ID encoding.');
          return;
        }
        const found = interactions.get(id);
        if (!found) {
          sendGeminiError(res, 404, `Interaction ${id} not found.`);
          return;
        }
        sendJson(res, 200, found);
        return;
      }

      const modelActionMatch = pathname.match(/^\/v1(?:beta)?\/models\/([^/:]+):([^/]+)$/);
      if (method === 'POST' && modelActionMatch) {
        if (jsonParseFailed) {
          sendGeminiError(res, 400, 'Invalid JSON body.');
          return;
        }
        let model: string;
        try {
          model = decodeURIComponent(modelActionMatch[1]);
        } catch {
          sendGeminiError(res, 400, 'Malformed model name encoding.');
          return;
        }
        const action = modelActionMatch[2];
        if (strictModels && !modelDescriptors.some((m) => m.baseModelId === model)) {
          sendGeminiError(res, 404, `Model ${model} not found.`);
          return;
        }
        if (action !== 'generateContent' && action !== 'streamGenerateContent') {
          sendGeminiError(res, 404, `Unsupported model action: ${action}`);
          return;
        }

        const bodyObj =
          jsonBody && typeof jsonBody === 'object' && !Array.isArray(jsonBody)
            ? (jsonBody as Record<string, unknown>)
            : {};
        const promptText = extractGenerateContentPromptText(bodyObj.contents);
        const endpointKind =
          action === 'streamGenerateContent' ? 'streamGenerateContent' : 'generateContent';
        const replyText = textResponder
          ? textResponder({
              endpoint: endpointKind,
              model,
              promptText,
              body: bodyObj,
            })
          : `[Gemini Mock] ${promptText.slice(0, 200)}`;

        responseCounter += 1;
        const responseId = `resp_mock_${responseCounter}`;
        const promptTokenCount = Math.max(1, Math.ceil(promptText.length / 4));
        const candidatesTokenCount = Math.max(1, Math.ceil(replyText.length / 4));
        const usageMetadata = {
          promptTokenCount,
          candidatesTokenCount,
          totalTokenCount: promptTokenCount + candidatesTokenCount,
        };

        if (action === 'generateContent') {
          sendJson(res, 200, {
            candidates: [
              {
                index: 0,
                content: {
                  role: 'model',
                  parts: [{ text: replyText }],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata,
            modelVersion: model,
            responseId,
          });
          return;
        }

        const chunks = splitIntoChunks(replyText);
        const chunkPayloads = chunks.map((chunk, idx) => {
          const isLast = idx === chunks.length - 1;
          return {
            candidates: [
              {
                index: 0,
                content: {
                  role: 'model',
                  parts: [{ text: chunk }],
                },
                ...(isLast ? { finishReason: 'STOP' } : {}),
              },
            ],
            ...(isLast ? { usageMetadata } : {}),
            modelVersion: model,
            responseId,
          };
        });

        const acceptHeader = getHeaderString(req.headers, 'accept') ?? '';
        if (query.alt === 'sse' || acceptHeader.includes('text/event-stream')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          for (const payload of chunkPayloads) {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
          res.end();
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(chunkPayloads));
        return;
      }

      sendGeminiError(res, 404, `Unknown Gemini route: ${method} ${pathname}`);
    } catch {
      if (!res.writableEnded) {
        sendGeminiError(res, 500, 'Unexpected Gemini mock server error.');
      }
    }
  });

  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const addr = server.address() as AddressInfo | null;
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to resolve ephemeral Gemini mock server port'));
        return;
      }
      serverPort = addr.port;
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${serverPort}`;

  return {
    get port(): number {
      return serverPort;
    },
    get baseUrl(): string {
      return baseUrl;
    },
    get requests(): ReadonlyArray<GeminiCapturedRequest> {
      return capturedRequests;
    },
    getRequests(): GeminiCapturedRequest[] {
      return [...capturedRequests];
    },
    clearRequests(): void {
      capturedRequests.length = 0;
    },
    setExpectedApiKey(key): void {
      expectedApiKey = key;
    },
    setFault(fault): void {
      faultRule = normalizeFaultRule(fault);
    },
    clearFault(): void {
      faultRule = null;
    },
    setTextResponder(fn): void {
      textResponder = fn;
    },
    close(): Promise<void> {
      if (closePromise) {
        return closePromise;
      }
      closePromise = new Promise<void>((resolve) => {
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
        for (const socket of sockets) {
          socket.destroy();
        }
        sockets.clear();
        server.close(() => {
          resolve();
        });
      });
      return closePromise;
    },
  };
}
