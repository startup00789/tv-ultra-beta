import { useState, type FormEvent } from 'react';
import { Zap } from 'lucide-react';
import { runLocalCopilotCommand } from '../../lib/localCopilotEngine';
import { useWorkspaceStore } from '../../state/workspaceStore';

export function AIConsoleDrawer() {
  const aiMessages = useWorkspaceStore((s) => s.aiMessages);
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bars = useWorkspaceStore((s) => s.bars);
  const watchlist = useWorkspaceStore((s) => s.watchlist);
  const connectionStatuses = useWorkspaceStore((s) => s.connectionStatuses);
  const setActiveRightTab = useWorkspaceStore((s) => s.setActiveRightTab);
  const openConnectionsModal = useWorkspaceStore((s) => s.openConnectionsModal);
  const appendAIMessage = useWorkspaceStore((s) => s.appendAIMessage);
  const executeAIChartActions = useWorkspaceStore((s) => s.executeAIChartActions);

  const [cmdInput, setCmdInput] = useState('');

  const handleRunCommand = (e: FormEvent) => {
    e.preventDefault();
    const raw = cmdInput.trim();
    if (!raw) return;
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    const localRes = runLocalCopilotCommand(normalized, {
      symbol,
      timeframe,
      bars,
      watchlist,
    });
    if (!localRes) return;
    appendAIMessage({
      id: `u-console-${Date.now().toString(36)}`,
      role: 'user',
      provider: 'opencode',
      text: normalized,
      symbol,
      timeframe,
      timestamp: new Date().toISOString(),
    });
    if (localRes.chartActions.length > 0) {
      executeAIChartActions(localRes.chartActions);
    }
    appendAIMessage({
      id: `a-console-${Date.now().toString(36)}`,
      role: 'assistant',
      provider: 'opencode',
      text: localRes.text,
      symbol,
      timeframe,
      timestamp: new Date().toISOString(),
      modelLabel: 'Instant Hybrid (<50ms)',
      chartActions: localRes.chartActions,
      toolCalls: localRes.toolCalls,
    });
    setCmdInput('');
  };

  return (
    <div data-testid="ai-console-drawer" className="h-full flex flex-col gap-2 p-2.5 text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[var(--tv-text-secondary)]">
          Active Context:{' '}
          <span className="font-semibold text-[var(--tv-text-primary)]">
            {symbol} ({timeframe})
          </span>{' '}
          · OpenCode: <span className="font-semibold">{connectionStatuses.opencode}</span> · Gemini:{' '}
          <span className="font-semibold">{connectionStatuses.gemini}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveRightTab('ai')}
            className="px-2.5 py-1 rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[11px] cursor-pointer"
          >
            Focus AI Sidebar
          </button>
          <button
            type="button"
            onClick={() => openConnectionsModal('opencode')}
            className="px-2.5 py-1 rounded bg-[var(--tv-accent)] text-white text-[11px] cursor-pointer"
          >
            Connections
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto rounded border border-[var(--tv-border)] bg-[var(--tv-bg-canvas)] p-2.5 font-mono text-[11px]">
        {aiMessages.length === 0 ? (
          <div className="text-[var(--tv-text-muted)]">
            No AI interactions logged yet. Run an instant command below (e.g. /help, /sr, /smc, /vp, /regime, /scan) or use the AI Assistant sidebar.
          </div>
        ) : (
          aiMessages.map((m) => (
            <div key={m.id} className="mb-2 last:mb-0">
              <span className="text-[var(--tv-accent)] font-semibold">
                [{m.provider.toUpperCase()} · {m.role}]
              </span>{' '}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <span className="text-[#089981] font-semibold">
                  [⚡ {m.toolCalls[0].label} {m.toolCalls[0].durationMs}ms]{' '}
                </span>
              )}
              <span className="text-[var(--tv-text-primary)] whitespace-pre-wrap">{m.text}</span>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleRunCommand} className="flex items-center gap-1.5 shrink-0">
        <input
          type="text"
          data-testid="ai-console-slash-input"
          value={cmdInput}
          onChange={(e) => setCmdInput(e.target.value)}
          placeholder="Instant tool command: /help, /sr, /smc, /vp, /fib, /regime, /scan, /replay..."
          className="flex-1 h-[28px] px-2.5 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] font-mono text-[11px] text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-muted)] focus:outline-none focus:border-[var(--tv-accent)]"
        />
        <button
          type="submit"
          data-testid="ai-console-slash-run"
          className="h-[28px] px-3 rounded bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
        >
          <Zap className="w-3 h-3" />
          <span>Run Instant</span>
        </button>
      </form>
    </div>
  );
}
