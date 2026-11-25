import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../server/index.js';
import {
  executeBigQuerySandbox,
  getBigQueryPresets,
  validateBigQueryAISql,
} from '../../server/services/bigquerySandbox.js';
import { resetConnectionsConfig } from '../../server/services/connectionsStore.js';
import { getSeededBars } from '../../server/services/marketData.js';

describe('BigQuery AI/ML SQL Validator, Sandbox Engine & Routes', () => {
  beforeEach(() => {
    resetConnectionsConfig();
  });

  it('validates all official presets against ai_function_best_practices.md rules', () => {
    const presets = getBigQueryPresets('NVDA');
    expect(presets.length).toBeGreaterThanOrEqual(5);
    for (const preset of presets) {
      const check = validateBigQueryAISql(preset.sql);
      expect(check.valid, `Preset ${preset.id} failed validation: ${check.error}`).toBe(
        true,
      );
      expect(check.estimatedBytes).toBeGreaterThan(0);
    }
  });

  it('rejects TVFs outside FROM clause, missing => named args, and unaliased AI.GENERATE_TABLE prompts', () => {
    const tvfInSelect = validateBigQueryAISql(
      "SELECT AI.FORECAST(TABLE my_tbl, data_col => 'close', timestamp_col => 'timestamp');",
    );
    expect(tvfInSelect.valid).toBe(false);
    expect(tvfInSelect.error).toContain('FROM');

    const missingArrow = validateBigQueryAISql(
      "SELECT * FROM AI.FORECAST((SELECT timestamp, close FROM t), 'close', 'timestamp');",
    );
    expect(missingArrow.valid).toBe(false);
    expect(missingArrow.error).toContain('=>');

    const missingPromptAlias = validateBigQueryAISql(
      "SELECT * FROM AI.GENERATE_TABLE((SELECT symbol AS txt FROM t), connection_id => 'DEFAULT', output_schema => 'summary STRING');",
    );
    expect(missingPromptAlias.valid).toBe(false);
    expect(missingPromptAlias.error).toContain('prompt');

    const mutationSql = validateBigQueryAISql('DROP TABLE market_analytics.ohlcv_bars;');
    expect(mutationSql.valid).toBe(false);
  });

  it('computes Holt-Winters AI.FORECAST with valid confidence bounds and AI.EVALUATE metrics', () => {
    const bars = getSeededBars('AAPL', '1D', 200);
    const forecastPreset = getBigQueryPresets('AAPL').find((p) => p.id === 'forecast')!;
    const forecastRes = executeBigQuerySandbox(
      { sql: forecastPreset.sql, symbol: 'AAPL', timeframe: '1D' },
      bars,
    );

    expect(forecastRes.ok).toBe(true);
    expect(forecastRes.executionMode).toBe('sandbox');
    expect(forecastRes.rows).toHaveLength(14);
    expect(forecastRes.chartOverlay?.forecast?.points).toHaveLength(14);

    const lastTime = bars[bars.length - 1].time;
    for (const pt of forecastRes.chartOverlay!.forecast!.points) {
      expect(pt.time).toBeGreaterThan(lastTime);
      expect(pt.lowerBound).toBeLessThan(pt.value);
      expect(pt.value).toBeLessThan(pt.upperBound);
    }

    const evalPreset = getBigQueryPresets('AAPL').find((p) => p.id === 'evaluate')!;
    const evalRes = executeBigQuerySandbox(
      { sql: evalPreset.sql, symbol: 'AAPL', timeframe: '1D' },
      bars,
    );
    expect(evalRes.ok).toBe(true);
    expect(evalRes.metrics).toBeDefined();
    expect(evalRes.metrics!.mae).toBeGreaterThan(0);
    expect(evalRes.metrics!.rmse).toBeGreaterThanOrEqual(evalRes.metrics!.mae);
    expect(evalRes.metrics!.mape).toBeGreaterThan(0);
  });

  it('flags synthetic 5-sigma spike in AI.DETECT_ANOMALIES', () => {
    const baseBars = getSeededBars('BTCUSDT', '1h', 120).map((b, idx) => ({
      ...b,
      close: 50000 + Math.sin(idx / 5) * 40,
      open: 50000,
      high: 50060,
      low: 49940,
    }));
    // Inject extreme 5+ sigma spike near the end
    const spikeIdx = baseBars.length - 3;
    baseBars[spikeIdx] = {
      ...baseBars[spikeIdx],
      close: 56500,
      high: 56600,
    };

    const anomPreset = getBigQueryPresets('BTCUSDT').find((p) => p.id === 'anomalies')!;
    const res = executeBigQuerySandbox(
      { sql: anomPreset.sql, symbol: 'BTCUSDT', timeframe: '1h' },
      baseBars,
    );

    expect(res.ok).toBe(true);
    const markers = res.chartOverlay?.anomalies ?? [];
    expect(markers.length).toBeGreaterThanOrEqual(1);
    const hit = markers.find((m) => m.time === baseBars[spikeIdx].time);
    expect(hit).toBeDefined();
    expect(hit!.direction).toBe('high');
    expect(hit!.probability).toBeGreaterThanOrEqual(0.9);
  });

  it('serves /api/bigquery/* routes in sandbox mode and returns AUTH_REQUIRED diagnostics in live mode without GCP creds', async () => {
    const app = await buildApp({ logger: false, serveStatic: false });

    const presetsRes = await app.inject({
      method: 'GET',
      url: '/api/bigquery/presets?symbol=TSLA',
    });
    expect(presetsRes.statusCode).toBe(200);
    const presets = presetsRes.json().presets;
    expect(presets[0].sql).toContain("symbol = 'TSLA'");

    const dryRunRes = await app.inject({
      method: 'POST',
      url: '/api/bigquery/dry-run',
      payload: { sql: presets[0].sql, symbol: 'TSLA' },
    });
    expect(dryRunRes.statusCode).toBe(200);
    expect(dryRunRes.json().valid).toBe(true);
    expect(dryRunRes.json().estimatedBytes).toBeGreaterThan(0);

    const execRes = await app.inject({
      method: 'POST',
      url: '/api/bigquery/execute',
      payload: { sql: presets[0].sql, symbol: 'TSLA', timeframe: '1D' },
    });
    expect(execRes.statusCode).toBe(200);
    expect(execRes.json().ok).toBe(true);
    expect(execRes.json().chartOverlay.forecast.points).toHaveLength(14);

    // Switch to Live mode with non-existent serviceAccountPath -> AUTH_REQUIRED 401
    await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        bigquery: {
          mode: 'live',
          projectId: 'my-test-project',
          authMethod: 'serviceAccountPath',
          credentialsPath: 'C:\\nonexistent\\sa-key.json',
        },
      },
    });
    const liveTest = await app.inject({ method: 'POST', url: '/api/bigquery/test' });
    expect(liveTest.statusCode).toBe(401);
    expect(liveTest.json().code).toBe('AUTH_REQUIRED');

    await app.close();
  });
});
