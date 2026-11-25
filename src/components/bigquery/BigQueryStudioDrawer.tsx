import { useWorkspaceStore } from '../../state/workspaceStore';

export function BigQueryStudioDrawer() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bqResult = useWorkspaceStore((s) => s.bqResult);
  const bqError = useWorkspaceStore((s) => s.bqError);
  const setActiveRightTab = useWorkspaceStore((s) => s.setActiveRightTab);

  return (
    <div className="h-full flex flex-col gap-2 text-[12px]">
      <div className="flex items-center justify-between">
        <div className="text-[var(--tv-text-secondary)]">
          BigQuery AI/ML Results Studio —{' '}
          <span className="font-semibold text-[var(--tv-text-primary)]">
            {symbol} ({timeframe})
          </span>
          {bqResult?.ok && (
            <span className="ml-2 text-[11px] text-[#089981]">
              {bqResult.queryType} · {bqResult.rows.length} rows · {bqResult.durationMs}ms
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setActiveRightTab('bigquery')}
          className="px-2.5 py-1 rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[11px] cursor-pointer"
        >
          Open BigQuery Panel
        </button>
      </div>

      {bqError && (
        <div className="p-2 rounded border border-[#f23645]/40 bg-[#f23645]/10 text-[#f23645] text-[11px]">
          {bqError}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto rounded border border-[var(--tv-border)] bg-[var(--tv-bg-canvas)]">
        {bqResult?.ok && bqResult.rows.length > 0 ? (
          <table className="w-full text-left border-collapse text-[11px] tabular-nums">
            <thead className="sticky top-0 bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)]">
              <tr>
                {bqResult.columns.map((col) => (
                  <th
                    key={col}
                    className="px-2.5 py-1.5 font-medium border-b border-[var(--tv-border)] whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tv-border-subtle)]">
              {bqResult.rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-[var(--tv-bg-elevated)]/60">
                  {bqResult.columns.map((col) => (
                    <td
                      key={col}
                      className="px-2.5 py-1 text-[var(--tv-text-primary)] whitespace-nowrap"
                    >
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-full flex items-center justify-center text-[11px] text-[var(--tv-text-muted)]">
            Execute a BigQuery AI/ML query from the BigQuery panel to inspect full tabular output.
          </div>
        )}
      </div>
    </div>
  );
}
