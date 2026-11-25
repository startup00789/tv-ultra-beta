import { useEffect, useState } from 'react';
import {
  Activity,
  Database,
  Eye,
  EyeOff,
  Play,
  Plug,
  Sparkles,
} from 'lucide-react';
import type { BigQueryPreset, BigQueryPresetId } from '../../../shared/types';
import { apiClient, ApiError } from '../../lib/apiClient';
import { useWorkspaceStore } from '../../state/workspaceStore';

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function BigQueryPanel() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bars = useWorkspaceStore((s) => s.bars);
  const chartOverlay = useWorkspaceStore((s) => s.chartOverlay);
  const overlayVisible = useWorkspaceStore((s) => s.overlayVisible);
  const connectionStatuses = useWorkspaceStore((s) => s.connectionStatuses);

  const bqSql = useWorkspaceStore((s) => s.bqSql);
  const bqResult = useWorkspaceStore((s) => s.bqResult);
  const bqDryRun = useWorkspaceStore((s) => s.bqDryRun);
  const bqError = useWorkspaceStore((s) => s.bqError);
  const bqLoading = useWorkspaceStore((s) => s.bqLoading);

  const setBqSql = useWorkspaceStore((s) => s.setBqSql);
  const setBqResult = useWorkspaceStore((s) => s.setBqResult);
  const setBqDryRun = useWorkspaceStore((s) => s.setBqDryRun);
  const setBqError = useWorkspaceStore((s) => s.setBqError);
  const setBqLoading = useWorkspaceStore((s) => s.setBqLoading);
  const setChartOverlay = useWorkspaceStore((s) => s.setChartOverlay);
  const setOverlayVisible = useWorkspaceStore((s) => s.setOverlayVisible);
  const openConnectionsModal = useWorkspaceStore((s) => s.openConnectionsModal);
  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);

  const [presets, setPresets] = useState<BigQueryPreset[]>([]);

  useEffect(() => {
    let active = true;
    apiClient
      .getBigQueryPresets(symbol)
      .then((res) => {
        if (!active) return;
        setPresets(res.presets);
        if (!useWorkspaceStore.getState().bqSql.trim() && res.presets[0]) {
          setBqSql(res.presets[0].sql);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [setBqSql, symbol]);

  const handleDryRun = async (sqlToTest?: string) => {
    const sql = (sqlToTest ?? bqSql).trim();
    setBqLoading(true);
    setBqError(null);
    try {
      const res = await apiClient.dryRunBigQuery({ sql, symbol });
      setBqDryRun(res);
      if (!res.valid) {
        setBqError(res.error || 'SQL validation failed.');
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Dry-run failed.';
      setBqDryRun(null);
      setBqError(msg);
    } finally {
      setBqLoading(false);
    }
  };

  const handleExecute = async (sqlOverride?: string, presetType?: BigQueryPresetId) => {
    const sql = (sqlOverride ?? bqSql).trim();
    setBqLoading(true);
    setBqError(null);
    try {
      const res = await apiClient.executeBigQuery({
        sql,
        symbol,
        timeframe,
        bars,
        presetType,
      });
      setBqResult(res);
      if (!res.ok) {
        setBqError(res.error || 'BigQuery execution failed.');
        return;
      }
      if (res.chartOverlay) {
        setChartOverlay(res.chartOverlay);
        setOverlayVisible(true);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'BigQuery execution failed.';
      setBqError(msg);
    } finally {
      setBqLoading(false);
    }
  };

  const handlePresetClick = async (presetId: BigQueryPresetId) => {
    let list = presets;
    if (list.length === 0) {
      try {
        const res = await apiClient.getBigQueryPresets(symbol);
        list = res.presets;
        setPresets(list);
      } catch {
        // Ignore; fall back to current SQL
      }
    }
    const found = list.find((p) => p.id === presetId);
    const sql = found?.sql ?? bqSql;
    if (found) {
      setBqSql(found.sql);
    }
    await handleExecute(sql, presetId);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[var(--tv-border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 font-semibold text-[13px] text-[var(--tv-text-primary)]">
          <Database className="w-4 h-4 text-[#089981]" />
          <span>BigQuery AI/ML</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${
              connectionStatuses.bigquery === 'error'
                ? 'bg-[#f23645]/15 text-[#f23645]'
                : 'bg-[#2962ff]/15 text-[#2962ff]'
            }`}
          >
            {connectionStatuses.bigquery === 'connected' ? 'live' : connectionStatuses.bigquery}
          </span>
          <button
            type="button"
            aria-label="Configure BigQuery"
            onClick={() => openConnectionsModal('bigquery')}
            className="p-1 rounded text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
          >
            <Plug className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* One-Click Presets */}
      <div className="p-2.5 border-b border-[var(--tv-border)] flex flex-col gap-2 shrink-0">
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <button
            type="button"
            data-testid="bq-preset-forecast"
            disabled={bqLoading}
            onClick={() => void handlePresetClick('forecast')}
            className="h-[28px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-[#2962ff]" />
            <span>AI.FORECAST</span>
          </button>
          <button
            type="button"
            data-testid="bq-preset-anomalies"
            disabled={bqLoading}
            onClick={() => void handlePresetClick('anomalies')}
            className="h-[28px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] flex items-center gap-1.5 cursor-pointer"
          >
            <Activity className="w-3 h-3 text-[#f59e0b]" />
            <span>ANOMALIES</span>
          </button>
          <button
            type="button"
            data-testid="bq-preset-evaluate"
            disabled={bqLoading}
            onClick={() => void handlePresetClick('evaluate')}
            className="h-[28px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] flex items-center gap-1.5 cursor-pointer"
          >
            <span>AI.EVALUATE</span>
          </button>
          <button
            type="button"
            data-testid="bq-preset-regime"
            disabled={bqLoading}
            onClick={() => void handlePresetClick('regime')}
            className="h-[28px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] flex items-center gap-1.5 cursor-pointer"
          >
            <span>AI.GENERATE</span>
          </button>
        </div>

        {/* SQL Editor */}
        <textarea
          data-testid="bq-sql-editor"
          aria-label="BigQuery SQL editor"
          rows={6}
          value={bqSql}
          onChange={(e) => setBqSql(e.target.value)}
          className="w-full p-2 rounded-[4px] bg-[var(--tv-bg-canvas)] border border-[var(--tv-border)] text-[11px] font-mono text-[var(--tv-text-primary)] focus:outline-none focus:border-[var(--tv-accent)] resize-y"
        />

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="bq-dryrun-btn"
            disabled={bqLoading}
            onClick={() => void handleDryRun()}
            className="h-[28px] px-2.5 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[11px] font-medium text-[var(--tv-text-primary)] cursor-pointer"
          >
            Dry Run
          </button>
          <button
            type="button"
            data-testid="bq-execute-btn"
            disabled={bqLoading}
            onClick={() => void handleExecute()}
            className="flex-1 h-[28px] px-2.5 rounded-[4px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white text-[11px] font-medium flex items-center justify-center gap-1 cursor-pointer"
          >
            <Play className="w-3 h-3" />
            <span>{bqLoading ? 'Running...' : 'Run SQL'}</span>
          </button>
          <button
            type="button"
            data-testid="bq-overlay-toggle"
            aria-label="Toggle BigQuery chart overlay"
            title={overlayVisible ? 'Hide chart overlay' : 'Show chart overlay'}
            onClick={() => setOverlayVisible(!overlayVisible)}
            className={`w-[28px] h-[28px] rounded-[4px] border flex items-center justify-center cursor-pointer ${
              overlayVisible && chartOverlay
                ? 'border-[var(--tv-accent)] text-[var(--tv-accent)] bg-[var(--tv-accent)]/12'
                : 'border-[var(--tv-border)] text-[var(--tv-text-muted)] bg-[var(--tv-bg-elevated)]'
            }`}
          >
            {overlayVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>

        {bqDryRun && bqDryRun.valid && (
          <div className="text-[11px] text-[#089981]">
            Dry-run valid ({bqDryRun.queryType}) · Est. {formatBytes(bqDryRun.estimatedBytes)}
          </div>
        )}

        {bqError && (
          <div className="p-2 rounded-[4px] border border-[#f23645]/45 bg-[#f23645]/10 text-[#f23645] text-[11px]">
            {bqError}
          </div>
        )}
      </div>

      {/* Results & Evaluation Metrics */}
      <div className="flex-1 min-h-0 overflow-auto p-2.5 flex flex-col gap-2">
        {bqResult?.metrics && (
          <div className="grid grid-cols-3 gap-1.5 text-[11px] tabular-nums">
            <div className="p-1.5 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)]">
              <div className="text-[10px] text-[var(--tv-text-muted)]">MAE</div>
              <div className="font-semibold text-[var(--tv-text-primary)]">
                {bqResult.metrics.mae}
              </div>
            </div>
            <div className="p-1.5 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)]">
              <div className="text-[10px] text-[var(--tv-text-muted)]">RMSE</div>
              <div className="font-semibold text-[var(--tv-text-primary)]">
                {bqResult.metrics.rmse}
              </div>
            </div>
            <div className="p-1.5 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)]">
              <div className="text-[10px] text-[var(--tv-text-muted)]">MAPE</div>
              <div className="font-semibold text-[var(--tv-text-primary)]">
                {bqResult.metrics.mape}%
              </div>
            </div>
          </div>
        )}

        {bqResult?.ok && bqResult.rows.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--tv-text-muted)]">
              <span>
                {bqResult.executionMode.toUpperCase()} · {bqResult.rows.length} rows
              </span>
              <button
                type="button"
                onClick={() => setActiveBottomTab('bigquery')}
                className="text-[var(--tv-accent)] hover:underline cursor-pointer"
              >
                Expand Table
              </button>
            </div>
            <div className="overflow-x-auto rounded-[4px] border border-[var(--tv-border)]">
              <table
                data-testid="bq-results-table"
                className="w-full text-left border-collapse text-[10px] tabular-nums"
              >
                <thead className="bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)]">
                  <tr>
                    {bqResult.columns.map((col) => (
                      <th key={col} className="px-2 py-1 font-medium border-b border-[var(--tv-border)] whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--tv-border-subtle)]">
                  {bqResult.rows.slice(0, 12).map((row, idx) => (
                    <tr key={idx} className="hover:bg-[var(--tv-bg-elevated)]/60">
                      {bqResult.columns.map((col) => (
                        <td key={col} className="px-2 py-1 text-[var(--tv-text-primary)] whitespace-nowrap">
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-[11px] text-[var(--tv-text-muted)]">
            Run a preset or custom BigQuery AI/ML query to inspect results and chart overlays.
          </div>
        )}
      </div>
    </div>
  );
}
