import { BrainCircuit, Sparkles, Terminal } from 'lucide-react';
import type { ProviderConnectionStatus } from '../../../shared/types';
import { useWorkspaceStore } from '../../state/workspaceStore';

function dotColor(status?: ProviderConnectionStatus): string {
  switch (status) {
    case 'connected':
      return '#089981';
    case 'testing':
      return '#f59e0b';
    case 'error':
      return '#f23645';
    default:
      return '#787b86';
  }
}

export function TopBarConnectionPills() {
  const connectionStatuses = useWorkspaceStore((s) => s.connectionStatuses);
  const toggleRightTab = useWorkspaceStore((s) => s.toggleRightTab);
  const openConnectionsModal = useWorkspaceStore((s) => s.openConnectionsModal);

  const anyAiConnected =
    connectionStatuses.deepseek === 'connected' ||
    connectionStatuses.opencode === 'connected' ||
    connectionStatuses.byok === 'connected' ||
    connectionStatuses.gemini === 'connected';
  const aiDot = anyAiConnected
    ? '#089981'
    : connectionStatuses.opencode === 'error' ||
        connectionStatuses.deepseek === 'error' ||
        connectionStatuses.gemini === 'error'
      ? '#f23645'
      : '#787b86';

  const dsOrByokConnected =
    connectionStatuses.deepseek === 'connected' || connectionStatuses.byok === 'connected';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        data-testid="topbar-deepseek-btn"
        aria-label="Connect DeepSeek or Bring Your Own API"
        title="Configure DeepSeek V3/R1 or Bring Your Own API (OpenRouter, OpenAI, Groq, Ollama)"
        onClick={() => openConnectionsModal('deepseek')}
        className={`h-[26px] px-2 rounded-[4px] border flex items-center gap-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
          dsOrByokConnected
            ? 'border-[#089981]/40 bg-[#089981]/10 text-[#089981] hover:bg-[#089981]/15'
            : 'border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] text-[var(--tv-text-primary)] hover:bg-[var(--tv-bg-hover)]'
        }`}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            backgroundColor: dsOrByokConnected
              ? '#089981'
              : dotColor(connectionStatuses.deepseek),
          }}
        />
        <BrainCircuit className="w-3 h-3 shrink-0 text-[#38bdf8]" />
        <span className="hidden lg:inline">DeepSeek / BYOK</span>
      </button>

      <button
        type="button"
        data-testid="topbar-opencode-btn"
        aria-label="Connect OpenCode"
        title={`OpenCode: ${connectionStatuses.opencode} (click to connect or configure)`}
        onClick={() => openConnectionsModal('opencode')}
        className={`h-[26px] px-2 rounded-[4px] border flex items-center gap-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
          connectionStatuses.opencode === 'connected'
            ? 'border-[#089981]/40 bg-[#089981]/10 text-[#089981] hover:bg-[#089981]/15'
            : 'border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] text-[var(--tv-text-primary)] hover:bg-[var(--tv-bg-hover)]'
        }`}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: dotColor(connectionStatuses.opencode) }}
        />
        <Terminal className="w-3 h-3 shrink-0" />
        <span className="hidden md:inline">
          {connectionStatuses.opencode === 'connected' ? (
            'OpenCode'
          ) : (
            <>
              <span className="hidden xl:inline">Connect </span>OpenCode
            </>
          )}
        </span>
      </button>

      <button
        type="button"
        aria-label="Open AI Assistant"
        title="AI Strategy & Live Forward-Test Copilot"
        onClick={() => toggleRightTab('ai')}
        className="h-[26px] px-2 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] flex items-center gap-1.5 text-[11px] font-medium text-[var(--tv-text-primary)] transition-colors cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: aiDot }} />
        <Sparkles className="w-3 h-3 text-[var(--tv-accent)]" />
        <span className="hidden lg:inline">AI Copilot</span>
      </button>
    </div>
  );
}
