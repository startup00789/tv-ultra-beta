// ============================================================================
// Market Data & Core Chart Types (M1, M2, E2E)
// ============================================================================

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M';

export type ChartStyle = 'candles' | 'hollow_candles' | 'bars' | 'line' | 'area';

export type ScaleMode = 'regular' | 'percent' | 'log';

export type ThemeMode = 'dark' | 'light';

export type AssetClass = 'stocks' | 'crypto' | 'indices' | 'forex' | 'metals';

export type DateRangePreset = '1D' | '5D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'All';

export type RightTab = 'watchlist' | 'ai' | 'bigquery' | 'objects' | 'alerts' | null;

export type BottomTab =
  | 'bigquery'
  | 'ai'
  | 'backtester'
  | 'autotrade'
  | 'forward_test'
  | 'alerts'
  | 'script';

export type ConnectionsTab = 'deepseek' | 'opencode' | 'byok' | 'gemini' | 'bigquery';

export interface OHLCVBar {
  time: number; // UTC unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  exchange: string;
  assetClass: AssetClass;
  last: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume30d: number;
  marketCap?: string;
  peRatio?: number;
  dividendYield?: number;
  sector?: string;
  currency?: string;
  marketOpen?: boolean;
  bid?: number;
  ask?: number;
  dayHigh?: number;
  dayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  dataSource?: 'live' | 'seeded';
  updatedAt?: string;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  timestamp?: string;
}

export interface MarketSymbolsResponse {
  symbols: SymbolInfo[];
  source?: 'live' | 'seeded';
}

export interface MarketOhlcvResponse {
  symbol: string;
  timeframe: Timeframe;
  source: 'seeded' | 'live';
  bars: OHLCVBar[];
  hasMoreBefore?: boolean;
}

export interface MarketHistoryResponse {
  symbol: string;
  timeframe: Timeframe;
  source: 'seeded' | 'live' | 'ultra_hybrid';
  bars: OHLCVBar[];
  totalBars: number;
  earliestTime: number | null;
  latestTime: number | null;
  hasMoreBefore: boolean;
}

export interface MarketDetailsResponse {
  details: SymbolInfo;
  source?: 'live' | 'seeded';
}

export type MarketStreamStatus = 'disconnected' | 'connecting' | 'live' | 'reconnecting';

export interface LiveBarTickEvent {
  symbol: string;
  timeframe: Timeframe;
  bar: OHLCVBar;
  isClosed: boolean;
}

export interface LiveQuoteTickEvent {
  symbol: string;
  last?: number;
  change?: number;
  changePercent?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  dayHigh?: number;
  dayLow?: number;
  marketOpen?: boolean;
  source?: 'trade' | 'ticker' | 'book';
  updatedAt: string;
}

export interface LiveStreamStatusEvent {
  connected: boolean;
  providers: Array<'binance' | 'yahoo'>;
  timestamp: string;
}

// ============================================================================
// Technical Indicators & Drawing Tool Types (M1 Store, M2 Canvas, M3 AI Range)
// ============================================================================

export type IndicatorType =
  | 'sma'
  | 'ema'
  | 'bb'
  | 'vwap'
  | 'supertrend'
  | 'volume'
  | 'rsi'
  | 'macd'
  | 'atr'
  | 'stoch'
  | 'adx'
  | 'obv';

export interface IndicatorConfig {
  instanceId: string; // e.g. "sma-1"
  id: IndicatorType;
  name: string; // display label, e.g. "SMA", "RSI"
  pane: 'main' | 'sub';
  visible: boolean;
  params: Record<string, number>;
  color: string;
  secondaryColor?: string;
  tertiaryColor?: string;
}

export type DrawingToolType =
  | 'crosshair'
  | 'trendline'
  | 'hline'
  | 'vline'
  | 'ray'
  | 'extended'
  | 'hray'
  | 'crossline'
  | 'channel'
  | 'regression'
  | 'fib'
  | 'fib_ext'
  | 'fib_fan'
  | 'gann_box'
  | 'pitchfork'
  | 'elliott_wave'
  | 'xabcd'
  | 'abcd'
  | 'head_shoulders'
  | 'long_position'
  | 'short_position'
  | 'anchored_vwap'
  | 'anchored_vp'
  | 'price_range'
  | 'date_range'
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'arrow'
  | 'path'
  | 'brush'
  | 'highlighter'
  | 'text'
  | 'callout'
  | 'measure'
  | 'ai-range';

export type DrawingToolId = DrawingToolType;

export interface DrawingPoint {
  time: number; // UTC unix timestamp in seconds
  price: number;
}

export type PitchforkVariant = 'original' | 'schiff' | 'modified_schiff' | 'inside';

export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted';

export const TV_DRAWING_PALETTE: readonly string[] = [
  // Row 1: Neutrals (White -> Obsidian)
  '#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#363a45', '#131722',
  // Row 2: Signature TradingView Primaries
  '#f23645', '#ff9800', '#eab308', '#089981', '#00bcd4', '#2962ff', '#7c3aed', '#ec4899',
  // Row 3: Soft Tints
  '#fca5a5', '#fdba74', '#fde047', '#6ee7b7', '#67e8f9', '#93c5fd', '#c4b5fd', '#f9a8d4',
  // Row 4: Vibrant Mid-Tones
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#f43f5e',
  // Row 5: Rich Saturated
  '#dc2626', '#ea580c', '#ca8a04', '#059669', '#0891b2', '#1d4ed8', '#6d28d9', '#db2777',
  // Row 6: Deep Institutional Shades
  '#991b1b', '#9a3412', '#854d0e', '#065f46', '#155e75', '#1e3a8a', '#4c1d95', '#831843',
] as const;

export interface DrawingStyleTemplate {
  id: string;
  name: string;
  tool?: Exclude<DrawingToolType, 'crosshair' | 'ai-range'> | 'any';
  color: string;
  lineWidth: number;
  lineStyle: DrawingLineStyle;
  lineOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: DrawingLineStyle;
  borderOpacity?: number;
  showBorder?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  showFill?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  showMidline?: boolean;
  showPriceLabels?: boolean;
  showStats?: boolean;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  fontSize?: number;
  textColor?: string;
  textBold?: boolean;
  textItalic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  fibLevels?: number[];
  reverseFib?: boolean;
  pitchforkStyle?: PitchforkVariant;
  riskAmountUsd?: number;
  visibleTimeframes?: Timeframe[];
}

export interface DrawingObject {
  id: string;
  tool: Exclude<DrawingToolType, 'crosshair' | 'ai-range'>;
  symbol: string;
  timeframe: Timeframe;
  points: DrawingPoint[];
  color: string;
  title?: string;
  lineWidth?: number;
  lineStyle?: DrawingLineStyle;
  lineOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: DrawingLineStyle;
  borderOpacity?: number;
  showBorder?: boolean;
  text?: string;
  fontSize?: number;
  textColor?: string;
  textBold?: boolean;
  textItalic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  stopPrice?: number;
  targetPrice?: number;
  riskAmountUsd?: number;
  fillColor?: string;
  fillOpacity?: number;
  showFill?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  showMidline?: boolean;
  showPriceLabels?: boolean;
  showStats?: boolean;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  fibLevels?: number[];
  reverseFib?: boolean;
  pitchforkStyle?: PitchforkVariant;
  visibleTimeframes?: Timeframe[];
  zIndex?: number;
  visible: boolean;
  locked: boolean;
  paneIndex?: number;
}

export interface AIRangeSelection {
  symbol: string;
  timeframe: Timeframe;
  startTime: number; // UTC unix timestamp in seconds
  endTime: number; // UTC unix timestamp in seconds
  startPrice?: number;
  endPrice?: number;
  barCount: number;
  bars?: OHLCVBar[];
}

// ============================================================================
// BigQuery ML Chart Overlay Types (M1 Store, M2 ChartCanvas, M4 BigQuery)
// ============================================================================

export interface ForecastPoint {
  time: number; // UTC unix seconds
  value: number;
  lowerBound: number;
  upperBound: number;
}

export interface AnomalyMarker {
  time: number; // UTC unix seconds matching a bar
  value: number;
  lowerBound: number;
  upperBound: number;
  probability: number;
  direction: 'high' | 'low';
}

export interface ChartOverlayData {
  forecast?: {
    id: string;
    label: string;
    points: ForecastPoint[];
    confidenceLevel: number;
    executionMode: 'live' | 'sandbox';
  } | null;
  anomalies?: AnomalyMarker[];
  visible?: boolean;
}

// ============================================================================
// Connections & Auth Configuration (M1 Store, M3 Connectivity, M4 BigQuery)
// ============================================================================

export type OpenCodeAuthMode = 'none' | 'basic' | 'bearer';

export interface OpenCodeConfig {
  enabled: boolean;
  serverUrl: string; // default: "http://127.0.0.1:4096"
  authMode: OpenCodeAuthMode;
  username?: string; // default: "opencode"
  secret?: string; // write-only password or bearer token
  providerId?: string;
  modelId?: string;
  timeoutMs?: number; // default: 15000
}

export interface MaskedOpenCodeConfig {
  enabled: boolean;
  serverUrl: string;
  authMode: OpenCodeAuthMode;
  username?: string;
  hasSecret: boolean;
  secretPreview: string;
  secretMasked?: string;
  providerId?: string;
  modelId?: string;
  timeoutMs?: number;
}

export type GeminiAuthMode = 'apiKey' | 'envKey' | 'vertexai';

export type GeminiModel =
  | 'gemini-3.8-flash'
  | 'gemini-4-argon'
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.1-flash-lite';

export interface GeminiConfig {
  enabled: boolean;
  authMode: GeminiAuthMode;
  apiKey?: string; // write-only
  baseUrl?: string; // optional proxy or local mock server URL
  apiVersion?: 'v1beta' | 'v1'; // default: "v1beta"
  model: GeminiModel;
  vertexProject?: string;
  vertexLocation?: string;
}

export interface MaskedGeminiConfig {
  enabled: boolean;
  authMode: GeminiAuthMode;
  hasApiKey: boolean;
  apiKeyPreview: string;
  apiKeyMasked?: string;
  baseUrl?: string;
  apiVersion?: 'v1beta' | 'v1';
  model: GeminiModel;
  vertexProject?: string;
  vertexLocation?: string;
}

export type BigQueryMode = 'sandbox' | 'live';

export type BigQueryAuthMethod =
  | 'adc'
  | 'serviceAccountPath'
  | 'serviceAccountJson'
  | 'serviceAccount';

export interface BigQueryConfig {
  mode: BigQueryMode;
  projectId?: string;
  datasetId?: string;
  tableId?: string;
  location?: string; // default: "US"
  authMethod?: BigQueryAuthMethod;
  credentialsPath?: string;
  credentialsJson?: string; // write-only
  connectionId?: string; // default: "DEFAULT"
  maxBytesBilled?: number; // default: 1073741824 (1 GB)
}

export interface MaskedBigQueryConfig {
  mode: BigQueryMode;
  projectId?: string;
  datasetId?: string;
  tableId?: string;
  location?: string;
  authMethod?: BigQueryAuthMethod;
  credentialsPath?: string;
  hasCredentialsJson: boolean;
  hasCredentials?: boolean;
  credentialsPreview: string;
  connectionId?: string;
  maxBytesBilled?: number;
}

export interface DeepSeekConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl: string; // default: "https://api.deepseek.com"
  model: string; // default: "deepseek-chat" or "deepseek-reasoner"
}

export interface MaskedDeepSeekConfig {
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string;
  baseUrl: string;
  model: string;
}

export interface ByokConfig {
  enabled: boolean;
  providerName: string; // e.g. "OpenRouter", "OpenAI", "Groq", "Ollama"
  baseUrl: string; // OpenAI-compatible base URL, e.g. "https://openrouter.ai/api/v1"
  apiKey?: string;
  model: string;
}

export interface MaskedByokConfig {
  enabled: boolean;
  providerName: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyPreview: string;
  model: string;
}

export interface ConnectionsUpdateRequest {
  deepseek?: Partial<DeepSeekConfig>;
  opencode?: Partial<OpenCodeConfig>;
  byok?: Partial<ByokConfig>;
  gemini?: Partial<GeminiConfig>;
  bigquery?: Partial<BigQueryConfig>;
}

export interface MaskedConnectionsResponse {
  deepseek: MaskedDeepSeekConfig;
  opencode: MaskedOpenCodeConfig;
  byok: MaskedByokConfig;
  gemini: MaskedGeminiConfig;
  bigquery: MaskedBigQueryConfig;
}

export type ConnectionErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'AUTH_INVALID'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'UNREACHABLE'
  | 'INVALID_RESPONSE'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'UNKNOWN';

export type ProviderConnectionStatus =
  | 'unknown'
  | 'disconnected'
  | 'testing'
  | 'connected'
  | 'sandbox'
  | 'error';

export interface ConnectionStatus {
  state: ProviderConnectionStatus;
  message?: string;
  lastCheckedAt?: string; // ISO timestamp
  code?: ConnectionErrorCode;
}

export interface ConnectionStatuses {
  deepseek?: ProviderConnectionStatus;
  opencode: ProviderConnectionStatus;
  byok?: ProviderConnectionStatus;
  gemini: ProviderConnectionStatus;
  bigquery: ProviderConnectionStatus;
}

// ============================================================================
// OpenCode & Gemini API Contracts (M3, E2E)
// ============================================================================

export interface ChartContextPayload {
  symbol: string;
  timeframe: Timeframe;
  lastBar?: OHLCVBar;
  recentBars?: OHLCVBar[];
  activeIndicators?: Array<{ name: string; params: Record<string, number> }>;
  selectedRange?: AIRangeSelection | null;
  chartOverlay?: ChartOverlayData | null;
}

export interface OpenCodeProviderModel {
  providerID: string;
  modelID: string;
  name?: string;
}

export interface OpenCodeTestResponse {
  ok: boolean;
  code?: ConnectionErrorCode;
  message: string;
  version?: string;
  providers?: OpenCodeProviderModel[];
}

export interface OpenCodeStatusResponse {
  running: boolean;
  managed: boolean;
  serverUrl: string;
  version?: string;
  providers?: OpenCodeProviderModel[];
}

export interface OpenCodeAutostartResponse extends OpenCodeTestResponse {
  serverUrl?: string;
  managed?: boolean;
}

export interface OpenCodeInvokeRequest {
  sessionId?: string;
  title?: string;
  prompt: string;
  chartContext: ChartContextPayload;
  model?: {
    providerID: string;
    modelID: string;
  };
}

export interface OpenCodeInvokeResponse {
  ok: boolean;
  sessionId?: string;
  messageText?: string;
  code?: ConnectionErrorCode;
  message?: string;
  rawModel?: string;
}

export interface GeminiTestResponse {
  ok: boolean;
  code?: ConnectionErrorCode;
  message: string;
  models?: string[];
}

export interface GeminiInvokeRequest {
  prompt: string;
  chartContext: ChartContextPayload;
  model?: GeminiModel;
  previousInteractionId?: string;
  workflow?: 'ta_brief' | 'indicator_explainer' | 'sql_copilot' | 'custom';
}

export interface GeminiInvokeResponse {
  ok: boolean;
  text?: string;
  interactionId?: string;
  code?: ConnectionErrorCode;
  message?: string;
}

// ============================================================================
// BigQuery AI/ML API Contracts (M4, E2E)
// ============================================================================

export type BigQueryQueryType =
  | 'AI.FORECAST'
  | 'AI.DETECT_ANOMALIES'
  | 'AI.EVALUATE'
  | 'ML.DESCRIBE_DATA'
  | 'AI.GENERATE'
  | 'AI.GENERATE_TABLE'
  | 'CUSTOM';

export type BigQueryPresetId = 'forecast' | 'anomalies' | 'evaluate' | 'regime' | 'describe';

export interface BigQueryPreset {
  id: BigQueryPresetId;
  label: string;
  description: string;
  queryType: BigQueryQueryType;
  sql: string;
  defaultParams?: Record<string, string | number>;
}

export interface BigQueryPresetsResponse {
  presets: BigQueryPreset[];
}

export interface BigQueryTestResponse {
  ok: boolean;
  mode: BigQueryMode;
  code?: ConnectionErrorCode;
  message: string;
}

export interface BigQueryDryRunRequest {
  sql: string;
  symbol?: string;
}

export interface BigQueryDryRunResponse {
  ok: boolean;
  mode: BigQueryMode;
  valid: boolean;
  estimatedBytes: number;
  error?: string;
  queryType?: BigQueryQueryType;
}

export interface BigQueryExecuteRequest {
  sql: string;
  symbol: string;
  timeframe: Timeframe;
  bars?: OHLCVBar[];
  presetType?: BigQueryPresetId;
  params?: Record<string, string | number>;
}

export interface BigQueryExecuteResponse {
  ok: boolean;
  executionMode: BigQueryMode;
  jobId: string;
  estimatedBytes: number;
  durationMs: number;
  queryType: BigQueryQueryType;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  chartOverlay?: ChartOverlayData;
  metrics?: Record<string, number>;
  error?: string;
  code?: ConnectionErrorCode;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: 'above' | 'below';
  targetPrice: number;
  note?: string;
  createdAt: string;
  triggered: boolean;
}

export interface AIToolCallBadge {
  tool: string;
  label: string;
  durationMs: number;
  status: 'ok' | 'error';
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  provider: 'deepseek' | 'opencode' | 'byok' | 'gemini';
  text: string;
  reasoningText?: string;
  symbol: string;
  timeframe: Timeframe;
  timestamp: string;
  modelLabel?: string;
  chartActions?: AIChartAction[];
  toolCalls?: AIToolCallBadge[];
}

// ============================================================================
// AI Strategy Compiler, Backtester, "Why?" Interrogator & Forward Test Demo
// ============================================================================

export type StrategyAIProvider = 'deepseek' | 'opencode' | 'byok' | 'gemini' | 'deterministic';

export type PatternType =
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'hammer'
  | 'shooting_star'
  | 'doji'
  | 'inside_bar'
  | 'breakout_high'
  | 'breakdown_low';

export type RuleOperand =
  | { kind: 'price'; field: 'open' | 'high' | 'low' | 'close' | 'volume' }
  | {
      kind: 'indicator';
      indicator:
        | 'sma'
        | 'ema'
        | 'rsi'
        | 'macd_line'
        | 'macd_signal'
        | 'macd_hist'
        | 'bb_upper'
        | 'bb_middle'
        | 'bb_lower'
        | 'vwap'
        | 'atr'
        | 'highest_high'
        | 'lowest_low'
        | 'adx'
        | 'di_plus'
        | 'di_minus'
        | 'supertrend'
        | 'supertrend_dir'
        | 'stoch_k'
        | 'stoch_d'
        | 'volume_sma'
        | 'volume_ratio'
        | 'prev_high'
        | 'prev_low'
        | 'prev_close';
      period?: number;
      fast?: number;
      slow?: number;
      signal?: number;
      stdDev?: number;
      multiplier?: number;
    }
  | {
      kind: 'pattern';
      pattern: PatternType;
      lookback?: number;
    }
  | { kind: 'number'; value: number };

export type RuleOperator =
  | '>'
  | '>='
  | '<'
  | '<='
  | '=='
  | 'crosses_above'
  | 'crosses_below';

export interface RuleCondition {
  id: string;
  label: string;
  left: RuleOperand;
  operator: RuleOperator;
  right: RuleOperand;
}

export interface RuleGroup {
  combinator: 'AND' | 'OR';
  conditions: RuleCondition[];
}

export interface StrategyRiskConfig {
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct?: number;
  stopLossAtrMult?: number;
  takeProfitAtrMult?: number;
  breakevenTriggerR?: number;
  partialTakeProfitPct?: number;
  partialTakeProfitR?: number;
  allowedHoursUtc?: [number, number];
  cooldownBarsAfterLoss?: number;
  riskPerTradePct: number;
  maxDailyLossPct: number;
  maxPositionPct: number;
  pyramiding: number;
}

export interface StrategyExecutionConfig {
  initialCapital: number;
  commissionPct: number;
  slippageBps: number;
  orderSizeType: 'percent_of_equity' | 'fixed_cash' | 'fixed_qty';
  orderSizeValue: number;
  processOnClose: boolean;
  allowShort: boolean;
  leverage?: number;
  intrabarMagnifier?: boolean;
}

export interface StrategyRuleSpec {
  id: string;
  name: string;
  summary: string;
  symbol: string;
  timeframe: Timeframe;
  direction: 'long' | 'short' | 'both';
  entryLong?: RuleGroup;
  entryLongAlt?: RuleGroup;
  exitLong?: RuleGroup;
  entryShort?: RuleGroup;
  exitShort?: RuleGroup;
  risk: StrategyRiskConfig;
  execution: StrategyExecutionConfig;
  strictRulesNote: string;
}

export interface StrategyAuditIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  code: string;
  rule: string;
  explanation: string;
  suggestedFix: string;
}

export interface MasterPromptDraft {
  draftId: string;
  userDescription: string;
  masterPrompt: string;
  compiledSpec: StrategyRuleSpec;
  auditIssues: StrategyAuditIssue[];
  hasCriticalIssues: boolean;
  providerUsed: StrategyAIProvider;
  modelLabel?: string;
  approved: boolean;
  createdAt: string;
}

export interface ConditionEvalTrace {
  conditionId: string;
  label: string;
  leftValue: number | null;
  operator: RuleOperator;
  rightValue: number | null;
  passed: boolean;
}

export interface BarDecisionTrace {
  barIndex: number;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  entryLongPassed: boolean;
  exitLongPassed: boolean;
  entryShortPassed: boolean;
  exitShortPassed: boolean;
  entryLongChecks: ConditionEvalTrace[];
  exitLongChecks: ConditionEvalTrace[];
  entryShortChecks: ConditionEvalTrace[];
  exitShortChecks: ConditionEvalTrace[];
  actionTaken: string;
  reason: string;
}

export interface BacktestTrade {
  tradeNumber: number;
  side: 'long' | 'short';
  entryBarIndex: number;
  entryTime: number;
  entryPrice: number;
  exitBarIndex: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  grossProfit: number;
  commission: number;
  netProfit: number;
  netProfitPercent: number;
  cumulativeProfit: number;
  cumulativeProfitPercent: number;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
  barsHeld: number;
  exitReason: 'signal' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'end_of_data';
  isOutlier: boolean;
  entryTrace: ConditionEvalTrace[];
  exitTrace: ConditionEvalTrace[];
}

export interface BacktestPerformanceBlock {
  netProfit: number;
  netProfitPercent: number;
  grossProfit: number;
  grossLoss: number;
  commissionPaid: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  evenTrades: number;
  percentProfitable: number;
  profitFactor: number;
  avgTrade: number;
  avgWinTrade: number;
  avgLossTrade: number;
  ratioAvgWinAvgLoss: number;
  largestWinTrade: number;
  largestLossTrade: number;
  avgBarsInTrade: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  outliersCount: number;
  avgMfePct: number;
  avgMaePct: number;
}

export interface WalkForwardSummary {
  splitIndex: number;
  inSampleBars: number;
  outOfSampleBars: number;
  inSampleReturnPct: number;
  outOfSampleReturnPct: number;
  inSampleSharpe: number;
  outOfSampleSharpe: number;
  overfitRatio: number;
  verdict: 'ROBUST' | 'FRAGILE' | 'OVERFIT';
}

export interface MonteCarloSummary {
  iterations: number;
  medianReturnPct: number;
  p5ReturnPct: number;
  p95ReturnPct: number;
  medianMaxDrawdownPct: number;
  p95MaxDrawdownPct: number;
  ruinProbabilityPct: number;
}

export interface CostStressSummary {
  commissionMultiplier: number;
  slippageMultiplier: number;
  stressedNetProfitPercent: number;
  stressedProfitFactor: number;
  survivesDoubleCost: boolean;
}

export interface RegimePerfBlock {
  regime: 'bull' | 'bear' | 'chop';
  trades: number;
  winRatePct: number;
  netProfit: number;
  avgTradePct: number;
}

export interface QuantScorecard {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  tStat: number;
  pValue: number;
  sampleSizeAdequate: boolean;
  flags: string[];
}

export interface BacktestReport {
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: Timeframe;
  barCount: number;
  startTime: number;
  endTime: number;
  initialCapital: number;
  finalEquity: number;
  buyHoldReturn: number;
  buyHoldReturnPercent: number;
  strategyOutperformancePercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  maxRunup: number;
  maxRunupPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  cagrPercent: number;
  strategyBuyHoldCorrelation: number;
  returnOnMaxDrawdown: number;
  bestEntryHourUtc: number | null;
  bestEntryDayUtc: number | null;
  all: BacktestPerformanceBlock;
  long: BacktestPerformanceBlock;
  short: BacktestPerformanceBlock;
  equityCurve: Array<{
    time: number;
    equity: number;
    drawdownPct: number;
    buyHoldEquity: number;
  }>;
  trades: BacktestTrade[];
  recentTraces: BarDecisionTrace[];
  spec: StrategyRuleSpec;
  walkForward?: WalkForwardSummary;
  monteCarlo?: MonteCarloSummary;
  costStress?: CostStressSummary;
  regimes?: RegimePerfBlock[];
  scorecard?: QuantScorecard;
  monthlyReturns?: Array<{
    yearMonth: string;
    returnPct: number;
    netProfit: number;
    trades: number;
  }>;
}

export interface LoadedBacktestStrategy {
  spec: StrategyRuleSpec;
  masterPrompt: string;
  loadedAt: string;
  reportSummary?: {
    totalTrades: number;
    winRatePct: number;
    profitFactor: number;
    netProfitPercent: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    barCount: number;
    startTime: number;
    endTime: number;
    grade?: string;
  };
}

export interface AIProviderTestResponse {
  ok: boolean;
  provider: 'deepseek' | 'byok';
  code?: ConnectionErrorCode;
  message: string;
  model?: string;
}

export interface AIProviderInvokeRequest {
  provider: 'deepseek' | 'byok';
  prompt: string;
  chartContext: ChartContextPayload;
  loadedStrategy?: LoadedBacktestStrategy | null;
  modelOverride?: string;
}

export interface AIProviderInvokeResponse {
  ok: boolean;
  provider: 'deepseek' | 'byok';
  text?: string;
  reasoningText?: string;
  modelLabel?: string;
  code?: ConnectionErrorCode;
  message?: string;
  compiledStrategy?: StrategyRuleSpec;
  startForwardTest?: boolean;
}

export interface StrategySweepItem {
  label: string;
  params: Record<string, number>;
  netProfitPercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  totalTrades: number;
  winRatePercent: number;
}

export interface StrategySweepResponse {
  ok: boolean;
  metric: string;
  results: StrategySweepItem[];
  best?: StrategySweepItem;
  durationMs: number;
}

export type PaperOrderSide = 'buy' | 'sell';

export interface PaperPosition {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openedAt: string;
  botId: string;
}

export interface PaperOrderLog {
  id: string;
  timestamp: string;
  botId: string;
  botName: string;
  symbol: string;
  side: PaperOrderSide;
  action:
    | 'open_long'
    | 'close_long'
    | 'open_short'
    | 'close_short'
    | 'stop_loss'
    | 'take_profit'
    | 'kill_switch'
    | 'blocked_risk';
  quantity: number;
  price: number;
  commission: number;
  realizedPnl?: number;
  reason: string;
  ruleTrace: ConditionEvalTrace[];
}

export interface PaperTradingBot {
  id: string;
  name: string;
  symbol: string;
  timeframe: Timeframe;
  status: 'armed' | 'paused' | 'halted_daily_loss' | 'killed';
  spec: StrategyRuleSpec;
  approvedMasterPrompt: string;
  lastEvaluatedBarTime: number | null;
  tradesExecuted: number;
  realizedPnl: number;
  createdAt: string;
}

export interface PaperFirewallConfig {
  maxOpenPositions: number;
  maxTotalExposurePct: number;
  cooldownAfterLossSec: number;
  maxOrdersPerMinute: number;
}

export interface PaperAccountState {
  mode: 'paper_only';
  initialCash: number;
  cash: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  dailyPnl: number;
  dailyLossLimitPct: number;
  killSwitchActive: boolean;
  killSwitchReason?: string;
  firewall: PaperFirewallConfig;
  equityHistory: Array<{ timestamp: string; equity: number; cash: number }>;
  daemonRunning: boolean;
  lastDaemonTickAt?: string;
  bots: PaperTradingBot[];
  positions: PaperPosition[];
  orders: PaperOrderLog[];
  updatedAt: string;
}

export interface PaperManualOrderRequest {
  symbol: string;
  side: 'long' | 'short';
  notionalUsd?: number;
  quantity?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  price?: number;
  note?: string;
}

export interface AIChartAction {
  type:
    | 'draw_hline'
    | 'draw_trendline'
    | 'draw_fib'
    | 'draw_position'
    | 'add_indicator'
    | 'create_alert'
    | 'open_backtester'
    | 'switch_symbol'
    | 'set_timeframe'
    | 'toggle_smc'
    | 'toggle_vp'
    | 'toggle_sessions'
    | 'open_autotrade'
    | 'start_forward_test'
    | 'start_replay'
    | 'clear_drawings';
  label: string;
  payload: Record<string, unknown>;
}

export interface StrategyRefineRequest {
  draft: MasterPromptDraft;
  editedMasterPrompt?: string;
  userFollowup?: string;
  provider: StrategyAIProvider;
  model?: { providerID: string; modelID: string };
}

export interface MasterPromptRequest {
  description: string;
  symbol: string;
  timeframe: Timeframe;
  provider: StrategyAIProvider;
  model?: { providerID: string; modelID: string };
  applyStrictFixes?: boolean;
  requireAi?: boolean;
}

export interface MasterPromptResponse {
  ok: boolean;
  draft: MasterPromptDraft;
  aiNote?: string;
}

export interface StrategyBacktestRequest {
  spec: StrategyRuleSpec;
  masterPrompt?: string;
  approved: boolean;
  symbol?: string;
  timeframe?: Timeframe;
  bars?: OHLCVBar[];
  historyLimit?: number;
  fromTime?: number;
  toTime?: number;
  descriptionForAudit?: string;
}

export interface StrategyBacktestResponse {
  ok: boolean;
  report?: BacktestReport;
  auditIssues?: StrategyAuditIssue[];
  message?: string;
}

export interface StrategySweepRequest {
  spec: StrategyRuleSpec;
  metric?: 'sharpeRatio' | 'netProfitPercent' | 'profitFactor' | 'maxDrawdownPercent';
  symbol?: string;
  timeframe?: Timeframe;
  bars?: OHLCVBar[];
}

export interface StrategyExplainRequest {
  question: string;
  spec: StrategyRuleSpec;
  provider: StrategyAIProvider;
  model?: { providerID: string; modelID: string };
  report?: BacktestReport;
  tradeNumber?: number;
  barIndex?: number;
  barTime?: number;
  bars?: OHLCVBar[];
}

export interface StrategyExplainResponse {
  ok: boolean;
  answer: string;
  providerUsed: StrategyAIProvider;
  modelLabel?: string;
  groundTruthTrace?: BarDecisionTrace;
  inspectedTrade?: BacktestTrade;
}
