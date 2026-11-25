import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  BrainCircuit,
  FlaskConical,
  Layers,
  Play,
  Plug,
  Radar,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import type {
  AIChartAction,
  ChartContextPayload,
  OpenCodeProviderModel,
} from '../../../shared/types';
import { apiClient, ApiError } from '../../lib/apiClient';
import { runLocalCopilotCommand } from '../../lib/localCopilotEngine';
import { computeClusteredSupportResistance } from '../../lib/technicalOverlays';
import { useWorkspaceStore } from '../../state/workspaceStore';

type CopilotProvider = 'deepseek' | 'opencode' | 'byok' | 'gemini';

function parseModelValue(raw: string): { providerID: string; modelID: string } | null {
  const slashIdx = raw.indexOf('/');
  if (slashIdx <= 0 || slashIdx >= raw.length - 1) return null;
  return {
    providerID: raw.slice(0, slashIdx),
    modelID: raw.slice(slashIdx + 1),
  };
}

function pickPreferredOpenCodeModel(
  models: OpenCodeProviderModel[],
): { providerID: string; modelID: string } | null {
  if (models.length === 0) return null;
  const preferred =
    models.find((m) => m.providerID === 'opencode' && m.modelID === 'big-pickle') ??
    models.find((m) => m.providerID === 'opencode') ??
    models[0];
  return { providerID: preferred.providerID, modelID: preferred.modelID };
}

const VALID_CHART_ACTION_TYPES = new Set<AIChartAction['type']>([
  'draw_hline',
  'draw_trendline',
  'draw_fib',
  'draw_position',
  'add_indicator',
  'create_alert',
  'open_backtester',
  'switch_symbol',
  'set_timeframe',
  'toggle_smc',
  'toggle_vp',
  'toggle_sessions',
  'open_autotrade',
  'start_forward_test',
  'start_replay',
  'clear_drawings',
]);

function extractChartActions(text: string): AIChartAction[] {
  const match = text.match(/```chart-actions\s*([\s\S]*?)```/i);
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AIChartAction => {
      if (!item || typeof item !== 'object') return false;
      const obj = item as Record<string, unknown>;
      return (
        typeof obj.type === 'string' &&
        VALID_CHART_ACTION_TYPES.has(obj.type as AIChartAction['type']) &&
        typeof obj.label === 'string' &&
        Boolean(obj.payload && typeof obj.payload && typeof obj.payload === 'object')
      );
    });
  } catch {
    return [];
  }
}

function isForwardTestIntent(text: string): boolean {
  return /\b(forward[\s-]*test|run\s+in\s+demo|execute\s+in\s+demo|start\s+demo|live\s+demo)\b/i.test(
    text,
  );
}

export function AIAssistantPanel() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const bars = useWorkspaceStore((s) => s.bars);
  const watchlist = useWorkspaceStore((s) => s.watchlist);
  const indicators = useWorkspaceStore((s) => s.indicators);
  const showSmcOverlay = useWorkspaceStore((s) => s.showSmcOverlay);
  const showVolumeProfile = useWorkspaceStore((s) => s.showVolumeProfile);
  const aiRangeSelection = useWorkspaceStore((s) => s.aiRangeSelection);
  const chartOverlay = useWorkspaceStore((s) => s.chartOverlay);
  const connectionStatuses = useWorkspaceStore((s) => s.connectionStatuses);
  const opencodeModels = useWorkspaceStore((s) => s.opencodeModels);
  const opencodeSelectedModel = useWorkspaceStore((s) => s.opencodeSelectedModel);
  const aiMessages = useWorkspaceStore((s) => s.aiMessages);
  const loadedStrategy = useWorkspaceStore((s) => s.loadedStrategy);
  const forwardTestActive = useWorkspaceStore((s) => s.forwardTestActive);

  const appendAIMessage = useWorkspaceStore((s) => s.appendAIMessage);
  const clearAIMessages = useWorkspaceStore((s) => s.clearAIMessages);
  const setAIRangeSelection = useWorkspaceStore((s) => s.setAIRangeSelection);
  const setConnectionStatus = useWorkspaceStore((s) => s.setConnectionStatus);
  const setOpenCodeModels = useWorkspaceStore((s) => s.setOpenCodeModels);
  const setOpenCodeSelectedModel = useWorkspaceStore((s) => s.setOpenCodeSelectedModel);
  const openConnectionsModal = useWorkspaceStore((s) => s.openConnectionsModal);
  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);
  const executeAIChartActions = useWorkspaceStore((s) => s.executeAIChartActions);
  const startForwardTest = useWorkspaceStore((s) => s.startForwardTest);

  const [provider, setProvider] = useState<CopilotProvider>('opencode');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectingLocal, setConnectingLocal] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [connectNote, setConnectNote] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ocSessionId, setOcSessionId] = useState<string | undefined>(undefined);
  const [gemInteractionId, setGemInteractionId] = useState<string | undefined>(undefined);

  const refreshOpenCodeModels = useCallback(async () => {
    setRefreshingModels(true);
    try {
      const res = await apiClient.getOpenCodeStatus();
      if (res.running) {
        setConnectionStatus('opencode', 'connected');
      }
      if (Array.isArray(res.providers) && res.providers.length > 0) {
        setOpenCodeModels(res.providers);
        const current = useWorkspaceStore.getState().opencodeSelectedModel;
        if (!current) {
          const picked = pickPreferredOpenCodeModel(res.providers);
          if (picked) {
            await setOpenCodeSelectedModel(picked);
          }
        }
      }
    } catch {
      // Non-fatal if OpenCode server is offline
    } finally {
      setRefreshingModels(false);
    }
  }, [setConnectionStatus, setOpenCodeModels, setOpenCodeSelectedModel]);

  useEffect(() => {
    if (provider === 'opencode' && opencodeModels.length === 0) {
      void refreshOpenCodeModels();
    }
  }, [provider, opencodeModels.length, connectionStatuses.opencode, refreshOpenCodeModels]);

  const groupedOpenCodeModels = useMemo(() => {
    const groups = new Map<string, OpenCodeProviderModel[]>();
    for (const m of opencodeModels) {
      const list = groups.get(m.providerID) ?? [];
      list.push(m);
      groups.set(m.providerID, list);
    }
    return Array.from(groups.entries());
  }, [opencodeModels]);

  const selectedModelValue = opencodeSelectedModel
    ? `${opencodeSelectedModel.providerID}/${opencodeSelectedModel.modelID}`
    : '';
  const selectedModelInList =
    !selectedModelValue ||
    opencodeModels.some((m) => `${m.providerID}/${m.modelID}` === selectedModelValue);

  const handleLaunchLocalOpenCode = async () => {
    setConnectingLocal(true);
    setErrorMsg(null);
    setConnectNote(null);
    setConnectionStatus('opencode', 'testing');
    try {
      const res = await apiClient.autostartOpenCode();
      if (res.ok) {
        setConnectionStatus('opencode', 'connected');
        if (Array.isArray(res.providers) && res.providers.length > 0) {
          setOpenCodeModels(res.providers);
          if (!useWorkspaceStore.getState().opencodeSelectedModel) {
            const picked = pickPreferredOpenCodeModel(res.providers);
            if (picked) {
              await setOpenCodeSelectedModel(picked);
            }
          }
        }
        setConnectNote(res.message);
      } else {
        setConnectionStatus('opencode', 'error');
        setErrorMsg(res.message || 'Failed to launch local OpenCode server.');
      }
    } catch (err) {
      setConnectionStatus('opencode', 'error');
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to connect to local OpenCode.');
    } finally {
      setConnectingLocal(false);
    }
  };

  const buildChartContext = (): ChartContextPayload => ({
    symbol,
    timeframe,
    lastBar: bars[bars.length - 1],
    recentBars: bars.slice(-24),
    activeIndicators: indicators.map((i) => ({
      name: i.name,
      params: i.params,
    })),
    selectedRange: aiRangeSelection,
    chartOverlay,
  });

  const maybeAutoTriggerForwardTest = async (userText: string, aiTriggered = false) => {
    if (!aiTriggered && !isForwardTestIntent(userText)) return false;
    if (loadedStrategy && !/\b(buy\s+when|sell\s+when|supertrend|ema|rsi|bollinger|macd)\b/i.test(userText)) {
      await startForwardTest(loadedStrategy, provider);
      return true;
    }
    const mp = await apiClient.generateMasterPrompt({
      description: userText,
      symbol,
      timeframe,
      provider,
      model: provider === 'opencode' ? (opencodeSelectedModel ?? undefined) : undefined,
      applyStrictFixes: true,
    });
    await startForwardTest(
      {
        spec: mp.draft.compiledSpec,
        masterPrompt: mp.draft.masterPrompt,
        loadedAt: new Date().toISOString(),
      },
      provider,
    );
    return true;
  };

  const runPrompt = async (
    textToSend: string,
    workflow: 'ta_brief' | 'indicator_explainer' | 'sql_copilot' | 'custom' = 'custom',
  ) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    if (trimmed.startsWith('/')) {
      setErrorMsg(null);
      const localRes = runLocalCopilotCommand(trimmed, {
        symbol,
        timeframe,
        bars,
        watchlist,
      });
      if (localRes) {
        appendAIMessage({
          id: `u-${Date.now().toString(36)}`,
          role: 'user',
          provider,
          text: trimmed,
          symbol,
          timeframe,
          timestamp: new Date().toISOString(),
        });
        if (localRes.chartActions.length > 0) {
          executeAIChartActions(localRes.chartActions);
        }
        appendAIMessage({
          id: `a-local-${Date.now().toString(36)}`,
          role: 'assistant',
          provider,
          text: localRes.text,
          symbol,
          timeframe,
          timestamp: new Date().toISOString(),
          modelLabel: 'Instant Hybrid (<50ms)',
          chartActions: localRes.chartActions,
          toolCalls: localRes.toolCalls,
        });
        setPrompt('');
        return;
      }
    }

    setLoading(true);
    setErrorMsg(null);

    const chartContext = buildChartContext();
    const contextualPrompt =
      loadedStrategy && (provider === 'opencode' || provider === 'gemini')
        ? `[Loaded Backtested Strategy: ${loadedStrategy.spec.name} (${loadedStrategy.spec.symbol} · ${loadedStrategy.spec.timeframe}, SL ${loadedStrategy.spec.risk.stopLossPct}%, TP ${loadedStrategy.spec.risk.takeProfitPct}%)]\n${trimmed}`
        : trimmed;

    appendAIMessage({
      id: `u-${Date.now().toString(36)}`,
      role: 'user',
      provider,
      text: trimmed,
      symbol,
      timeframe,
      timestamp: new Date().toISOString(),
    });

    try {
      if (provider === 'deepseek' || provider === 'byok') {
        const res = await apiClient.invokeAIProvider({
          provider,
          prompt: trimmed,
          chartContext,
          loadedStrategy,
        });
        if (!res.ok) {
          // If user asked to forward test in demo without API key configured yet, still launch demo forward test cleanly!
          if (res.code === 'MISSING_CREDENTIALS' && isForwardTestIntent(trimmed)) {
            await maybeAutoTriggerForwardTest(trimmed, true);
            appendAIMessage({
              id: `a-ft-${Date.now().toString(36)}`,
              role: 'assistant',
              provider,
              text: `Launched Live Demo Forward Test on ${symbol} (${timeframe}) using deterministic quant execution. (Tip: Add your ${provider === 'deepseek' ? 'DeepSeek' : 'BYOK'} API key in Connections for deep LLM reasoning.)`,
              symbol,
              timeframe,
              timestamp: new Date().toISOString(),
              modelLabel: 'Quant Forward Engine',
            });
            setPrompt('');
            return;
          }
          setConnectionStatus(provider, 'error');
          setErrorMsg(res.message || `${provider} invocation failed.`);
          return;
        }
        setConnectionStatus(provider, 'connected');
        const autoStarted = await maybeAutoTriggerForwardTest(trimmed, Boolean(res.startForwardTest));
        const actions = extractChartActions(res.text || '');
        if (actions.length > 0) executeAIChartActions(actions);
        appendAIMessage({
          id: `a-${Date.now().toString(36)}`,
          role: 'assistant',
          provider,
          text:
            (res.text || '(Empty response)') +
            (autoStarted ? '\n\n✅ Live Demo Forward Test is now streaming in the bottom drawer.' : ''),
          reasoningText: res.reasoningText,
          symbol,
          timeframe,
          timestamp: new Date().toISOString(),
          modelLabel: res.modelLabel,
          chartActions: actions,
        });
        setPrompt('');
      } else if (provider === 'opencode') {
        const res = await apiClient.invokeOpenCode({
          sessionId: ocSessionId,
          prompt: contextualPrompt,
          chartContext,
          model: opencodeSelectedModel ?? undefined,
        });
        if (!res.ok) {
          setConnectionStatus('opencode', 'error');
          setErrorMsg(res.message || 'OpenCode invocation failed.');
          return;
        }
        if (res.sessionId) setOcSessionId(res.sessionId);
        setConnectionStatus('opencode', 'connected');
        const autoStarted = await maybeAutoTriggerForwardTest(trimmed, false);
        appendAIMessage({
          id: `a-${Date.now().toString(36)}`,
          role: 'assistant',
          provider: 'opencode',
          text:
            (res.messageText || '(Empty response)') +
            (autoStarted ? '\n\n✅ Live Demo Forward Test is now streaming in the bottom drawer.' : ''),
          symbol,
          timeframe,
          timestamp: new Date().toISOString(),
          modelLabel: res.rawModel,
        });
        setPrompt('');
      } else {
        const res = await apiClient.invokeGemini({
          prompt: contextualPrompt,
          chartContext,
          previousInteractionId: gemInteractionId,
          workflow,
        });
        if (!res.ok) {
          setConnectionStatus('gemini', 'error');
          setErrorMsg(res.message || 'Gemini invocation failed.');
          return;
        }
        if (res.interactionId) setGemInteractionId(res.interactionId);
        setConnectionStatus('gemini', 'connected');
        const autoStarted = await maybeAutoTriggerForwardTest(trimmed, false);
        appendAIMessage({
          id: `a-${Date.now().toString(36)}`,
          role: 'assistant',
          provider: 'gemini',
          text:
            (res.text || '(Empty response)') +
            (autoStarted ? '\n\n✅ Live Demo Forward Test is now streaming in the bottom drawer.' : ''),
          symbol,
          timeframe,
          timestamp: new Date().toISOString(),
        });
        setPrompt('');
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'AI request failed.';
      setConnectionStatus(provider, 'error');
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSupportResistance = () => {
    const t0 = performance.now();
    if (bars.length < 7) {
      setErrorMsg('Load at least 7 bars to detect clustered fractal support & resistance levels.');
      return;
    }
    const zones = computeClusteredSupportResistance(bars, 2);
    const actions: AIChartAction[] = zones.map((z) => ({
      type: 'draw_hline',
      label: `${z.kind === 'resistance' ? 'Res' : 'Sup'} ${z.price} (${z.touches}x)`,
      payload: {
        price: z.price,
        color: z.kind === 'resistance' ? '#f23645' : '#089981',
        label: `${z.strength.toUpperCase()} ${z.kind === 'resistance' ? 'RES' : 'SUP'} ${z.price} (${z.touches}x)`,
      },
    }));

    executeAIChartActions(actions);
    const elapsed = Math.max(1, Math.round(performance.now() - t0));
    appendAIMessage({
      id: `a-sr-${Date.now().toString(36)}`,
      role: 'assistant',
      provider,
      text: `Plotted ${zones.length} ATR-clustered fractal Support/Resistance levels on ${symbol} (${timeframe}):\n${zones
        .map((z) => `• ${z.kind.toUpperCase()} @ ${z.price} (${z.touches} touches · ${z.strength})`)
        .join('\n')}`,
      symbol,
      timeframe,
      timestamp: new Date().toISOString(),
      modelLabel: 'Instant Hybrid (<50ms)',
      chartActions: actions,
      toolCalls: [
        {
          tool: 'tvapi_draw_levels',
          label: `Clustered S/R (${zones.length} levels)`,
          durationMs: elapsed,
          status: 'ok',
        },
      ],
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runPrompt(prompt, 'custom');
  };

  const status = connectionStatuses[provider] ?? 'disconnected';

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--tv-border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 font-semibold text-[13px] text-[var(--tv-text-primary)]">
          <BrainCircuit className="w-4 h-4 text-[#38bdf8]" />
          <span>AI Strategy &amp; Forward Copilot</span>
        </div>
        <div className="flex items-center gap-1">
          {aiMessages.length > 0 && (
            <button
              type="button"
              aria-label="Clear AI messages"
              onClick={clearAIMessages}
              className="p-1 rounded text-[var(--tv-text-muted)] hover:text-[#f23645] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Configure AI connection"
            onClick={() => openConnectionsModal(provider)}
            className="p-1 rounded text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] cursor-pointer"
          >
            <Plug className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Provider Selector + Quick Workflow Chips */}
      <div className="p-2.5 border-b border-[var(--tv-border)] flex flex-col gap-2 shrink-0 text-[12px]">
        <div className="flex items-center gap-2">
          <select
            data-testid="ai-provider-select"
            aria-label="AI Provider"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as CopilotProvider);
              setErrorMsg(null);
            }}
            className="flex-1 h-[28px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
          >
            <option value="deepseek">DeepSeek (V3 / R1)</option>
            <option value="opencode">opencode</option>
            <option value="byok">Bring Your Own API (BYOK)</option>
            <option value="gemini">gemini</option>
          </select>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
              status === 'connected'
                ? 'bg-[#089981]/15 text-[#089981]'
                : status === 'error'
                  ? 'bg-[#f23645]/15 text-[#f23645]'
                  : 'bg-[var(--tv-bg-elevated)] text-[var(--tv-text-muted)]'
            }`}
          >
            {status}
          </span>
        </div>

        {provider === 'opencode' && (
          <div className="flex items-center gap-1.5">
            <select
              data-testid="opencode-model-select"
              aria-label="OpenCode Model"
              value={selectedModelValue}
              onChange={(e) => {
                const parsed = parseModelValue(e.target.value);
                void setOpenCodeSelectedModel(parsed);
                setErrorMsg(null);
              }}
              className="flex-1 min-w-0 h-[26px] px-2 rounded-[4px] bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)] truncate"
            >
              {opencodeModels.length === 0 && <option value="">Default (Auto)</option>}
              {!selectedModelInList && opencodeSelectedModel && (
                <option value={selectedModelValue}>
                  {opencodeSelectedModel.providerID} / {opencodeSelectedModel.modelID}
                </option>
              )}
              {groupedOpenCodeModels.map(([prov, models]) => (
                <optgroup key={prov} label={prov}>
                  {models.map((m) => (
                    <option
                      key={`${m.providerID}/${m.modelID}`}
                      value={`${m.providerID}/${m.modelID}`}
                    >
                      {m.name || m.modelID}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              aria-label="Refresh OpenCode models"
              disabled={refreshingModels}
              onClick={() => void refreshOpenCodeModels()}
              className="w-[26px] h-[26px] shrink-0 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)] flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshingModels ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        {/* Pinned Loaded Backtest Strategy Card -> Direct Forward Test */}
        {loadedStrategy && (
          <div
            data-testid="ai-loaded-strategy-card"
            className="p-2 rounded border border-[var(--tv-accent)]/40 bg-[var(--tv-accent)]/10 flex flex-col gap-1.5 text-[11px]"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-[var(--tv-text-primary)] truncate">
                📌 {loadedStrategy.spec.name}
              </span>
              {loadedStrategy.reportSummary && (
                <span className="text-[10px] font-mono text-[#089981] shrink-0">
                  {loadedStrategy.reportSummary.netProfitPercent >= 0 ? '+' : ''}
                  {loadedStrategy.reportSummary.netProfitPercent.toFixed(1)}% · PF{' '}
                  {loadedStrategy.reportSummary.profitFactor.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="ai-start-forward-test-btn"
                onClick={() => void startForwardTest(loadedStrategy, provider)}
                className="flex-1 h-[24px] px-2 rounded bg-[#089981] hover:bg-[#089981]/90 text-white text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                <span>{forwardTestActive ? 'Forward Demo Running' : 'Forward Test in Demo'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void runPrompt(
                    `Critique my loaded backtested strategy "${loadedStrategy.spec.name}" on ${symbol} (${timeframe}) and suggest institutional improvements before forward testing.`,
                    'custom',
                  )
                }
                className="h-[24px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[10px] text-[var(--tv-text-primary)] cursor-pointer"
              >
                Critique
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() =>
              void runPrompt(
                `Provide an institutional market structure & liquidity brief for ${symbol} (${timeframe}) including key swing levels and trade bias.`,
                'ta_brief',
              )
            }
            className="px-2 py-1 rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-secondary)] cursor-pointer"
          >
            Structure Brief
          </button>
          <button
            type="button"
            data-testid="ai-auto-sr-btn"
            onClick={handleAutoSupportResistance}
            className="px-2 py-1 rounded bg-[#089981]/12 hover:bg-[#089981]/20 border border-[#089981]/35 text-[11px] text-[#089981] font-medium flex items-center gap-1 cursor-pointer"
          >
            <Layers className="w-3 h-3" />
            <span>Auto S/R</span>
          </button>
          <button
            type="button"
            data-testid="ai-toggle-smc-btn"
            onClick={() => void runPrompt('/smc')}
            className={`px-2 py-1 rounded border text-[11px] font-medium flex items-center gap-1 cursor-pointer ${
              showSmcOverlay
                ? 'bg-[#a855f7]/20 border-[#a855f7]/50 text-[#c084fc]'
                : 'bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border-[var(--tv-border)] text-[var(--tv-text-secondary)]'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>SMC Zones</span>
          </button>
          <button
            type="button"
            data-testid="ai-toggle-vp-btn"
            onClick={() => void runPrompt('/vp')}
            className={`px-2 py-1 rounded border text-[11px] font-medium flex items-center gap-1 cursor-pointer ${
              showVolumeProfile
                ? 'bg-[#f59e0b]/20 border-[#f59e0b]/50 text-[#f59e0b]'
                : 'bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border-[var(--tv-border)] text-[var(--tv-text-secondary)]'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            <span>Vol Profile</span>
          </button>
          <button
            type="button"
            data-testid="ai-auto-fib-btn"
            onClick={() => void runPrompt('/fib')}
            className="px-2 py-1 rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[11px] text-[#f59e0b] font-medium flex items-center gap-1 cursor-pointer"
          >
            <Zap className="w-3 h-3" />
            <span>Auto Fib</span>
          </button>
          <button
            type="button"
            data-testid="ai-market-scan-btn"
            onClick={() => void runPrompt('/scan')}
            className="px-2 py-1 rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-secondary)] font-medium flex items-center gap-1 cursor-pointer"
          >
            <Radar className="w-3 h-3 text-[var(--tv-accent)]" />
            <span>Market Scan</span>
          </button>
          <button
            type="button"
            data-testid="ai-open-strategy-btn"
            onClick={() => setActiveBottomTab('backtester')}
            className="px-2 py-1 rounded bg-[var(--tv-accent)]/12 hover:bg-[var(--tv-accent)]/20 border border-[var(--tv-accent)]/35 text-[11px] text-[var(--tv-accent)] font-medium flex items-center gap-1 cursor-pointer"
          >
            <FlaskConical className="w-3 h-3" />
            <span>Backtester</span>
          </button>
          <button
            type="button"
            data-testid="ai-open-autotrade-btn"
            onClick={() => setActiveBottomTab('forward_test')}
            className="px-2 py-1 rounded bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-primary)] font-medium flex items-center gap-1 cursor-pointer"
          >
            <Bot className="w-3 h-3 text-[#089981]" />
            <span>Forward Demo</span>
          </button>
        </div>

        {aiRangeSelection && (
          <div className="px-2 py-1 rounded bg-[var(--tv-accent)]/12 border border-[var(--tv-accent)]/30 flex items-center justify-between text-[11px] text-[var(--tv-accent)]">
            <span>
              AI Range: {aiRangeSelection.symbol} ({aiRangeSelection.barCount} bars)
            </span>
            <button
              type="button"
              aria-label="Clear AI range selection"
              onClick={() => setAIRangeSelection(null)}
              className="hover:text-[#f23645] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Connect Card when selected provider is disconnected */}
      {provider === 'opencode' && status !== 'connected' && (
        <div className="mx-2.5 mt-2 p-2.5 rounded-[6px] border border-[var(--tv-accent)]/35 bg-[var(--tv-accent)]/10 flex flex-col gap-2 shrink-0 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--tv-text-primary)]">Connect OpenCode</span>
            <span className="text-[10px] text-[var(--tv-text-muted)]">Local AI CLI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="ai-opencode-autostart-btn"
              disabled={connectingLocal}
              onClick={() => void handleLaunchLocalOpenCode()}
              className="flex-1 h-[26px] px-2 rounded bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] disabled:opacity-50 text-white text-[11px] font-medium cursor-pointer"
            >
              {connectingLocal ? 'Starting...' : 'Launch & Connect Local OpenCode'}
            </button>
            <button
              type="button"
              onClick={() => openConnectionsModal('opencode')}
              className="h-[26px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] text-[11px] cursor-pointer"
            >
              Configure
            </button>
          </div>
        </div>
      )}

      {(provider === 'deepseek' || provider === 'byok') && status !== 'connected' && (
        <div className="mx-2.5 mt-2 p-2.5 rounded-[6px] border border-[#38bdf8]/35 bg-[#38bdf8]/10 flex items-center justify-between gap-2 shrink-0 text-[11px]">
          <span className="text-[var(--tv-text-secondary)]">
            {provider === 'deepseek'
              ? 'Connect your DeepSeek API key (V3 / R1) for live strategy reasoning.'
              : 'Connect OpenRouter, OpenAI, Groq, or local Ollama via BYOK.'}
          </span>
          <button
            type="button"
            onClick={() => openConnectionsModal(provider)}
            className="h-[25px] px-2.5 rounded bg-[var(--tv-accent)] text-white text-[10px] font-semibold shrink-0 cursor-pointer"
          >
            Add API Key
          </button>
        </div>
      )}

      {connectNote && (
        <div className="mx-2.5 mt-2 px-2.5 py-1.5 rounded-[4px] border border-[#089981]/40 bg-[#089981]/10 text-[#089981] text-[11px] flex items-center justify-between gap-2 shrink-0">
          <span className="truncate">{connectNote}</span>
          <button
            type="button"
            aria-label="Dismiss OpenCode status note"
            onClick={() => setConnectNote(null)}
            className="shrink-0 hover:text-[var(--tv-text-primary)] cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          data-testid="ai-error-banner"
          className="mx-2.5 mt-2 p-2.5 rounded-[4px] border border-[#f23645]/45 bg-[#f23645]/10 text-[#f23645] text-[11px] flex flex-col gap-1.5 shrink-0"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => openConnectionsModal(provider)}
            className="self-start px-2 py-1 rounded bg-[#f23645] text-white text-[10px] font-semibold cursor-pointer"
          >
            Configure {provider.toUpperCase()}
          </button>
        </div>
      )}

      {/* Message History */}
      <div
        data-testid="ai-response-list"
        className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2 text-[12px]"
      >
        {aiMessages.length === 0 ? (
          <div className="py-5 px-2 text-center text-[11px] text-[var(--tv-text-muted)] leading-relaxed">
            Tell <strong>DeepSeek</strong>, <strong>OpenCode</strong>, or your <strong>BYOK API</strong> to analyze {symbol} ({timeframe}), synthesize a strategy, or execute your backtested strategy live in the <strong>Forward Demo</strong>.
          </div>
        ) : (
          aiMessages.map((m) => {
            const actionCandidates =
              m.role === 'assistant'
                ? m.chartActions && m.chartActions.length > 0
                  ? m.chartActions
                  : extractChartActions(m.text)
                : [];
            return (
              <div
                key={m.id}
                className={`p-2.5 rounded-[6px] border ${
                  m.role === 'user'
                    ? 'bg-[var(--tv-bg-elevated)] border-[var(--tv-border)] ml-4'
                    : 'bg-[var(--tv-bg-panel)] border-[var(--tv-accent)]/30 mr-2'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--tv-text-muted)] mb-1">
                  <span className="font-semibold uppercase truncate">
                    {m.role === 'user'
                      ? 'You'
                      : m.modelLabel
                        ? `${m.provider} · ${m.modelLabel}`
                        : m.provider}
                  </span>
                  <span className="shrink-0">
                    {m.symbol} · {m.timeframe}
                  </span>
                </div>
                {m.reasoningText && (
                  <details className="mb-1.5 rounded bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] px-2 py-1 text-[10.5px] text-[var(--tv-text-secondary)]">
                    <summary className="cursor-pointer font-semibold text-[#38bdf8]">
                      DeepSeek R1 Reasoning Trace
                    </summary>
                    <div className="mt-1 whitespace-pre-wrap">{m.reasoningText}</div>
                  </details>
                )}
                <div className="whitespace-pre-wrap text-[var(--tv-text-primary)] leading-relaxed break-words">
                  {m.text}
                </div>
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.toolCalls.map((tc, idx) => (
                      <span
                        key={`${tc.tool}-${idx}`}
                        data-testid="ai-tool-call-badge"
                        className="px-1.5 py-0.5 rounded bg-[#089981]/15 border border-[#089981]/35 text-[#089981] font-mono text-[10px]"
                      >
                        ⚡ {tc.label} · {tc.durationMs}ms
                      </span>
                    ))}
                  </div>
                )}
                {actionCandidates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => executeAIChartActions(actionCandidates)}
                      className="px-2 py-1 rounded bg-[var(--tv-accent)]/15 hover:bg-[var(--tv-accent)]/25 border border-[var(--tv-accent)]/35 text-[11px] text-[var(--tv-accent)] flex items-center gap-1 cursor-pointer"
                    >
                      <Wand2 className="w-3 h-3" />
                      Apply Chart Actions ({actionCandidates.length})
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Prompt Input Footer */}
      <form
        onSubmit={handleSubmit}
        className="p-2.5 border-t border-[var(--tv-border)] flex flex-col gap-1.5 shrink-0"
      >
        <textarea
          data-testid="ai-prompt-input"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void runPrompt(prompt, 'custom');
            }
          }}
          placeholder={`Tell ${provider.toUpperCase()} to analyze ${symbol}, refine your strategy, or "forward test in demo"...`}
          className="w-full p-2 rounded-[4px] bg-[var(--tv-bg-elevated)] border border-[var(--tv-border)] text-[12px] text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-muted)] resize-none focus:outline-none focus:border-[var(--tv-accent)]"
        />
        <button
          type="submit"
          data-testid="ai-send-btn"
          disabled={loading || !prompt.trim()}
          className="h-[30px] px-3 rounded-[4px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] disabled:opacity-50 text-white text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <Send className="w-3.5 h-3.5" />
          <span>{loading ? 'Thinking...' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
}
