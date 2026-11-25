import type {
  AIProviderInvokeRequest,
  AIProviderInvokeResponse,
  AIProviderTestResponse,
  BigQueryDryRunRequest,
  BigQueryDryRunResponse,
  BigQueryExecuteRequest,
  BigQueryExecuteResponse,
  BigQueryPresetsResponse,
  BigQueryTestResponse,
  ConnectionsUpdateRequest,
  GeminiInvokeRequest,
  GeminiInvokeResponse,
  GeminiTestResponse,
  HealthResponse,
  MarketDetailsResponse,
  MarketHistoryResponse,
  MarketOhlcvResponse,
  MarketSymbolsResponse,
  MaskedConnectionsResponse,
  MasterPromptRequest,
  MasterPromptResponse,
  OHLCVBar,
  OpenCodeAutostartResponse,
  OpenCodeInvokeRequest,
  OpenCodeInvokeResponse,
  OpenCodeStatusResponse,
  OpenCodeTestResponse,
  PaperAccountState,
  PaperFirewallConfig,
  PaperManualOrderRequest,
  PaperTradingBot,
  StrategyBacktestRequest,
  StrategyBacktestResponse,
  StrategyExplainRequest,
  StrategyExplainResponse,
  StrategyRefineRequest,
  StrategyRuleSpec,
  StrategySweepRequest,
  StrategySweepResponse,
  Timeframe,
} from '../../shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ErrorPayload {
  message?: string;
  error?: string;
  code?: string;
  details?: unknown;
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined;
  const headers = new Headers(init?.headers);
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new ApiError(text || `HTTP ${response.status}`, response.status);
      }
      throw new ApiError('Invalid JSON response from server', response.status, 'INVALID_JSON');
    }
  }

  if (!response.ok) {
    const errObj = (parsed && typeof parsed === 'object' ? parsed : {}) as ErrorPayload;
    const message =
      errObj.message || errObj.error || `Request failed with status ${response.status}`;
    const code = errObj.code || errObj.error;
    throw new ApiError(message, response.status, code, errObj.details);
  }

  return parsed as T;
}

export const apiClient = {
  checkHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return apiFetch<HealthResponse>('/api/health', { signal });
  },

  getSymbols(
    params?: { q?: string; assetClass?: string; live?: boolean; refresh?: boolean },
    signal?: AbortSignal,
  ): Promise<MarketSymbolsResponse> {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.assetClass) qs.set('assetClass', params.assetClass);
    if (params?.live !== undefined) qs.set('live', String(params.live));
    if (params?.refresh) qs.set('refresh', 'true');
    const query = qs.toString();
    return apiFetch<MarketSymbolsResponse>(
      `/api/market/symbols${query ? `?${query}` : ''}`,
      { signal },
    );
  },

  getOHLCV(
    params: {
      symbol: string;
      timeframe: Timeframe;
      limit?: number;
      live?: boolean;
      refresh?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<MarketOhlcvResponse> {
    const qs = new URLSearchParams({
      symbol: params.symbol,
      timeframe: params.timeframe,
    });
    if (params.limit !== undefined) {
      qs.set('limit', String(params.limit));
    }
    if (params.live !== undefined) {
      qs.set('live', String(params.live));
    }
    if (params.refresh) {
      qs.set('refresh', 'true');
    }
    const endpoint =
      params.limit !== undefined && params.limit > 1000
        ? '/api/market/history'
        : '/api/market/ohlcv';
    return apiFetch<MarketOhlcvResponse>(`${endpoint}?${qs.toString()}`, {
      signal,
    });
  },

  getUltraHistory(
    params: {
      symbol: string;
      timeframe: Timeframe;
      limit?: number;
      before?: number;
      from?: number;
      to?: number;
      live?: boolean;
      refresh?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<MarketHistoryResponse> {
    const qs = new URLSearchParams({
      symbol: params.symbol,
      timeframe: params.timeframe,
    });
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.before !== undefined) qs.set('before', String(params.before));
    if (params.from !== undefined) qs.set('from', String(params.from));
    if (params.to !== undefined) qs.set('to', String(params.to));
    if (params.live !== undefined) qs.set('live', String(params.live));
    if (params.refresh) qs.set('refresh', 'true');
    return apiFetch<MarketHistoryResponse>(`/api/market/history?${qs.toString()}`, {
      signal,
    });
  },

  getSymbolDetails(
    symbol: string,
    signal?: AbortSignal,
    live?: boolean,
    refresh?: boolean,
  ): Promise<MarketDetailsResponse> {
    const qs = new URLSearchParams({ symbol });
    if (live !== undefined) qs.set('live', String(live));
    if (refresh) qs.set('refresh', 'true');
    return apiFetch<MarketDetailsResponse>(`/api/market/details?${qs.toString()}`, {
      signal,
    });
  },

  getConnections(signal?: AbortSignal): Promise<MaskedConnectionsResponse> {
    return apiFetch<MaskedConnectionsResponse>('/api/connections', { signal });
  },

  saveConnections(payload: ConnectionsUpdateRequest): Promise<MaskedConnectionsResponse> {
    return apiFetch<MaskedConnectionsResponse>('/api/connections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getOpenCodeStatus(signal?: AbortSignal): Promise<OpenCodeStatusResponse> {
    return apiFetch<OpenCodeStatusResponse>('/api/opencode/status', { signal });
  },

  autostartOpenCode(port?: number): Promise<OpenCodeAutostartResponse> {
    return apiFetch<OpenCodeAutostartResponse>('/api/opencode/autostart', {
      method: 'POST',
      body: JSON.stringify(port !== undefined ? { port } : {}),
    });
  },

  stopOpenCode(): Promise<{ ok: boolean; stopped: boolean }> {
    return apiFetch<{ ok: boolean; stopped: boolean }>('/api/opencode/stop', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  testOpenCode(): Promise<OpenCodeTestResponse> {
    return apiFetch<OpenCodeTestResponse>('/api/opencode/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  invokeOpenCode(payload: OpenCodeInvokeRequest): Promise<OpenCodeInvokeResponse> {
    return apiFetch<OpenCodeInvokeResponse>('/api/opencode/invoke', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  testGemini(): Promise<GeminiTestResponse> {
    return apiFetch<GeminiTestResponse>('/api/gemini/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  invokeGemini(payload: GeminiInvokeRequest): Promise<GeminiInvokeResponse> {
    return apiFetch<GeminiInvokeResponse>('/api/gemini/invoke', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  testAIProvider(provider: 'deepseek' | 'byok'): Promise<AIProviderTestResponse> {
    return apiFetch<AIProviderTestResponse>('/api/ai/test', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  },

  invokeAIProvider(payload: AIProviderInvokeRequest): Promise<AIProviderInvokeResponse> {
    return apiFetch<AIProviderInvokeResponse>('/api/ai/invoke', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getBigQueryPresets(symbol: string, signal?: AbortSignal): Promise<BigQueryPresetsResponse> {
    const qs = new URLSearchParams({ symbol });
    return apiFetch<BigQueryPresetsResponse>(`/api/bigquery/presets?${qs.toString()}`, {
      signal,
    });
  },

  testBigQuery(): Promise<BigQueryTestResponse> {
    return apiFetch<BigQueryTestResponse>('/api/bigquery/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  dryRunBigQuery(payload: BigQueryDryRunRequest): Promise<BigQueryDryRunResponse> {
    return apiFetch<BigQueryDryRunResponse>('/api/bigquery/dry-run', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  executeBigQuery(payload: BigQueryExecuteRequest): Promise<BigQueryExecuteResponse> {
    return apiFetch<BigQueryExecuteResponse>('/api/bigquery/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  generateMasterPrompt(payload: MasterPromptRequest): Promise<MasterPromptResponse> {
    return apiFetch<MasterPromptResponse>('/api/strategy/master-prompt', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  refineMasterPrompt(payload: StrategyRefineRequest): Promise<MasterPromptResponse> {
    return apiFetch<MasterPromptResponse>('/api/strategy/refine', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  runStrategyBacktest(payload: StrategyBacktestRequest): Promise<StrategyBacktestResponse> {
    return apiFetch<StrategyBacktestResponse>('/api/strategy/backtest', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  runStrategySweep(payload: StrategySweepRequest): Promise<StrategySweepResponse> {
    return apiFetch<StrategySweepResponse>('/api/strategy/sweep', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  explainStrategyDecision(
    payload: StrategyExplainRequest,
  ): Promise<StrategyExplainResponse> {
    return apiFetch<StrategyExplainResponse>('/api/strategy/explain', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getPaperState(): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>('/api/paper/state');
  },

  deployPaperBot(payload: {
    name?: string;
    symbol: string;
    timeframe: Timeframe;
    spec: StrategyRuleSpec;
    approvedMasterPrompt: string;
  }): Promise<{ ok: boolean; bot?: PaperTradingBot; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; bot?: PaperTradingBot; state: PaperAccountState }>(
      '/api/paper/bots',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  manualPaperTrade(payload: {
    symbol: string;
    side: 'long' | 'short';
    notionalUsd?: number;
    quantity?: number;
    livePrice: number;
    reason?: string;
  }): Promise<{ ok: boolean; state: PaperAccountState; message?: string }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState; message?: string }>(
      '/api/paper/manual-trade',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  togglePaperBot(id: string): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>(
      `/api/paper/bots/${encodeURIComponent(id)}/toggle`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
  },

  deletePaperBot(id: string): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>(
      `/api/paper/bots/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  },

  evaluatePaperBots(payload: {
    symbol: string;
    timeframe: Timeframe;
    bars?: OHLCVBar[];
    livePrice?: number;
  }): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>('/api/paper/evaluate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  triggerPaperKillSwitch(
    reason?: string,
    latestPrices?: Record<string, number>,
  ): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>('/api/paper/kill-switch', {
      method: 'POST',
      body: JSON.stringify({ reason, latestPrices }),
    });
  },

  resetPaperAccount(
    initialCash?: number,
  ): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>('/api/paper/reset', {
      method: 'POST',
      body: JSON.stringify({ initialCash }),
    });
  },

  placePaperOrder(
    payload: PaperManualOrderRequest,
  ): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>('/api/paper/order', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  closePaperPosition(payload: {
    botId: string;
    symbol: string;
    exitPrice?: number;
  }): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>(
      '/api/paper/positions/close',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  updatePaperBrackets(payload: {
    botId: string;
    symbol: string;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  }): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>(
      '/api/paper/positions/brackets',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  updatePaperFirewall(
    payload: Partial<PaperFirewallConfig>,
  ): Promise<{ ok: boolean; state: PaperAccountState }> {
    return apiFetch<{ ok: boolean; state: PaperAccountState }>('/api/paper/firewall', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
