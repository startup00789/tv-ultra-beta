import type {
  BigQueryAuthMethod,
  BigQueryConfig,
  BigQueryMode,
  ByokConfig,
  ConnectionsUpdateRequest,
  DeepSeekConfig,
  GeminiAuthMode,
  GeminiConfig,
  GeminiModel,
  MaskedBigQueryConfig,
  MaskedByokConfig,
  MaskedConnectionsResponse,
  MaskedDeepSeekConfig,
  MaskedGeminiConfig,
  MaskedOpenCodeConfig,
  OpenCodeAuthMode,
  OpenCodeConfig,
} from '../../shared/types.js';

export class ConnectionConfigError extends Error {
  readonly statusCode = 400;
  readonly code = 'BAD_REQUEST';

  constructor(message: string) {
    super(message);
    this.name = 'ConnectionConfigError';
  }
}

export interface StoredConnectionsState {
  deepseek: DeepSeekConfig;
  opencode: OpenCodeConfig;
  byok: ByokConfig;
  gemini: GeminiConfig;
  bigquery: BigQueryConfig;
}

const VALID_OPENCODE_AUTH_MODES: ReadonlySet<OpenCodeAuthMode> = new Set([
  'none',
  'basic',
  'bearer',
]);

const VALID_GEMINI_AUTH_MODES: ReadonlySet<GeminiAuthMode> = new Set([
  'apiKey',
  'envKey',
  'vertexai',
]);

const VALID_GEMINI_MODELS: ReadonlySet<GeminiModel> = new Set([
  'gemini-3.8-flash',
  'gemini-4-argon',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
]);

const VALID_BQ_MODES: ReadonlySet<BigQueryMode> = new Set(['sandbox', 'live']);

const VALID_BQ_AUTH_METHODS: ReadonlySet<BigQueryAuthMethod> = new Set([
  'adc',
  'serviceAccountPath',
  'serviceAccountJson',
  'serviceAccount',
]);

function createDefaultState(): StoredConnectionsState {
  return {
    deepseek: {
      enabled: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
      apiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    },
    opencode: {
      enabled: false,
      serverUrl: 'http://127.0.0.1:4096',
      authMode: 'none',
      username: 'opencode',
      secret: '',
      providerId: '',
      modelId: '',
      timeoutMs: 60_000,
    },
    byok: {
      enabled: false,
      providerName: 'OpenRouter / Custom',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      model: 'deepseek/deepseek-chat',
    },
    gemini: {
      enabled: false,
      authMode: 'apiKey',
      apiKey: '',
      baseUrl: '',
      apiVersion: 'v1beta',
      model: 'gemini-3.8-flash',
      vertexProject: '',
      vertexLocation: 'us-central1',
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
      connectionId: 'DEFAULT',
      maxBytesBilled: 1_073_741_824,
    },
  };
}

let state: StoredConnectionsState = createDefaultState();

export function maskSecret(secret?: string): string {
  const trimmed = secret?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
}

export function validateHttpUrl(rawUrl: string, fieldName: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConnectionConfigError(`Invalid URL for ${fieldName}: "${trimmed}".`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConnectionConfigError(
      `Invalid protocol for ${fieldName}: expected http:// or https://.`,
    );
  }
  return trimmed.replace(/\/+$/, '');
}

export function scrubSecrets(text: string): string {
  if (!text) return text;
  let scrubbed = text;
  const secretsToScrub: string[] = [];

  if (state.deepseek.apiKey?.trim()) {
    secretsToScrub.push(state.deepseek.apiKey.trim());
  }
  if (state.opencode.secret?.trim()) {
    secretsToScrub.push(state.opencode.secret.trim());
  }
  if (state.byok.apiKey?.trim()) {
    secretsToScrub.push(state.byok.apiKey.trim());
  }
  if (state.gemini.apiKey?.trim()) {
    secretsToScrub.push(state.gemini.apiKey.trim());
  }
  if (state.bigquery.credentialsJson?.trim()) {
    secretsToScrub.push(state.bigquery.credentialsJson.trim());
  }
  const envDeepseek = process.env.DEEPSEEK_API_KEY?.trim();
  if (envDeepseek) secretsToScrub.push(envDeepseek);
  const envGemini = process.env.GEMINI_API_KEY?.trim();
  if (envGemini) secretsToScrub.push(envGemini);
  const envGoogle = process.env.GOOGLE_API_KEY?.trim();
  if (envGoogle) secretsToScrub.push(envGoogle);

  for (const s of secretsToScrub) {
    if (s.length >= 4 && scrubbed.includes(s)) {
      scrubbed = scrubbed.split(s).join('[REDACTED]');
    }
  }
  // Redact PEM private keys if accidentally echoed
  scrubbed = scrubbed.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]',
  );
  return scrubbed;
}

export function getRawConnectionsConfig(): StoredConnectionsState {
  return {
    deepseek: { ...state.deepseek },
    opencode: { ...state.opencode },
    byok: { ...state.byok },
    gemini: { ...state.gemini },
    bigquery: { ...state.bigquery },
  };
}

export function getMaskedConnectionsConfig(): MaskedConnectionsResponse {
  const dsKey = state.deepseek.apiKey ?? '';
  const deepseek: MaskedDeepSeekConfig = {
    enabled: state.deepseek.enabled,
    hasApiKey: dsKey.trim().length > 0,
    apiKeyPreview: maskSecret(dsKey),
    baseUrl: state.deepseek.baseUrl,
    model: state.deepseek.model,
  };

  const ocSecret = state.opencode.secret ?? '';
  const ocMasked = maskSecret(ocSecret);
  const opencode: MaskedOpenCodeConfig = {
    enabled: state.opencode.enabled,
    serverUrl: state.opencode.serverUrl,
    authMode: state.opencode.authMode,
    username: state.opencode.username,
    hasSecret: ocSecret.trim().length > 0,
    secretPreview: ocMasked,
    secretMasked: ocMasked,
    providerId: state.opencode.providerId,
    modelId: state.opencode.modelId,
    timeoutMs: state.opencode.timeoutMs,
  };

  const byokKey = state.byok.apiKey ?? '';
  const byok: MaskedByokConfig = {
    enabled: state.byok.enabled,
    providerName: state.byok.providerName,
    baseUrl: state.byok.baseUrl,
    hasApiKey: byokKey.trim().length > 0,
    apiKeyPreview: maskSecret(byokKey),
    model: state.byok.model,
  };

  const gemKey = state.gemini.apiKey ?? '';
  const gemMasked = maskSecret(gemKey);
  const gemini: MaskedGeminiConfig = {
    enabled: state.gemini.enabled,
    authMode: state.gemini.authMode,
    hasApiKey: gemKey.trim().length > 0,
    apiKeyPreview: gemMasked,
    apiKeyMasked: gemMasked,
    baseUrl: state.gemini.baseUrl,
    apiVersion: state.gemini.apiVersion,
    model: state.gemini.model,
    vertexProject: state.gemini.vertexProject,
    vertexLocation: state.gemini.vertexLocation,
  };

  const bqCreds = state.bigquery.credentialsJson ?? '';
  const hasCredsJson = bqCreds.trim().length > 0;
  const hasCredsPath = Boolean(state.bigquery.credentialsPath?.trim());
  const bigquery: MaskedBigQueryConfig = {
    mode: state.bigquery.mode,
    projectId: state.bigquery.projectId,
    datasetId: state.bigquery.datasetId,
    tableId: state.bigquery.tableId,
    location: state.bigquery.location,
    authMethod: state.bigquery.authMethod,
    credentialsPath: state.bigquery.credentialsPath,
    hasCredentialsJson: hasCredsJson,
    hasCredentials: hasCredsJson || hasCredsPath,
    credentialsPreview: maskSecret(bqCreds),
    connectionId: state.bigquery.connectionId,
    maxBytesBilled: state.bigquery.maxBytesBilled,
  };

  return { deepseek, opencode, byok, gemini, bigquery };
}

export function updateConnectionsConfig(
  patch: ConnectionsUpdateRequest,
): MaskedConnectionsResponse {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ConnectionConfigError('Request body must be a JSON object.');
  }

  const next: StoredConnectionsState = getRawConnectionsConfig();

  if (patch.deepseek) {
    const p = patch.deepseek;
    if (p.enabled !== undefined) next.deepseek.enabled = Boolean(p.enabled);
    if (p.baseUrl !== undefined) {
      next.deepseek.baseUrl = validateHttpUrl(p.baseUrl, 'deepseek.baseUrl') || 'https://api.deepseek.com';
    }
    if (p.model !== undefined) {
      next.deepseek.model = String(p.model).trim() || 'deepseek-chat';
    }
    if (p.apiKey !== undefined) {
      next.deepseek.apiKey = String(p.apiKey);
    }
  }

  if (patch.byok) {
    const p = patch.byok;
    if (p.enabled !== undefined) next.byok.enabled = Boolean(p.enabled);
    if (p.providerName !== undefined) {
      next.byok.providerName = String(p.providerName).trim() || 'Custom API';
    }
    if (p.baseUrl !== undefined) {
      next.byok.baseUrl = validateHttpUrl(p.baseUrl, 'byok.baseUrl') || 'https://openrouter.ai/api/v1';
    }
    if (p.model !== undefined) {
      next.byok.model = String(p.model).trim() || 'gpt-4o-mini';
    }
    if (p.apiKey !== undefined) {
      next.byok.apiKey = String(p.apiKey);
    }
  }

  if (patch.opencode) {
    const p = patch.opencode;
    if (p.authMode !== undefined) {
      if (!VALID_OPENCODE_AUTH_MODES.has(p.authMode)) {
        throw new ConnectionConfigError(
          `Invalid OpenCode authMode "${String(p.authMode)}".`,
        );
      }
      next.opencode.authMode = p.authMode;
    }
    if (p.serverUrl !== undefined) {
      const normalized = validateHttpUrl(p.serverUrl, 'opencode.serverUrl');
      next.opencode.serverUrl = normalized || 'http://127.0.0.1:4096';
    }
    if (p.enabled !== undefined) next.opencode.enabled = Boolean(p.enabled);
    if (p.username !== undefined) next.opencode.username = String(p.username).trim() || 'opencode';
    if (p.secret !== undefined) next.opencode.secret = String(p.secret);
    if (p.providerId !== undefined) next.opencode.providerId = String(p.providerId).trim();
    if (p.modelId !== undefined) next.opencode.modelId = String(p.modelId).trim();
    if (p.timeoutMs !== undefined) {
      const n = Number(p.timeoutMs);
      if (!Number.isFinite(n) || n < 200 || n > 120_000) {
        throw new ConnectionConfigError('opencode.timeoutMs must be between 200 and 120000.');
      }
      next.opencode.timeoutMs = Math.round(n);
    }
  }

  if (patch.gemini) {
    const p = patch.gemini;
    if (p.authMode !== undefined) {
      if (!VALID_GEMINI_AUTH_MODES.has(p.authMode)) {
        throw new ConnectionConfigError(
          `Invalid Gemini authMode "${String(p.authMode)}".`,
        );
      }
      next.gemini.authMode = p.authMode;
    }
    if (p.model !== undefined) {
      if (!VALID_GEMINI_MODELS.has(p.model)) {
        throw new ConnectionConfigError(
          `Invalid Gemini model "${String(p.model)}". Expected one of: gemini-3.8-flash, gemini-4-argon, gemini-3.5-flash-lite, gemini-3.1-flash-lite.`,
        );
      }
      next.gemini.model = p.model;
    }
    if (p.baseUrl !== undefined) {
      next.gemini.baseUrl = validateHttpUrl(p.baseUrl, 'gemini.baseUrl');
    }
    if (p.apiVersion !== undefined) {
      if (p.apiVersion !== 'v1beta' && p.apiVersion !== 'v1') {
        throw new ConnectionConfigError('gemini.apiVersion must be "v1beta" or "v1".');
      }
      next.gemini.apiVersion = p.apiVersion;
    }
    if (p.enabled !== undefined) next.gemini.enabled = Boolean(p.enabled);
    if (p.apiKey !== undefined) next.gemini.apiKey = String(p.apiKey);
    if (p.vertexProject !== undefined) next.gemini.vertexProject = String(p.vertexProject).trim();
    if (p.vertexLocation !== undefined) {
      next.gemini.vertexLocation = String(p.vertexLocation).trim() || 'us-central1';
    }
  }

  if (patch.bigquery) {
    const p = patch.bigquery;
    if (p.mode !== undefined) {
      if (!VALID_BQ_MODES.has(p.mode)) {
        throw new ConnectionConfigError(
          `Invalid BigQuery mode "${String(p.mode)}". Expected "sandbox" or "live".`,
        );
      }
      next.bigquery.mode = p.mode;
    }
    if (p.authMethod !== undefined) {
      if (!VALID_BQ_AUTH_METHODS.has(p.authMethod)) {
        throw new ConnectionConfigError(
          `Invalid BigQuery authMethod "${String(p.authMethod)}".`,
        );
      }
      next.bigquery.authMethod = p.authMethod;
    }
    if (p.projectId !== undefined) next.bigquery.projectId = String(p.projectId).trim();
    if (p.datasetId !== undefined) {
      next.bigquery.datasetId = String(p.datasetId).trim() || 'market_analytics';
    }
    if (p.tableId !== undefined) {
      next.bigquery.tableId = String(p.tableId).trim() || 'ohlcv_bars';
    }
    if (p.location !== undefined) next.bigquery.location = String(p.location).trim() || 'US';
    if (p.credentialsPath !== undefined) {
      next.bigquery.credentialsPath = String(p.credentialsPath).trim();
    }
    if (p.credentialsJson !== undefined) {
      const trimmedJson = String(p.credentialsJson).trim();
      if (trimmedJson.length > 0) {
        try {
          JSON.parse(trimmedJson);
        } catch {
          throw new ConnectionConfigError('bigquery.credentialsJson must be valid JSON.');
        }
      }
      next.bigquery.credentialsJson = trimmedJson;
    }
    if (p.connectionId !== undefined) {
      next.bigquery.connectionId = String(p.connectionId).trim() || 'DEFAULT';
    }
    if (p.maxBytesBilled !== undefined) {
      const n = Number(p.maxBytesBilled);
      if (!Number.isFinite(n) || n <= 0) {
        throw new ConnectionConfigError('bigquery.maxBytesBilled must be a positive number.');
      }
      next.bigquery.maxBytesBilled = Math.round(n);
    }
  }

  state = next;
  return getMaskedConnectionsConfig();
}

export function resetConnectionsConfig(): MaskedConnectionsResponse {
  state = createDefaultState();
  return getMaskedConnectionsConfig();
}
