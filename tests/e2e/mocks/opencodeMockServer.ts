import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

export type OpenCodeAuthMode = 'none' | 'basic' | 'bearer';

export type OpenCodeFault =
  | null
  | 401
  | 404
  | 500
  | 'invalid_json'
  | 'hang';

export interface OpenCodeFaultRule {
  fault: OpenCodeFault;
  /** Optional path prefix filter, e.g. '/session' or '/global/health' */
  pathPrefix?: string;
  /** Optional HTTP method filter, e.g. 'POST' */
  method?: string;
  /** If true, fault triggers once then auto-resets to null */
  once?: boolean;
}

export interface OpenCodeCapturedRequest {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  pathname: string;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  jsonBody: unknown | null;
}

export interface OpenCodeMockProvider {
  id: string;
  name: string;
  models: Record<string, { id: string; name: string }>;
}

export interface OpenCodeMockOptions {
  authMode?: OpenCodeAuthMode;
  username?: string;
  secret?: string;
  version?: string;
  initialFault?: OpenCodeFault | OpenCodeFaultRule | null;
  providers?: OpenCodeMockProvider[];
  defaultModel?: string;
  strictSessions?: boolean;
  messageResponder?: (ctx: {
    sessionId: string;
    promptText: string;
    body: Record<string, unknown> | null;
  }) => string;
}

export interface OpenCodeMockServer {
  readonly port: number;
  readonly baseUrl: string;
  readonly requests: ReadonlyArray<OpenCodeCapturedRequest>;
  getRequests(): OpenCodeCapturedRequest[];
  clearRequests(): void;
  setAuth(auth: { authMode: OpenCodeAuthMode; username?: string; secret?: string }): void;
  setFault(fault: OpenCodeFault | OpenCodeFaultRule | null): void;
  clearFault(): void;
  setMessageResponder(fn?: OpenCodeMockOptions['messageResponder']): void;
  close(): Promise<void>;
}

interface SessionRecord {
  id: string;
  slug: string;
  projectID: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_PROVIDERS: OpenCodeMockProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: {
      'claude-sonnet-4-5': { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: {
      'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o' },
    },
  },
];

function normalizePathname(pathname: string): string {
  const collapsed = pathname.replace(/\/+/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1);
  }
  return collapsed || '/';
}

function normalizeFaultRule(
  input: OpenCodeFault | OpenCodeFaultRule | null | undefined,
): OpenCodeFaultRule | null {
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

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(body, 'utf8')),
    ...extraHeaders,
  });
  res.end(body);
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

function extractPromptText(body: Record<string, unknown> | null): string {
  if (!body) {
    return '';
  }
  if (Array.isArray(body.parts)) {
    const texts: string[] = [];
    for (const part of body.parts) {
      if (
        part &&
        typeof part === 'object' &&
        (part as Record<string, unknown>).type === 'text' &&
        typeof (part as Record<string, unknown>).text === 'string'
      ) {
        texts.push((part as Record<string, unknown>).text as string);
      }
    }
    if (texts.length > 0) {
      return texts.join('\n');
    }
  }
  if (typeof body.text === 'string') {
    return body.text;
  }
  if (typeof body.prompt === 'string') {
    return body.prompt;
  }
  return '';
}

function formatChartContextSummary(chartContext: unknown): string {
  if (!chartContext || typeof chartContext !== 'object') {
    return '';
  }
  const ctx = chartContext as Record<string, unknown>;
  const fields: string[] = [];
  if (typeof ctx.symbol === 'string' && ctx.symbol.length > 0) {
    fields.push(`symbol=${ctx.symbol}`);
  }
  if (typeof ctx.timeframe === 'string' && ctx.timeframe.length > 0) {
    fields.push(`timeframe=${ctx.timeframe}`);
  }
  if (fields.length > 0) {
    return ` [${fields.join(', ')}]`;
  }
  return ` [context=${JSON.stringify(chartContext).slice(0, 120)}]`;
}

export async function startOpenCodeMockServer(
  options: OpenCodeMockOptions = {},
): Promise<OpenCodeMockServer> {
  let authMode: OpenCodeAuthMode = options.authMode ?? 'none';
  let expectedUsername = options.username ?? 'opencode';
  let expectedSecret = options.secret ?? '';
  const version = options.version ?? '1.19.5-mock';
  let faultRule: OpenCodeFaultRule | null = normalizeFaultRule(options.initialFault);
  const providers: OpenCodeMockProvider[] = options.providers ?? DEFAULT_PROVIDERS;
  const defaultModel = options.defaultModel ?? 'anthropic/claude-sonnet-4-5';
  const strictSessions = options.strictSessions ?? false;
  let messageResponder = options.messageResponder;

  const capturedRequests: OpenCodeCapturedRequest[] = [];
  const sessions = new Map<string, SessionRecord>();
  const sockets = new Set<Socket>();
  let requestCounter = 0;
  let sessionCounter = 0;
  let messageCounter = 0;
  let partCounter = 0;
  let closePromise: Promise<void> | null = null;
  let serverPort = 0;

  const verifyAuth = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (authMode === 'none') {
      return true;
    }

    const authHeader = getHeaderString(req.headers, 'authorization');

    if (authMode === 'basic') {
      if (!authHeader || !/^Basic\s+/i.test(authHeader)) {
        sendJson(
          res,
          401,
          { error: 'Unauthorized', message: 'Invalid Basic authentication credentials' },
          { 'WWW-Authenticate': 'Basic realm="opencode"' },
        );
        return false;
      }
      const token = authHeader.replace(/^Basic\s+/i, '').trim();
      if (!token) {
        sendJson(
          res,
          401,
          { error: 'Unauthorized', message: 'Invalid Basic authentication credentials' },
          { 'WWW-Authenticate': 'Basic realm="opencode"' },
        );
        return false;
      }
      let decoded = '';
      try {
        decoded = Buffer.from(token, 'base64').toString('utf8');
      } catch {
        sendJson(
          res,
          401,
          { error: 'Unauthorized', message: 'Invalid Basic authentication credentials' },
          { 'WWW-Authenticate': 'Basic realm="opencode"' },
        );
        return false;
      }
      const colonIdx = decoded.indexOf(':');
      if (colonIdx === -1) {
        sendJson(
          res,
          401,
          { error: 'Unauthorized', message: 'Invalid Basic authentication credentials' },
          { 'WWW-Authenticate': 'Basic realm="opencode"' },
        );
        return false;
      }
      const user = decoded.slice(0, colonIdx);
      const pass = decoded.slice(colonIdx + 1);
      if (
        !timingSafeEqualStrings(user, expectedUsername) ||
        !timingSafeEqualStrings(pass, expectedSecret)
      ) {
        sendJson(
          res,
          401,
          { error: 'Unauthorized', message: 'Invalid Basic authentication credentials' },
          { 'WWW-Authenticate': 'Basic realm="opencode"' },
        );
        return false;
      }
      return true;
    }

    // authMode === 'bearer'
    const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch) {
      sendJson(
        res,
        401,
        { error: 'Unauthorized', message: 'Invalid Bearer token' },
        { 'WWW-Authenticate': 'Bearer realm="opencode"' },
      );
      return false;
    }
    const token = bearerMatch[1].trim();
    if (!expectedSecret || !timingSafeEqualStrings(token, expectedSecret)) {
      sendJson(
        res,
        401,
        { error: 'Unauthorized', message: 'Invalid Bearer token' },
        { 'WWW-Authenticate': 'Bearer realm="opencode"' },
      );
      return false;
    }
    return true;
  };

  const matchAndConsumeFault = (
    method: string,
    pathname: string,
  ): OpenCodeFault => {
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
          sendJson(res, 400, { error: 'Bad Request', message: 'Malformed request URL' });
        }
        return;
      }
      const pathname = normalizePathname(parsedUrl.pathname);
      const query: Record<string, string> = {};
      parsedUrl.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      let rawBody = '';
      try {
        rawBody = await readRequestBody(req);
      } catch {
        if (!res.writableEnded) {
          sendJson(res, 400, { error: 'Bad Request', message: 'Failed to read request body' });
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
        id: `oc_req_${requestCounter}`,
        timestamp: new Date().toISOString(),
        method,
        url: rawUrl,
        pathname,
        query,
        headers: { ...req.headers },
        rawBody,
        jsonBody,
      });

      const activeFault = matchAndConsumeFault(method, pathname);
      if (activeFault !== null) {
        if (activeFault === 'hang') {
          return;
        }
        if (activeFault === 'invalid_json') {
          const corrupt = '{not-valid-json';
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': String(Buffer.byteLength(corrupt, 'utf8')),
          });
          res.end(corrupt);
          return;
        }
        if (activeFault === 401) {
          const headers: Record<string, string> =
            authMode === 'basic'
              ? { 'WWW-Authenticate': 'Basic realm="opencode"' }
              : authMode === 'bearer'
                ? { 'WWW-Authenticate': 'Bearer realm="opencode"' }
                : {};
          sendJson(
            res,
            401,
            { error: 'Unauthorized', message: 'Injected 401 fault' },
            headers,
          );
          return;
        }
        if (activeFault === 404) {
          sendJson(res, 404, { error: 'Not Found', message: 'Injected 404 fault' });
          return;
        }
        sendJson(res, 500, {
          error: 'Internal Server Error',
          message: 'Injected 500 fault',
        });
        return;
      }

      if (!verifyAuth(req, res)) {
        return;
      }

      if (method === 'GET' && pathname === '/global/health') {
        sendJson(res, 200, { healthy: true, version });
        return;
      }

      if (method === 'GET' && pathname === '/provider') {
        sendJson(res, 200, {
          all: providers,
          default: { model: defaultModel },
          connected: providers.map((p) => p.id),
        });
        return;
      }

      if (method === 'GET' && pathname === '/config/providers') {
        sendJson(res, 200, {
          providers,
          default: { model: defaultModel },
          all: providers,
          connected: providers.map((p) => p.id),
        });
        return;
      }

      if (method === 'GET' && pathname === '/config') {
        sendJson(res, 200, {
          $schema: 'https://opencode.ai/config.json',
          model: defaultModel,
          username: expectedUsername,
          server: {
            hostname: '127.0.0.1',
            port: serverPort,
          },
        });
        return;
      }

      if (method === 'POST' && pathname === '/session') {
        if (jsonParseFailed) {
          sendJson(res, 400, { error: 'Bad Request', message: 'Invalid JSON body' });
          return;
        }
        const bodyObj =
          jsonBody && typeof jsonBody === 'object' && !Array.isArray(jsonBody)
            ? (jsonBody as Record<string, unknown>)
            : {};
        sessionCounter += 1;
        const id = `ses_mock_${sessionCounter}`;
        const now = Date.now();
        const record: SessionRecord = {
          id,
          slug: id,
          projectID: 'prj_mock',
          title:
            typeof bodyObj.title === 'string' && bodyObj.title.trim().length > 0
              ? bodyObj.title
              : 'Mock Chart Session',
          createdAt: now,
          updatedAt: now,
        };
        sessions.set(id, record);
        sendJson(res, 200, record);
        return;
      }

      const messageMatch = pathname.match(/^\/session\/([^/]+)\/message$/);
      if (method === 'POST' && messageMatch) {
        if (jsonParseFailed) {
          sendJson(res, 400, { error: 'Bad Request', message: 'Invalid JSON body' });
          return;
        }
        let sessionId: string;
        try {
          sessionId = decodeURIComponent(messageMatch[1]);
        } catch {
          sendJson(res, 400, { error: 'Bad Request', message: 'Malformed session ID encoding' });
          return;
        }
        if (strictSessions && !sessions.has(sessionId)) {
          sendJson(res, 404, { error: 'Not Found', message: 'Session not found' });
          return;
        }

        const bodyObj =
          jsonBody && typeof jsonBody === 'object' && !Array.isArray(jsonBody)
            ? (jsonBody as Record<string, unknown>)
            : null;

        const promptText = extractPromptText(bodyObj);
        const replyText = messageResponder
          ? messageResponder({ sessionId, promptText, body: bodyObj })
          : `[OpenCode Mock]${formatChartContextSummary(bodyObj?.chartContext)} Analyzed request: ${promptText.slice(0, 200)}`;

        const modelObj =
          bodyObj?.model && typeof bodyObj.model === 'object' && !Array.isArray(bodyObj.model)
            ? (bodyObj.model as Record<string, unknown>)
            : null;
        const providerID =
          typeof modelObj?.providerID === 'string' ? modelObj.providerID : 'anthropic';
        const modelID =
          typeof modelObj?.modelID === 'string' ? modelObj.modelID : 'claude-sonnet-4-5';

        messageCounter += 1;
        partCounter += 1;
        const messageID = `msg_mock_${messageCounter}`;
        const partID = `prt_mock_${partCounter}`;
        const created = Date.now();
        const completed = created + 10;

        sendJson(res, 200, {
          info: {
            id: messageID,
            sessionID: sessionId,
            role: 'assistant',
            providerID,
            modelID,
            time: { created, completed },
          },
          parts: [
            {
              id: partID,
              sessionID: sessionId,
              messageID,
              type: 'text',
              text: replyText,
            },
          ],
        });
        return;
      }

      sendJson(res, 404, {
        error: 'Not Found',
        message: `Unknown route: ${method} ${pathname}`,
      });
    } catch {
      if (!res.writableEnded) {
        sendJson(res, 500, {
          error: 'Internal Server Error',
          message: 'Unexpected OpenCode mock server error',
        });
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
        reject(new Error('Failed to resolve ephemeral OpenCode mock server port'));
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
    get requests(): ReadonlyArray<OpenCodeCapturedRequest> {
      return capturedRequests;
    },
    getRequests(): OpenCodeCapturedRequest[] {
      return [...capturedRequests];
    },
    clearRequests(): void {
      capturedRequests.length = 0;
    },
    setAuth(auth): void {
      authMode = auth.authMode;
      if (auth.username !== undefined) {
        expectedUsername = auth.username;
      }
      if (auth.secret !== undefined) {
        expectedSecret = auth.secret;
      }
    },
    setFault(fault): void {
      faultRule = normalizeFaultRule(fault);
    },
    clearFault(): void {
      faultRule = null;
    },
    setMessageResponder(fn): void {
      messageResponder = fn;
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
