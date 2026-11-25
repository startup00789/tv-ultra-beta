import { existsSync } from 'node:fs';
import { BigQuery, type BigQueryOptions } from '@google-cloud/bigquery';
import type {
  AnomalyMarker,
  BigQueryConfig,
  BigQueryDryRunRequest,
  BigQueryDryRunResponse,
  BigQueryExecuteRequest,
  BigQueryExecuteResponse,
  BigQueryQueryType,
  BigQueryTestResponse,
  ChartOverlayData,
  ForecastPoint,
  OHLCVBar,
} from '../../shared/types.js';
import {
  executeBigQuerySandbox,
  validateBigQueryAISql,
} from './bigquerySandbox.js';
import { scrubSecrets } from './connectionsStore.js';
import { getOHLCVBars } from './marketData.js';

function classifyLiveGcpError(err: unknown): {
  status: number;
  code: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'BAD_REQUEST' | 'UNREACHABLE';
  message: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const scrubbed = scrubSecrets(raw);
  const lower = scrubbed.toLowerCase();

  if (
    lower.includes('defaultcredentialserror') ||
    lower.includes('could not load the default credentials') ||
    lower.includes('no credentialed accounts') ||
    lower.includes('unauthenticated') ||
    lower.includes('invalid_grant')
  ) {
    return {
      status: 401,
      code: 'AUTH_REQUIRED',
      message:
        'GCP credentials not found. Run: gcloud auth login && gcloud auth application-default login (or switch BigQuery mode to Sandbox).',
    };
  }

  if (
    lower.includes('access denied') ||
    lower.includes('permission_denied') ||
    lower.includes('403') ||
    lower.includes('forbidden')
  ) {
    return {
      status: 403,
      code: 'FORBIDDEN',
      message: `GCP IAM access denied (403). Verify roles/bigquery.jobUser and roles/bigquery.dataViewer. (${scrubbed})`,
    };
  }

  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('timeout')) {
    return {
      status: 502,
      code: 'UNREACHABLE',
      message: `Cannot reach BigQuery API: ${scrubbed}`,
    };
  }

  return {
    status: 400,
    code: 'BAD_REQUEST',
    message: scrubbed || 'BigQuery query execution failed.',
  };
}

function buildBigQueryClient(config: BigQueryConfig): {
  client?: BigQuery;
  error?: { status: number; code: 'AUTH_REQUIRED' | 'BAD_REQUEST'; message: string };
} {
  const projectId = config.projectId?.trim();
  if (!projectId) {
    return {
      error: {
        status: 400,
        code: 'BAD_REQUEST',
        message: 'GCP Project ID is required for BigQuery Live mode.',
      },
    };
  }

  const opts: BigQueryOptions = {
    projectId,
    location: config.location?.trim() || 'US',
  };

  if (config.authMethod === 'serviceAccountJson' || config.authMethod === 'serviceAccount') {
    if (config.credentialsJson?.trim()) {
      try {
        opts.credentials = JSON.parse(config.credentialsJson) as Record<string, unknown>;
      } catch {
        return {
          error: {
            status: 400,
            code: 'BAD_REQUEST',
            message: 'Invalid BigQuery service account JSON.',
          },
        };
      }
    } else if (config.credentialsPath?.trim()) {
      if (!existsSync(config.credentialsPath.trim())) {
        return {
          error: {
            status: 401,
            code: 'AUTH_REQUIRED',
            message: `BigQuery credentials file not found at "${config.credentialsPath}". Run: gcloud auth login && gcloud auth application-default login (or switch BigQuery mode to Sandbox).`,
          },
        };
      }
      opts.keyFilename = config.credentialsPath.trim();
    } else {
      return {
        error: {
          status: 401,
          code: 'AUTH_REQUIRED',
          message:
            'Service Account credentials missing. Provide Service Account JSON/path or run: gcloud auth application-default login.',
        },
      };
    }
  } else if (config.authMethod === 'serviceAccountPath') {
    const credPath = config.credentialsPath?.trim() || '';
    if (!credPath || !existsSync(credPath)) {
      return {
        error: {
          status: 401,
          code: 'AUTH_REQUIRED',
          message:
            'BigQuery Service Account key file not found. Provide a valid path or switch BigQuery mode to Sandbox.',
        },
      };
    }
    opts.keyFilename = credPath;
  } else {
    // ADC mode: fail fast with actionable guidance if neither GOOGLE_APPLICATION_CREDENTIALS nor gcloud ADC exists
    const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (gac && !existsSync(gac)) {
      return {
        error: {
          status: 401,
          code: 'AUTH_REQUIRED',
          message: `GOOGLE_APPLICATION_CREDENTIALS path "${gac}" does not exist. Run: gcloud auth application-default login (or switch BigQuery mode to Sandbox).`,
        },
      };
    }
  }

  return { client: new BigQuery(opts) };
}

function toEpochSeconds(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val > 1e12 ? Math.floor(val / 1000) : Math.floor(val);
  }
  if (val && typeof val === 'object' && 'value' in val) {
    return toEpochSeconds((val as { value: unknown }).value);
  }
  if (typeof val === 'string' && val.trim()) {
    const ms = Date.parse(val);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return null;
}

function extractLiveOverlay(
  rows: Array<Record<string, unknown>>,
  queryType: BigQueryQueryType,
): ChartOverlayData | undefined {
  if (rows.length === 0) return undefined;

  if (queryType === 'AI.FORECAST' || 'forecast_value' in rows[0]) {
    const points: ForecastPoint[] = [];
    let confidenceLevel = 0.95;
    for (const row of rows) {
      const time = toEpochSeconds(row.forecast_timestamp);
      const value = Number(row.forecast_value);
      const lowerBound = Number(
        row.prediction_interval_lower_bound ?? row.lower_bound ?? value,
      );
      const upperBound = Number(
        row.prediction_interval_upper_bound ?? row.upper_bound ?? value,
      );
      if (typeof row.confidence_level === 'number') {
        confidenceLevel = row.confidence_level;
      }
      if (time !== null && Number.isFinite(value)) {
        points.push({
          time,
          value,
          lowerBound: Number.isFinite(lowerBound) ? lowerBound : value,
          upperBound: Number.isFinite(upperBound) ? upperBound : value,
        });
      }
    }
    if (points.length > 0) {
      return {
        forecast: {
          id: `bq_live_${Date.now().toString(36)}`,
          label: `Live BigQuery Forecast (${points.length} bars)`,
          points,
          confidenceLevel,
          executionMode: 'live',
        },
        visible: true,
      };
    }
  }

  if (queryType === 'AI.DETECT_ANOMALIES' || 'is_anomaly' in rows[0]) {
    const anomalies: AnomalyMarker[] = [];
    for (const row of rows) {
      if (row.is_anomaly !== true) continue;
      const time = toEpochSeconds(row.time_series_timestamp);
      const value = Number(row.time_series_data);
      const lowerBound = Number(row.lower_bound ?? value);
      const upperBound = Number(row.upper_bound ?? value);
      const probability = Number(row.anomaly_probability ?? 0.95);
      if (time !== null && Number.isFinite(value)) {
        const mid = (lowerBound + upperBound) / 2;
        anomalies.push({
          time,
          value,
          lowerBound: Number.isFinite(lowerBound) ? lowerBound : value,
          upperBound: Number.isFinite(upperBound) ? upperBound : value,
          probability: Number.isFinite(probability) ? probability : 0.95,
          direction: value >= mid ? 'high' : 'low',
        });
      }
    }
    return { anomalies, visible: true };
  }

  return undefined;
}

export async function testBigQueryConnection(
  config: BigQueryConfig,
): Promise<{ status: number; body: BigQueryTestResponse }> {
  if (config.mode === 'sandbox') {
    return {
      status: 200,
      body: {
        ok: true,
        mode: 'sandbox',
        message:
          'BigQuery AI/ML Sandbox engine ready (TimesFM/Holt-Winters forecast, Z-score anomalies, SQL best-practices validator).',
      },
    };
  }

  const built = buildBigQueryClient(config);
  if (built.error || !built.client) {
    return {
      status: built.error?.status ?? 400,
      body: {
        ok: false,
        mode: 'live',
        code: built.error?.code ?? 'AUTH_REQUIRED',
        message: built.error?.message ?? 'BigQuery Live credentials missing.',
      },
    };
  }

  try {
    await built.client.createQueryJob({
      query: 'SELECT 1 AS ok',
      location: config.location?.trim() || 'US',
      dryRun: true,
    });
    return {
      status: 200,
      body: {
        ok: true,
        mode: 'live',
        message: `Connected to BigQuery Live project "${config.projectId}".`,
      },
    };
  } catch (err) {
    const classified = classifyLiveGcpError(err);
    return {
      status: classified.status,
      body: {
        ok: false,
        mode: 'live',
        code: classified.code,
        message: classified.message,
      },
    };
  }
}

export async function dryRunBigQuery(
  config: BigQueryConfig,
  req: BigQueryDryRunRequest,
): Promise<{ status: number; body: BigQueryDryRunResponse }> {
  const validation = validateBigQueryAISql(req.sql);
  if (!validation.valid) {
    return {
      status: 400,
      body: {
        ok: false,
        mode: config.mode,
        valid: false,
        estimatedBytes: 0,
        queryType: validation.queryType,
        error: validation.error,
      },
    };
  }

  if (config.mode === 'sandbox') {
    return {
      status: 200,
      body: {
        ok: true,
        mode: 'sandbox',
        valid: true,
        estimatedBytes: validation.estimatedBytes,
        queryType: validation.queryType,
      },
    };
  }

  const built = buildBigQueryClient(config);
  if (built.error || !built.client) {
    return {
      status: built.error?.status ?? 401,
      body: {
        ok: false,
        mode: 'live',
        valid: false,
        estimatedBytes: 0,
        queryType: validation.queryType,
        error: built.error?.message ?? 'GCP credentials missing.',
      },
    };
  }

  try {
    const [job] = await built.client.createQueryJob({
      query: req.sql,
      location: config.location?.trim() || 'US',
      dryRun: true,
    });
    const meta = job.metadata as {
      statistics?: { totalBytesProcessed?: string | number };
    };
    const bytes = Number(meta?.statistics?.totalBytesProcessed ?? 0);
    return {
      status: 200,
      body: {
        ok: true,
        mode: 'live',
        valid: true,
        estimatedBytes: Number.isFinite(bytes) ? bytes : 0,
        queryType: validation.queryType,
      },
    };
  } catch (err) {
    const classified = classifyLiveGcpError(err);
    return {
      status: classified.status,
      body: {
        ok: false,
        mode: 'live',
        valid: false,
        estimatedBytes: 0,
        queryType: validation.queryType,
        error: classified.message,
      },
    };
  }
}

export async function executeBigQuery(
  config: BigQueryConfig,
  req: BigQueryExecuteRequest,
): Promise<{ status: number; body: BigQueryExecuteResponse }> {
  if (config.mode === 'sandbox') {
    let bars: OHLCVBar[] = req.bars ?? [];
    if (bars.length === 0) {
      const mkt = await getOHLCVBars({
        symbol: req.symbol || 'AAPL',
        timeframe: req.timeframe || '1D',
        limit: 300,
      });
      bars = mkt.bars;
    }
    const result = executeBigQuerySandbox(req, bars);
    return {
      status: result.ok ? 200 : 400,
      body: result,
    };
  }

  const validation = validateBigQueryAISql(req.sql);
  if (!validation.valid) {
    return {
      status: 400,
      body: {
        ok: false,
        executionMode: 'live',
        jobId: `bq_live_err_${Date.now().toString(36)}`,
        estimatedBytes: 0,
        durationMs: 0,
        queryType: validation.queryType,
        columns: [],
        rows: [],
        error: validation.error,
        code: 'BAD_REQUEST',
      },
    };
  }

  const built = buildBigQueryClient(config);
  if (built.error || !built.client) {
    return {
      status: built.error?.status ?? 401,
      body: {
        ok: false,
        executionMode: 'live',
        jobId: `bq_live_auth_${Date.now().toString(36)}`,
        estimatedBytes: 0,
        durationMs: 0,
        queryType: validation.queryType,
        columns: [],
        rows: [],
        error: built.error?.message ?? 'GCP credentials missing.',
        code: built.error?.code ?? 'AUTH_REQUIRED',
      },
    };
  }

  const t0 = Date.now();
  try {
    const [job] = await built.client.createQueryJob({
      query: req.sql,
      location: config.location?.trim() || 'US',
      maximumBytesBilled: String(config.maxBytesBilled ?? 1_073_741_824),
    });
    const [rawRows] = await job.getQueryResults();
    const rows = (Array.isArray(rawRows) ? rawRows : []) as Array<
      Record<string, unknown>
    >;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const meta = job.metadata as {
      statistics?: { totalBytesProcessed?: string | number };
    };
    const bytes = Number(meta?.statistics?.totalBytesProcessed ?? 0);

    return {
      status: 200,
      body: {
        ok: true,
        executionMode: 'live',
        jobId: job.id ?? `bq_live_${Date.now().toString(36)}`,
        estimatedBytes: Number.isFinite(bytes) ? bytes : 0,
        durationMs: Math.max(1, Date.now() - t0),
        queryType: validation.queryType,
        columns,
        rows,
        chartOverlay: extractLiveOverlay(rows, validation.queryType),
      },
    };
  } catch (err) {
    const classified = classifyLiveGcpError(err);
    return {
      status: classified.status,
      body: {
        ok: false,
        executionMode: 'live',
        jobId: `bq_live_err_${Date.now().toString(36)}`,
        estimatedBytes: 0,
        durationMs: Math.max(1, Date.now() - t0),
        queryType: validation.queryType,
        columns: [],
        rows: [],
        error: classified.message,
        code: classified.code,
      },
    };
  }
}
