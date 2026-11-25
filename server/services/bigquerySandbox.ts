import type {
  AnomalyMarker,
  BigQueryConfig,
  BigQueryExecuteRequest,
  BigQueryExecuteResponse,
  BigQueryPreset,
  BigQueryQueryType,
  ForecastPoint,
  OHLCVBar,
} from '../../shared/types.js';
import { TIMEFRAME_SECONDS } from './marketData.js';

export interface ParsedBqParams {
  dataCol: 'close' | 'open' | 'high' | 'low' | 'volume';
  horizon: number;
  confidenceLevel: number;
  threshold: number;
  limit: number;
  model: string;
}

export interface SqlValidationResult {
  valid: boolean;
  queryType: BigQueryQueryType;
  estimatedBytes: number;
  error?: string;
  parsedParams: ParsedBqParams;
}

const DEFAULT_BQ_PARAMS: ParsedBqParams = {
  dataCol: 'close',
  horizon: 14,
  confidenceLevel: 0.95,
  threshold: 0.95,
  limit: 20,
  model: 'TimesFM 2.0',
};

function roundNum(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/** Error function erf(x) via Abramowitz & Stegun 7.1.26 (error <= 1.5e-7). */
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly =
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t);
  const y = 1 - poly * Math.exp(-ax * ax);
  return sign * y;
}

/** Inverse standard normal CDF via Acklam rational approximation. */
function normInv(p: number): number {
  const clamped = Math.max(1e-6, Math.min(1 - 1e-6, p));
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (clamped < pLow) {
    const q = Math.sqrt(-2 * Math.log(clamped));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (clamped <= pHigh) {
    const q = clamped - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - clamped));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

function twoSidedZ(confidenceOrProb: number): number {
  return normInv((1 + confidenceOrProb) / 2);
}

function twoTailedAnomalyProb(zScore: number): number {
  return Math.max(0, Math.min(1, erf(Math.abs(zScore) / Math.SQRT2)));
}

export function getBigQueryPresets(
  symbol: string,
  config?: Partial<BigQueryConfig>,
): BigQueryPreset[] {
  const sym = symbol.trim().toUpperCase() || 'AAPL';
  const project = config?.projectId?.trim() || 'demo-market-project';
  const dataset = config?.datasetId?.trim() || 'market_analytics';
  const table = config?.tableId?.trim() || 'ohlcv_bars';
  const connectionId = config?.connectionId?.trim() || 'DEFAULT';
  const fqTable = `\`${project}.${dataset}.${table}\``;

  return [
    {
      id: 'forecast',
      label: 'AI.FORECAST (TimesFM 2.0)',
      description: '14-step time-series forecast with 95% confidence bounds.',
      queryType: 'AI.FORECAST',
      sql: [
        'SELECT',
        '  symbol,',
        '  forecast_timestamp,',
        '  forecast_value,',
        '  prediction_interval_lower_bound,',
        '  prediction_interval_upper_bound,',
        '  confidence_level,',
        '  ai_forecast_status',
        'FROM AI.FORECAST(',
        '  (',
        '    SELECT timestamp, symbol, close',
        `    FROM ${fqTable}`,
        `    WHERE symbol = '${sym}'`,
        '    ORDER BY timestamp ASC',
        '  ),',
        "  data_col => 'close',",
        "  timestamp_col => 'timestamp',",
        "  id_cols => ['symbol'],",
        "  model => 'TimesFM 2.0',",
        '  horizon => 14,',
        '  confidence_level => 0.95,',
        '  output_historical_time_series => FALSE',
        ');',
      ].join('\n'),
      defaultParams: { horizon: 14, confidenceLevel: 0.95, dataCol: 'close' },
    },
    {
      id: 'anomalies',
      label: 'AI.DETECT_ANOMALIES',
      description: 'Detect statistically significant price/volume outliers.',
      queryType: 'AI.DETECT_ANOMALIES',
      sql: [
        'SELECT',
        '  symbol,',
        '  time_series_timestamp,',
        '  time_series_data,',
        '  is_anomaly,',
        '  lower_bound,',
        '  upper_bound,',
        '  anomaly_probability,',
        '  ai_detect_anomalies_status',
        'FROM AI.DETECT_ANOMALIES(',
        '  (',
        '    SELECT timestamp, symbol, close',
        `    FROM ${fqTable}`,
        `    WHERE symbol = '${sym}'`,
        "      AND timestamp < TIMESTAMP('2026-08-01T00:00:00Z')",
        '  ),',
        '  (',
        '    SELECT timestamp, symbol, close',
        `    FROM ${fqTable}`,
        `    WHERE symbol = '${sym}'`,
        "      AND timestamp >= TIMESTAMP('2026-08-01T00:00:00Z')",
        '  ),',
        "  data_col => 'close',",
        "  timestamp_col => 'timestamp',",
        "  id_cols => ['symbol'],",
        '  anomaly_prob_threshold => 0.90',
        ');',
      ].join('\n'),
      defaultParams: { threshold: 0.9, dataCol: 'close' },
    },
    {
      id: 'evaluate',
      label: 'AI.EVALUATE Backtest',
      description: 'Chronological TimesFM evaluation returning MAE, RMSE, MAPE & sMAPE.',
      queryType: 'AI.EVALUATE',
      sql: [
        'SELECT *',
        'FROM AI.EVALUATE(',
        '  (',
        '    SELECT timestamp, symbol, close',
        `    FROM ${fqTable}`,
        `    WHERE symbol = '${sym}'`,
        "      AND timestamp < TIMESTAMP('2026-10-15T00:00:00Z')",
        '  ),',
        '  (',
        '    SELECT timestamp, symbol, close',
        `    FROM ${fqTable}`,
        `    WHERE symbol = '${sym}'`,
        "      AND timestamp >= TIMESTAMP('2026-10-15T00:00:00Z')",
        '  ),',
        "  data_col => 'close',",
        "  timestamp_col => 'timestamp',",
        "  id_cols => ['symbol'],",
        '  horizon => 20',
        ');',
      ].join('\n'),
      defaultParams: { horizon: 20, dataCol: 'close' },
    },
    {
      id: 'regime',
      label: 'AI.GENERATE Regime',
      description: 'Synthesize structured market regime, volatility & directional bias.',
      queryType: 'AI.GENERATE',
      sql: [
        'WITH summary_stats AS (',
        '  SELECT',
        `    '${sym}' AS symbol,`,
        '    ARRAY_AGG(close ORDER BY timestamp DESC LIMIT 1)[OFFSET(0)] AS latest_close,',
        '    STDDEV(close) / AVG(close) * 100 AS vol_pct',
        `  FROM ${fqTable}`,
        `  WHERE symbol = '${sym}'`,
        ')',
        'SELECT',
        '  AI.GENERATE(',
        '    CONCAT(',
        `      'Analyze market regime for ${sym}: close=', CAST(latest_close AS STRING),`,
        "      ', vol_pct=', CAST(ROUND(vol_pct, 2) AS STRING)",
        '    ),',
        `    connection_id => '${connectionId}',`,
        "    endpoint => 'gemini-2.5-flash',",
        "    output_schema => 'trend_regime STRING, volatility_regime STRING, bias STRING, rationale STRING'",
        '  ).*',
        'FROM summary_stats;',
      ].join('\n'),
    },
    {
      id: 'describe',
      label: 'ML.DESCRIBE_DATA Exploration',
      description: 'Compute descriptive OHLCV summary statistics before modeling.',
      queryType: 'ML.DESCRIBE_DATA',
      sql: [
        'SELECT *',
        'FROM ML.DESCRIBE_DATA(',
        '  (',
        '    SELECT timestamp, symbol, open, high, low, close, volume',
        `    FROM ${fqTable}`,
        `    WHERE symbol = '${sym}'`,
        '  )',
        ');',
      ].join('\n'),
    },
  ];
}

function hasBalancedParens(sql: string): boolean {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) continue;
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !inSingle && !inDouble;
}

function detectQueryType(sql: string): BigQueryQueryType {
  if (/\bAI\.FORECAST\b/i.test(sql)) return 'AI.FORECAST';
  if (/\bAI\.DETECT_ANOMALIES\b/i.test(sql)) return 'AI.DETECT_ANOMALIES';
  if (/\bAI\.EVALUATE\b/i.test(sql)) return 'AI.EVALUATE';
  if (/\bAI\.GENERATE_TABLE\b/i.test(sql)) return 'AI.GENERATE_TABLE';
  if (/\bAI\.GENERATE\b/i.test(sql)) return 'AI.GENERATE';
  if (/\bML\.DESCRIBE_DATA\b/i.test(sql)) return 'ML.DESCRIBE_DATA';
  return 'CUSTOM';
}

function parseParams(sql: string): ParsedBqParams {
  const params: ParsedBqParams = { ...DEFAULT_BQ_PARAMS };
  const dataColMatch = sql.match(/data_col\s*=>\s*['"]([a-zA-Z0-9_]+)['"]/i);
  if (dataColMatch) {
    const col = dataColMatch[1].toLowerCase();
    if (col === 'open' || col === 'high' || col === 'low' || col === 'close' || col === 'volume') {
      params.dataCol = col;
    }
  }
  const horizonMatch = sql.match(/horizon\s*=>\s*(-?\d+(?:\.\d+)?)/i);
  if (horizonMatch) {
    params.horizon = Number(horizonMatch[1]);
  }
  const confMatch = sql.match(/confidence_level\s*=>\s*(-?\d+(?:\.\d+)?)/i);
  if (confMatch) {
    params.confidenceLevel = Number(confMatch[1]);
  }
  const threshMatch = sql.match(/anomaly_prob_threshold\s*=>\s*(-?\d+(?:\.\d+)?)/i);
  if (threshMatch) {
    params.threshold = Number(threshMatch[1]);
  }
  const modelMatch = sql.match(/model\s*=>\s*['"]([^'"]+)['"]/i);
  if (modelMatch) {
    params.model = modelMatch[1];
  }
  const limitMatch = sql.match(/\bLIMIT\s+(\d+)\b/i);
  if (limitMatch) {
    params.limit = Math.max(1, Math.min(100, Number(limitMatch[1])));
  }
  return params;
}

export function validateBigQueryAISql(rawSql: string): SqlValidationResult {
  const sql = rawSql?.trim() ?? '';
  if (!sql) {
    return {
      valid: false,
      queryType: 'CUSTOM',
      estimatedBytes: 0,
      error: 'Syntax error: SQL query cannot be empty.',
      parsedParams: { ...DEFAULT_BQ_PARAMS },
    };
  }

  const parsedParams = parseParams(sql);
  const queryType = detectQueryType(sql);
  const estimatedBytes = Math.max(2048, sql.length * 128 + 48_000);

  if (/^\s*(DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER)\b/i.test(sql)) {
    return {
      valid: false,
      queryType,
      estimatedBytes: 0,
      error: 'DDL/DML mutation statements are disallowed; only SELECT / WITH BigQuery AI/ML queries are permitted.',
      parsedParams,
    };
  }

  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) {
    return {
      valid: false,
      queryType,
      estimatedBytes: 0,
      error: 'Syntax error: Query must begin with SELECT or WITH.',
      parsedParams,
    };
  }

  if (!hasBalancedParens(sql)) {
    return {
      valid: false,
      queryType,
      estimatedBytes: 0,
      error: 'Syntax error: Unbalanced parentheses or unterminated string literal.',
      parsedParams,
    };
  }

  // Mandatory TVF placement in FROM clause (per ai_function_best_practices.md)
  const tvfNames = [
    'AI.FORECAST',
    'AI.DETECT_ANOMALIES',
    'AI.EVALUATE',
    'AI.GENERATE_TABLE',
    'ML.DESCRIBE_DATA',
  ];
  for (const tvf of tvfNames) {
    const escaped = tvf.replace('.', '\\.');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(sql)) {
      const inFrom = new RegExp(`\\bFROM\\s+${escaped}\\s*\\(`, 'i').test(sql);
      if (!inFrom) {
        return {
          valid: false,
          queryType,
          estimatedBytes: 0,
          error: `BigQuery AI/ML validation error: Table-Valued Function ${tvf} MUST be placed in the FROM clause (e.g., FROM ${tvf}(...)).`,
          parsedParams,
        };
      }
    }
  }

  if (
    queryType === 'AI.FORECAST' ||
    queryType === 'AI.DETECT_ANOMALIES' ||
    queryType === 'AI.EVALUATE'
  ) {
    if (!/data_col\s*=>/i.test(sql) || !/timestamp_col\s*=>/i.test(sql)) {
      return {
        valid: false,
        queryType,
        estimatedBytes: 0,
        error: `BigQuery AI/ML validation error: ${queryType} requires named arguments with => syntax (including data_col => '...' and timestamp_col => '...').`,
        parsedParams,
      };
    }

    if (queryType === 'AI.FORECAST' || queryType === 'AI.EVALUATE') {
      if (
        !Number.isFinite(parsedParams.horizon) ||
        parsedParams.horizon < 1 ||
        parsedParams.horizon > 10_000
      ) {
        return {
          valid: false,
          queryType,
          estimatedBytes: 0,
          error: `Invalid parameter: horizon (${parsedParams.horizon}) must be between 1 and 10000.`,
          parsedParams,
        };
      }
    }

    if (queryType === 'AI.FORECAST') {
      if (
        !Number.isFinite(parsedParams.confidenceLevel) ||
        parsedParams.confidenceLevel <= 0 ||
        parsedParams.confidenceLevel >= 1
      ) {
        return {
          valid: false,
          queryType,
          estimatedBytes: 0,
          error: `Invalid parameter: confidence_level (${parsedParams.confidenceLevel}) must satisfy 0 < confidence_level < 1.`,
          parsedParams,
        };
      }
    }

    if (queryType === 'AI.DETECT_ANOMALIES') {
      if (
        !Number.isFinite(parsedParams.threshold) ||
        parsedParams.threshold <= 0 ||
        parsedParams.threshold >= 1
      ) {
        return {
          valid: false,
          queryType,
          estimatedBytes: 0,
          error: `Invalid parameter: anomaly_prob_threshold (${parsedParams.threshold}) must satisfy 0 < anomaly_prob_threshold < 1.`,
          parsedParams,
        };
      }
    }
  }

  if (queryType === 'AI.GENERATE_TABLE') {
    if (!/\bAS\s+prompt\b/i.test(sql)) {
      return {
        valid: false,
        queryType,
        estimatedBytes: 0,
        error: 'BigQuery AI/ML validation error: AI.GENERATE_TABLE input subquery must alias the prompt column as `prompt` (e.g., SELECT ... AS prompt).',
        parsedParams,
      };
    }
  }

  if (queryType === 'AI.GENERATE' || queryType === 'AI.GENERATE_TABLE') {
    if (/output_schema\s*=>/i.test(sql)) {
      if (!/output_schema\s*=>\s*(['"])[\s\S]*?\1/i.test(sql)) {
        return {
          valid: false,
          queryType,
          estimatedBytes: 0,
          error: 'BigQuery AI/ML validation error: output_schema parameter must be a quoted string.',
          parsedParams,
        };
      }
    }
  }

  return {
    valid: true,
    queryType,
    estimatedBytes,
    parsedParams,
  };
}

function getSeriesValues(
  bars: OHLCVBar[],
  col: ParsedBqParams['dataCol'],
): number[] {
  return bars.map((b) => b[col]);
}

function fitHoltDamped(values: number[]): {
  level: number;
  trend: number;
  residualStd: number;
  phi: number;
} {
  const alpha = 0.35;
  const beta = 0.15;
  const phi = 0.88;

  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  const residuals: number[] = [];

  for (let i = 1; i < values.length; i += 1) {
    const forecast1 = level + phi * trend;
    const actual = values[i];
    residuals.push(actual - forecast1);

    const prevLevel = level;
    level = alpha * actual + (1 - alpha) * forecast1;
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }

  const variance =
    residuals.length > 1
      ? residuals.reduce((acc, r) => acc + r * r, 0) / (residuals.length - 1)
      : 0;
  const lastVal = Math.abs(values[values.length - 1] ?? 1);
  const residualStd = Math.max(Math.sqrt(variance), lastVal * 0.0025, 1e-4);

  return { level, trend, residualStd, phi };
}

function forecastHoltSteps(
  fit: { level: number; trend: number; residualStd: number; phi: number },
  horizon: number,
  confidenceLevel: number,
  minValue: number,
): Array<{ value: number; lower: number; upper: number }> {
  const z = twoSidedZ(confidenceLevel);
  const out: Array<{ value: number; lower: number; upper: number }> = [];
  let phiSum = 0;
  let phiPow = fit.phi;

  for (let h = 1; h <= horizon; h += 1) {
    phiSum += phiPow;
    phiPow *= fit.phi;
    const point = Math.max(minValue, fit.level + phiSum * fit.trend);
    const halfWidth = z * fit.residualStd * Math.sqrt(h);
    const lower = Math.max(minValue * 0.5, point - halfWidth);
    const upper = point + halfWidth;
    out.push({
      value: roundNum(point, 4),
      lower: roundNum(Math.min(lower, point - 1e-4), 4),
      upper: roundNum(Math.max(upper, point + 1e-4), 4),
    });
  }
  return out;
}

export function executeBigQuerySandbox(
  req: BigQueryExecuteRequest,
  bars: OHLCVBar[],
): BigQueryExecuteResponse {
  const t0 = Date.now();
  const validation = validateBigQueryAISql(req.sql);
  const symbol = req.symbol.trim().toUpperCase() || 'AAPL';
  const jobId = `bq_sandbox_${Date.now().toString(36)}`;

  if (!validation.valid) {
    return {
      ok: false,
      executionMode: 'sandbox',
      jobId,
      estimatedBytes: 0,
      durationMs: Math.max(1, Date.now() - t0),
      queryType: validation.queryType,
      columns: [],
      rows: [],
      error: validation.error,
      code: 'BAD_REQUEST',
    };
  }

  const { queryType, parsedParams, estimatedBytes } = validation;
  const stepSec = TIMEFRAME_SECONDS[req.timeframe] ?? 86400;

  if (queryType === 'AI.FORECAST') {
    if (bars.length < 3) {
      return {
        ok: false,
        executionMode: 'sandbox',
        jobId,
        estimatedBytes,
        durationMs: Math.max(1, Date.now() - t0),
        queryType,
        columns: [],
        rows: [],
        error: 'AI.FORECAST requires at least 3 historical data points.',
        code: 'BAD_REQUEST',
      };
    }

    const values = getSeriesValues(bars, parsedParams.dataCol);
    const fit = fitHoltDamped(values);
    const steps = forecastHoltSteps(
      fit,
      parsedParams.horizon,
      parsedParams.confidenceLevel,
      0.0001,
    );
    const lastTime = bars[bars.length - 1].time;

    const points: ForecastPoint[] = [];
    const rows: Array<Record<string, unknown>> = [];

    for (let i = 0; i < steps.length; i += 1) {
      const ts = lastTime + (i + 1) * stepSec;
      const step = steps[i];
      points.push({
        time: ts,
        value: step.value,
        lowerBound: step.lower,
        upperBound: step.upper,
      });
      rows.push({
        symbol,
        forecast_timestamp: new Date(ts * 1000).toISOString(),
        forecast_value: step.value,
        prediction_interval_lower_bound: step.lower,
        prediction_interval_upper_bound: step.upper,
        confidence_level: parsedParams.confidenceLevel,
        ai_forecast_status: '',
      });
    }

    return {
      ok: true,
      executionMode: 'sandbox',
      jobId,
      estimatedBytes,
      durationMs: Math.max(1, Date.now() - t0),
      queryType,
      columns: [
        'symbol',
        'forecast_timestamp',
        'forecast_value',
        'prediction_interval_lower_bound',
        'prediction_interval_upper_bound',
        'confidence_level',
        'ai_forecast_status',
      ],
      rows,
      chartOverlay: {
        forecast: {
          id: jobId,
          label: `${parsedParams.model} (${parsedParams.horizon} bars)`,
          points,
          confidenceLevel: parsedParams.confidenceLevel,
          executionMode: 'sandbox',
        },
        visible: true,
      },
    };
  }

  if (queryType === 'AI.DETECT_ANOMALIES') {
    if (bars.length < 10) {
      return {
        ok: false,
        executionMode: 'sandbox',
        jobId,
        estimatedBytes,
        durationMs: Math.max(1, Date.now() - t0),
        queryType,
        columns: [],
        rows: [],
        error: 'AI.DETECT_ANOMALIES requires at least 10 bars for baseline estimation.',
        code: 'BAD_REQUEST',
      };
    }

    const values = getSeriesValues(bars, parsedParams.dataCol);
    const splitIdx = Math.max(5, Math.floor(bars.length * 0.7));
    const windowSize = 20;
    const zCrit = twoSidedZ(parsedParams.threshold);

    const rows: Array<Record<string, unknown>> = [];
    const anomalies: AnomalyMarker[] = [];

    for (let i = splitIdx; i < bars.length; i += 1) {
      const start = Math.max(0, i - windowSize);
      const historySlice = values.slice(start, i);
      const mean =
        historySlice.reduce((sum, v) => sum + v, 0) / Math.max(1, historySlice.length);
      const variance =
        historySlice.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
        Math.max(1, historySlice.length - 1);
      const std = Math.max(Math.sqrt(variance), Math.abs(mean) * 0.002, 1e-4);

      const actual = values[i];
      const z = (actual - mean) / std;
      const prob = roundNum(twoTailedAnomalyProb(z), 4);
      const lowerBound = roundNum(mean - zCrit * std, 4);
      const upperBound = roundNum(mean + zCrit * std, 4);
      const isAnomaly = prob >= parsedParams.threshold;

      rows.push({
        symbol,
        time_series_timestamp: new Date(bars[i].time * 1000).toISOString(),
        time_series_data: roundNum(actual, 4),
        is_anomaly: isAnomaly,
        lower_bound: lowerBound,
        upper_bound: upperBound,
        anomaly_probability: prob,
        ai_detect_anomalies_status: '',
      });

      if (isAnomaly) {
        anomalies.push({
          time: bars[i].time,
          value: roundNum(actual, 4),
          lowerBound,
          upperBound,
          probability: prob,
          direction: actual >= mean ? 'high' : 'low',
        });
      }
    }

    return {
      ok: true,
      executionMode: 'sandbox',
      jobId,
      estimatedBytes,
      durationMs: Math.max(1, Date.now() - t0),
      queryType,
      columns: [
        'symbol',
        'time_series_timestamp',
        'time_series_data',
        'is_anomaly',
        'lower_bound',
        'upper_bound',
        'anomaly_probability',
        'ai_detect_anomalies_status',
      ],
      rows,
      chartOverlay: {
        anomalies,
        visible: true,
      },
    };
  }

  if (queryType === 'AI.EVALUATE') {
    if (bars.length < 10) {
      return {
        ok: false,
        executionMode: 'sandbox',
        jobId,
        estimatedBytes,
        durationMs: Math.max(1, Date.now() - t0),
        queryType,
        columns: [],
        rows: [],
        error: 'AI.EVALUATE requires at least 10 bars for chronological split.',
        code: 'BAD_REQUEST',
      };
    }

    const values = getSeriesValues(bars, parsedParams.dataCol);
    const evalCount = Math.min(
      parsedParams.horizon,
      Math.max(3, Math.floor(values.length * 0.2)),
      values.length - 5,
    );
    const history = values.slice(0, values.length - evalCount);
    const actuals = values.slice(values.length - evalCount);

    const fit = fitHoltDamped(history);
    const preds = forecastHoltSteps(fit, evalCount, 0.95, 0.0001);

    let sumAbs = 0;
    let sumSq = 0;
    let sumApe = 0;
    let sumSmape = 0;

    for (let i = 0; i < evalCount; i += 1) {
      const actual = actuals[i];
      const pred = preds[i].value;
      const err = Math.abs(actual - pred);
      sumAbs += err;
      sumSq += err * err;
      sumApe += actual !== 0 ? (err / Math.abs(actual)) * 100 : 0;
      const denom = Math.abs(actual) + Math.abs(pred);
      sumSmape += denom > 0 ? ((2 * err) / denom) * 100 : 0;
    }

    const mae = roundNum(sumAbs / evalCount, 4);
    const mse = roundNum(sumSq / evalCount, 4);
    const rmse = roundNum(Math.sqrt(sumSq / evalCount), 4);
    const mape = roundNum(sumApe / evalCount, 4);
    const smape = roundNum(sumSmape / evalCount, 4);

    const row = {
      symbol,
      horizon_evaluated: evalCount,
      mean_absolute_error: mae,
      mean_squared_error: mse,
      root_mean_squared_error: rmse,
      mean_absolute_percentage_error: mape,
      symmetric_mean_absolute_percentage_error: smape,
    };

    return {
      ok: true,
      executionMode: 'sandbox',
      jobId,
      estimatedBytes,
      durationMs: Math.max(1, Date.now() - t0),
      queryType,
      columns: Object.keys(row),
      rows: [row],
      metrics: {
        mae,
        mse,
        rmse,
        mape,
        smape,
      },
    };
  }

  if (queryType === 'ML.DESCRIBE_DATA') {
    const cols: Array<ParsedBqParams['dataCol']> = ['open', 'high', 'low', 'close', 'volume'];
    const rows = cols.map((col) => {
      const vals = bars.map((b) => b[col]).sort((a, b) => a - b);
      const count = vals.length;
      const min = count > 0 ? vals[0] : 0;
      const max = count > 0 ? vals[count - 1] : 0;
      const mean = count > 0 ? vals.reduce((s, v) => s + v, 0) / count : 0;
      const variance =
        count > 1
          ? vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (count - 1)
          : 0;
      const median =
        count === 0
          ? 0
          : count % 2 === 1
            ? vals[(count - 1) / 2]
            : (vals[count / 2 - 1] + vals[count / 2]) / 2;

      return {
        column_name: col,
        row_count: count,
        null_count: 0,
        min: roundNum(min, 4),
        max: roundNum(max, 4),
        mean: roundNum(mean, 4),
        stddev: roundNum(Math.sqrt(variance), 4),
        median: roundNum(median, 4),
      };
    });

    return {
      ok: true,
      executionMode: 'sandbox',
      jobId,
      estimatedBytes,
      durationMs: Math.max(1, Date.now() - t0),
      queryType,
      columns: ['column_name', 'row_count', 'null_count', 'min', 'max', 'mean', 'stddev', 'median'],
      rows,
    };
  }

  if (queryType === 'AI.GENERATE' || queryType === 'AI.GENERATE_TABLE') {
    const closes = bars.map((b) => b.close);
    const first = closes[0] ?? 1;
    const last = closes[closes.length - 1] ?? 1;
    const sma20Slice = closes.slice(-Math.min(20, closes.length));
    const sma20 =
      sma20Slice.reduce((s, v) => s + v, 0) / Math.max(1, sma20Slice.length);
    const periodReturn = first > 0 ? ((last - first) / first) * 100 : 0;

    const returns: number[] = [];
    for (let i = 1; i < closes.length; i += 1) {
      if (closes[i - 1] > 0) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
    }
    const meanRet =
      returns.reduce((s, r) => s + r, 0) / Math.max(1, returns.length);
    const retVar =
      returns.length > 1
        ? returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / (returns.length - 1)
        : 0;
    const volPct = Math.sqrt(retVar) * 100;

    const trendRegime =
      last > sma20 * 1.01
        ? 'Uptrend'
        : last < sma20 * 0.99
          ? 'Downtrend'
          : 'Range-Bound';
    const volatilityRegime =
      volPct >= 2.2 ? 'High Volatility' : volPct >= 1.0 ? 'Moderate Volatility' : 'Low Volatility';
    const bias =
      trendRegime === 'Uptrend'
        ? 'Bullish'
        : trendRegime === 'Downtrend'
          ? 'Bearish'
          : 'Neutral';

    const row = {
      symbol,
      trend_regime: trendRegime,
      volatility_regime: volatilityRegime,
      bias,
      rationale: `${symbol} close (${roundNum(last, 2)}) vs SMA-20 (${roundNum(sma20, 2)}); period return ${roundNum(periodReturn, 2)}%, bar volatility ${roundNum(volPct, 2)}%.`,
    };

    return {
      ok: true,
      executionMode: 'sandbox',
      jobId,
      estimatedBytes,
      durationMs: Math.max(1, Date.now() - t0),
      queryType,
      columns: Object.keys(row),
      rows: [row],
    };
  }

  // CUSTOM SELECT query
  const sampleBars = bars.slice(-parsedParams.limit).map((b) => ({
    symbol,
    timestamp: new Date(b.time * 1000).toISOString(),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

  return {
    ok: true,
    executionMode: 'sandbox',
    jobId,
    estimatedBytes,
    durationMs: Math.max(1, Date.now() - t0),
    queryType: 'CUSTOM',
    columns: ['symbol', 'timestamp', 'open', 'high', 'low', 'close', 'volume'],
    rows: sampleBars,
  };
}
