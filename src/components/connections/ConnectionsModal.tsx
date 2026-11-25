import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  KeyRound,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  ConnectionsTab,
  GeminiAuthMode,
  GeminiModel,
  MaskedConnectionsResponse,
  OpenCodeAuthMode,
  OpenCodeProviderModel,
} from '../../../shared/types';
import { apiClient, ApiError } from '../../lib/apiClient';
import { useWorkspaceStore } from '../../state/workspaceStore';

const DEEPSEEK_MODELS: readonly { id: string; label: string }[] = [
  { id: 'deepseek-chat', label: 'deepseek-chat (DeepSeek-V3 · Fast Quant & Tooling)' },
  { id: 'deepseek-reasoner', label: 'deepseek-reasoner (DeepSeek-R1 · Deep Chain-of-Thought)' },
];

const BYOK_PRESETS: readonly {
  name: string;
  baseUrl: string;
  defaultModel: string;
}[] = [
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
  },
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  {
    name: 'Groq (Ultra-Fast)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
  },
  {
    name: 'Local Ollama / LM Studio',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'deepseek-r1:14b',
  },
];

const GEMINI_MODELS: readonly { id: GeminiModel; label: string }[] = [
  { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Default · 1M)' },
  { id: 'gemini-4-argon', label: 'gemini-4-argon (Reasoning & Code)' },
  { id: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (Fast Low-Cost)' },
  { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (Ultra-Fast)' },
];

export function ConnectionsModal() {
  const connectionsTab = useWorkspaceStore((s) => s.connectionsTab);
  const connectionStatuses = useWorkspaceStore((s) => s.connectionStatuses);
  const storeOpenCodeModels = useWorkspaceStore((s) => s.opencodeModels);
  const setConnectionsTab = useWorkspaceStore((s) => s.setConnectionsTab);
  const closeConnectionsModal = useWorkspaceStore((s) => s.closeConnectionsModal);
  const setConnectionStatus = useWorkspaceStore((s) => s.setConnectionStatus);
  const setOpenCodeModels = useWorkspaceStore((s) => s.setOpenCodeModels);
  const setOpenCodeSelectedModel = useWorkspaceStore((s) => s.setOpenCodeSelectedModel);

  const [masked, setMasked] = useState<MaskedConnectionsResponse | null>(null);

  // OpenCode form
  const [ocEnabled, setOcEnabled] = useState(true);
  const [ocUrl, setOcUrl] = useState('http://127.0.0.1:4096');
  const [ocAuthMode, setOcAuthMode] = useState<OpenCodeAuthMode>('none');
  const [ocUsername, setOcUsername] = useState('opencode');
  const [ocSecret, setOcSecret] = useState('');
  const [ocSecretDirty, setOcSecretDirty] = useState(false);
  const [ocProviderId, setOcProviderId] = useState('');
  const [ocModelId, setOcModelId] = useState('');
  const [ocDiscoveredModels, setOcDiscoveredModels] =
    useState<OpenCodeProviderModel[]>(storeOpenCodeModels);
  const [ocMsg, setOcMsg] = useState<string | null>(null);
  const [ocBusy, setOcBusy] = useState(false);
  const [ocDirty, setOcDirty] = useState(false);
  const ocUserTouchedRef = useRef(false);

  // Gemini form
  const [gemEnabled, setGemEnabled] = useState(true);
  const [gemAuthMode, setGemAuthMode] = useState<GeminiAuthMode>('apiKey');
  const [gemApiKey, setGemApiKey] = useState('');
  const [gemKeyDirty, setGemKeyDirty] = useState(false);
  const [gemBaseUrl, setGemBaseUrl] = useState('');
  const [gemModel, setGemModel] = useState<GeminiModel>('gemini-3.8-flash');
  const [gemVertexProject, setGemVertexProject] = useState('');
  const [gemVertexLocation, setGemVertexLocation] = useState('us-central1');
  const [gemMsg, setGemMsg] = useState<string | null>(null);
  const [gemBusy, setGemBusy] = useState(false);
  const [gemDirty, setGemDirty] = useState(false);

  // DeepSeek form
  const [dsBaseUrl, setDsBaseUrl] = useState('https://api.deepseek.com');
  const [dsModel, setDsModel] = useState('deepseek-chat');
  const [dsApiKey, setDsApiKey] = useState('');
  const [dsKeyDirty, setDsKeyDirty] = useState(false);
  const [dsDirty, setDsDirty] = useState(false);
  const [dsBusy, setDsBusy] = useState(false);
  const [dsMsg, setDsMsg] = useState<string | null>(null);

  // Bring Your Own API (BYOK) form
  const [byokProviderName, setByokProviderName] = useState('OpenRouter');
  const [byokBaseUrl, setByokBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [byokModel, setByokModel] = useState('deepseek/deepseek-chat');
  const [byokApiKey, setByokApiKey] = useState('');
  const [byokKeyDirty, setByokKeyDirty] = useState(false);
  const [byokDirty, setByokDirty] = useState(false);
  const [byokBusy, setByokBusy] = useState(false);
  const [byokMsg, setByokMsg] = useState<string | null>(null);

  const applyMaskedResponse = (res: MaskedConnectionsResponse) => {
    setMasked(res);
    if (res.deepseek) {
      setDsBaseUrl(res.deepseek.baseUrl || 'https://api.deepseek.com');
      setDsModel(res.deepseek.model || 'deepseek-chat');
      setDsDirty(false);
    }
    if (res.byok) {
      setByokProviderName(res.byok.providerName || 'OpenRouter');
      setByokBaseUrl(res.byok.baseUrl || 'https://openrouter.ai/api/v1');
      setByokModel(res.byok.model || 'deepseek/deepseek-chat');
      setByokDirty(false);
    }
    setOcEnabled(res.opencode.enabled);
    setOcUrl(res.opencode.serverUrl || 'http://127.0.0.1:4096');
    setOcAuthMode(res.opencode.authMode);
    setOcUsername(res.opencode.username || 'opencode');
    setOcProviderId(res.opencode.providerId || '');
    setOcModelId(res.opencode.modelId || '');
    setOcDirty(false);

    setGemEnabled(res.gemini.enabled);
    setGemAuthMode(res.gemini.authMode);
    setGemBaseUrl(res.gemini.baseUrl || '');
    setGemModel(res.gemini.model);
    setGemVertexProject(res.gemini.vertexProject || '');
    setGemVertexLocation(res.gemini.vertexLocation || 'us-central1');
    setGemDirty(false);
  };

  useEffect(() => {
    let active = true;
    apiClient
      .getConnections()
      .then((res) => {
        if (!active || ocUserTouchedRef.current) return;
        applyMaskedResponse(res);
      })
      .catch(() => {});

    apiClient
      .getOpenCodeStatus()
      .then((ocStatus) => {
        if (!active || ocUserTouchedRef.current) return;
        if (ocStatus?.running && Array.isArray(ocStatus.providers) && ocStatus.providers.length > 0) {
          setOcDiscoveredModels(ocStatus.providers);
          setOpenCodeModels(ocStatus.providers);
          if (useWorkspaceStore.getState().connectionStatuses.opencode === 'disconnected') {
            setConnectionStatus('opencode', 'connected');
          }
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [setConnectionStatus, setOpenCodeModels]);

  const saveOpenCode = async () => {
    ocUserTouchedRef.current = true;
    setOcBusy(true);
    setOcMsg(null);
    try {
      const payload: Parameters<typeof apiClient.saveConnections>[0] = {
        opencode: {
          enabled: ocEnabled,
          serverUrl: ocUrl.trim() || 'http://127.0.0.1:4096',
          authMode: ocAuthMode,
          username: ocUsername.trim() || 'opencode',
          providerId: ocProviderId.trim(),
          modelId: ocModelId.trim(),
          ...(ocSecretDirty ? { secret: ocSecret } : {}),
        },
      };
      const updated = await apiClient.saveConnections(payload);
      setOcSecret('');
      setOcSecretDirty(false);
      applyMaskedResponse(updated);
      useWorkspaceStore.setState({
        opencodeSelectedModel:
          updated.opencode.providerId && updated.opencode.modelId
            ? {
                providerID: updated.opencode.providerId,
                modelID: updated.opencode.modelId,
              }
            : null,
      });
      setOcMsg('OpenCode settings saved securely on server.');
      return true;
    } catch (err) {
      setOcMsg(err instanceof Error ? err.message : 'Failed to save OpenCode settings.');
      setConnectionStatus('opencode', 'error');
      return false;
    } finally {
      setOcBusy(false);
    }
  };

  const testOpenCode = async () => {
    ocUserTouchedRef.current = true;
    if (ocDirty || ocSecretDirty) {
      const saved = await saveOpenCode();
      if (!saved) return;
    }
    setOcBusy(true);
    setOcMsg(null);
    setConnectionStatus('opencode', 'testing');
    try {
      const res = await apiClient.testOpenCode();
      if (res.ok) {
        setConnectionStatus('opencode', 'connected');
        const models = res.providers ?? [];
        setOcDiscoveredModels(models);
        setOpenCodeModels(models);
        if (!ocProviderId && !ocModelId && models.length > 0) {
          const preferred =
            models.find((m) => m.providerID === 'opencode' && m.modelID === 'big-pickle') ??
            models.find((m) => m.providerID === 'opencode') ??
            models[0];
          setOcProviderId(preferred.providerID);
          setOcModelId(preferred.modelID);
          await setOpenCodeSelectedModel({
            providerID: preferred.providerID,
            modelID: preferred.modelID,
          });
        }
        setOcMsg(res.message);
      } else {
        setConnectionStatus('opencode', 'error');
        setOcMsg(res.message);
      }
    } catch (err) {
      setConnectionStatus('opencode', 'error');
      setOcMsg(
        err instanceof ApiError
          ? err.message
          : 'Failed to reach OpenCode test endpoint.',
      );
    } finally {
      setOcBusy(false);
    }
  };

  const launchOpenCodeLocal = async () => {
    ocUserTouchedRef.current = true;
    setOcBusy(true);
    setOcMsg('Launching local OpenCode server...');
    setConnectionStatus('opencode', 'testing');
    try {
      const res = await apiClient.autostartOpenCode();
      if (res.ok) {
        setConnectionStatus('opencode', 'connected');
        const models = res.providers ?? [];
        setOcDiscoveredModels(models);
        setOpenCodeModels(models);
        const freshCfg = await apiClient.getConnections().catch(() => null);
        if (freshCfg) {
          applyMaskedResponse(freshCfg);
          if (freshCfg.opencode.providerId && freshCfg.opencode.modelId) {
            useWorkspaceStore.setState({
              opencodeSelectedModel: {
                providerID: freshCfg.opencode.providerId,
                modelID: freshCfg.opencode.modelId,
              },
            });
          }
        }
        const modelCount = models.length;
        setOcMsg(
          `${res.message}${modelCount > 0 ? ` · ${modelCount} model(s) discovered.` : ''}`,
        );
      } else {
        setConnectionStatus('opencode', 'error');
        setOcMsg(res.message);
      }
    } catch (err) {
      setConnectionStatus('opencode', 'error');
      setOcMsg(
        err instanceof ApiError
          ? err.message
          : 'Failed to start local OpenCode server.',
      );
    } finally {
      setOcBusy(false);
    }
  };

  const saveGemini = async () => {
    setGemBusy(true);
    setGemMsg(null);
    try {
      const payload: Parameters<typeof apiClient.saveConnections>[0] = {
        gemini: {
          enabled: gemEnabled,
          authMode: gemAuthMode,
          baseUrl: gemBaseUrl.trim(),
          model: gemModel,
          vertexProject: gemVertexProject.trim(),
          vertexLocation: gemVertexLocation.trim() || 'us-central1',
          ...(gemKeyDirty ? { apiKey: gemApiKey } : {}),
        },
      };
      const updated = await apiClient.saveConnections(payload);
      setGemApiKey('');
      setGemKeyDirty(false);
      applyMaskedResponse(updated);
      setGemMsg('Gemini settings saved securely on server.');
      return true;
    } catch (err) {
      setGemMsg(err instanceof Error ? err.message : 'Failed to save Gemini settings.');
      setConnectionStatus('gemini', 'error');
      return false;
    } finally {
      setGemBusy(false);
    }
  };

  const testGemini = async () => {
    if (gemDirty || gemKeyDirty) {
      const saved = await saveGemini();
      if (!saved) return;
    }
    setGemBusy(true);
    setGemMsg(null);
    setConnectionStatus('gemini', 'testing');
    try {
      const res = await apiClient.testGemini();
      if (res.ok) {
        setConnectionStatus('gemini', 'connected');
        setGemMsg(res.message);
      } else {
        setConnectionStatus('gemini', 'error');
        setGemMsg(res.message);
      }
    } catch (err) {
      setConnectionStatus('gemini', 'error');
      setGemMsg(
        err instanceof ApiError ? err.message : 'Failed to verify Gemini connection.',
      );
    } finally {
      setGemBusy(false);
    }
  };

  const saveDeepSeek = async () => {
    setDsBusy(true);
    setDsMsg(null);
    try {
      const updated = await apiClient.saveConnections({
        deepseek: {
          enabled: true,
          baseUrl: dsBaseUrl.trim() || 'https://api.deepseek.com',
          model: dsModel.trim() || 'deepseek-chat',
          ...(dsKeyDirty ? { apiKey: dsApiKey } : {}),
        },
      });
      setDsApiKey('');
      setDsKeyDirty(false);
      applyMaskedResponse(updated);
      setDsMsg('DeepSeek settings saved securely on server.');
      return true;
    } catch (err) {
      setDsMsg(err instanceof Error ? err.message : 'Failed to save DeepSeek settings.');
      setConnectionStatus('deepseek', 'error');
      return false;
    } finally {
      setDsBusy(false);
    }
  };

  const testDeepSeek = async () => {
    if (dsDirty || dsKeyDirty) {
      const saved = await saveDeepSeek();
      if (!saved) return;
    }
    setDsBusy(true);
    setDsMsg(null);
    setConnectionStatus('deepseek', 'testing');
    try {
      const res = await apiClient.testAIProvider('deepseek');
      setConnectionStatus('deepseek', res.ok ? 'connected' : 'error');
      setDsMsg(res.message);
    } catch (err) {
      setConnectionStatus('deepseek', 'error');
      setDsMsg(err instanceof ApiError ? err.message : 'DeepSeek connection test failed.');
    } finally {
      setDsBusy(false);
    }
  };

  const saveByok = async () => {
    setByokBusy(true);
    setByokMsg(null);
    try {
      const updated = await apiClient.saveConnections({
        byok: {
          enabled: true,
          providerName: byokProviderName.trim() || 'Custom API',
          baseUrl: byokBaseUrl.trim() || 'https://openrouter.ai/api/v1',
          model: byokModel.trim() || 'deepseek/deepseek-chat',
          ...(byokKeyDirty ? { apiKey: byokApiKey } : {}),
        },
      });
      setByokApiKey('');
      setByokKeyDirty(false);
      applyMaskedResponse(updated);
      setByokMsg('Bring-Your-Own-API settings saved securely on server.');
      return true;
    } catch (err) {
      setByokMsg(err instanceof Error ? err.message : 'Failed to save BYOK settings.');
      setConnectionStatus('byok', 'error');
      return false;
    } finally {
      setByokBusy(false);
    }
  };

  const testByok = async () => {
    if (byokDirty || byokKeyDirty) {
      const saved = await saveByok();
      if (!saved) return;
    }
    setByokBusy(true);
    setByokMsg(null);
    setConnectionStatus('byok', 'testing');
    try {
      const res = await apiClient.testAIProvider('byok');
      setConnectionStatus('byok', res.ok ? 'connected' : 'error');
      setByokMsg(res.message);
    } catch (err) {
      setConnectionStatus('byok', 'error');
      setByokMsg(err instanceof ApiError ? err.message : 'BYOK connection test failed.');
    } finally {
      setByokBusy(false);
    }
  };

  const renderBadge = (status: string, testId?: string) => {
    const isOk = status === 'connected' || status === 'sandbox';
    const isErr = status === 'error';
    return (
      <span
        data-testid={testId}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
          isOk
            ? 'border-[#089981]/50 bg-[#089981]/15 text-[#089981]'
            : isErr
              ? 'border-[#f23645]/50 bg-[#f23645]/15 text-[#f23645]'
              : 'border-[var(--tv-border)] bg-[var(--tv-bg-panel)] text-[var(--tv-text-muted)]'
        }`}
      >
        {isOk ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : isErr ? (
          <AlertCircle className="w-3 h-3" />
        ) : null}
        <span className="capitalize">{status}</span>
      </span>
    );
  };

  const tabs: ReadonlyArray<{
    id: ConnectionsTab;
    label: string;
    testId: string;
    icon: typeof Cpu;
  }> = [
    { id: 'deepseek', label: 'DeepSeek (V3 / R1)', testId: 'conn-tab-deepseek', icon: BrainCircuit },
    { id: 'opencode', label: 'OpenCode', testId: 'conn-tab-opencode', icon: Cpu },
    { id: 'byok', label: 'Bring Your Own API', testId: 'conn-tab-byok', icon: KeyRound },
    { id: 'gemini', label: 'Gemini API', testId: 'conn-tab-gemini', icon: Sparkles },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
      onClick={closeConnectionsModal}
    >
      <div
        data-testid="connections-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[640px] rounded-[8px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--tv-border)] flex items-center justify-between">
          <div>
            <div className="font-semibold text-[15px] text-[var(--tv-text-primary)]">
              TradingView Ultra AI &amp; BYOK Connections
            </div>
            <div className="text-[11px] text-[var(--tv-text-muted)]">
              Connect DeepSeek V3/R1, OpenCode CLI, or Bring Your Own API key for strategy synthesis &amp; live demo forward testing.
            </div>
          </div>
          <button
            type="button"
            aria-label="Close connections modal"
            onClick={closeConnectionsModal}
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--tv-text-muted)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="px-4 pt-2 border-b border-[var(--tv-border)] flex items-center gap-2 bg-[var(--tv-bg-panel)]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = connectionsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={tab.testId}
                onClick={() => setConnectionsTab(tab.id)}
                className={`px-3 py-2 text-[12px] font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-[var(--tv-accent)] text-[var(--tv-text-primary)]'
                    : 'border-transparent text-[var(--tv-text-muted)] hover:text-[var(--tv-text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 text-[13px]">
          {connectionsTab === 'opencode' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--tv-text-primary)]">
                  OpenCode Headless Server
                </span>
                {renderBadge(connectionStatuses.opencode, 'opencode-status-badge')}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--tv-text-muted)]">Server URL</span>
                <input
                  type="text"
                  data-testid="opencode-url-input"
                  value={ocUrl}
                  onChange={(e) => {
                    ocUserTouchedRef.current = true;
                    setOcUrl(e.target.value);
                    setOcDirty(true);
                  }}
                  placeholder="http://127.0.0.1:4096"
                  className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--tv-text-muted)]">Auth Mode</span>
                  <select
                    data-testid="opencode-auth-mode"
                    value={ocAuthMode}
                    onChange={(e) => {
                      ocUserTouchedRef.current = true;
                      setOcAuthMode(e.target.value as OpenCodeAuthMode);
                      setOcDirty(true);
                    }}
                    className="h-[32px] px-2 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                  >
                    <option value="none">none</option>
                    <option value="basic">basic</option>
                    <option value="bearer">bearer</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--tv-text-muted)]">
                    Username (for Basic Auth)
                  </span>
                  <input
                    type="text"
                    value={ocUsername}
                    onChange={(e) => {
                      setOcUsername(e.target.value);
                      setOcDirty(true);
                    }}
                    placeholder="opencode"
                    className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] text-[var(--tv-text-muted)]">
                  <span>Password / Bearer Token</span>
                  {masked?.opencode.hasSecret && (
                    <span className="flex items-center gap-2 text-[#089981]">
                      <span>Configured ({masked.opencode.secretPreview})</span>
                      <button
                        type="button"
                        onClick={async () => {
                          setOcBusy(true);
                          try {
                            const updated = await apiClient.saveConnections({
                              opencode: { secret: '' },
                            });
                            setOcSecret('');
                            setOcSecretDirty(false);
                            applyMaskedResponse(updated);
                            setConnectionStatus('opencode', 'disconnected');
                            setOcMsg('Stored OpenCode secret cleared.');
                          } finally {
                            setOcBusy(false);
                          }
                        }}
                        className="text-[10px] text-[#f23645] hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  data-testid="opencode-secret-input"
                  value={ocSecret}
                  onChange={(e) => {
                    ocUserTouchedRef.current = true;
                    setOcSecret(e.target.value);
                    setOcSecretDirty(true);
                  }}
                  placeholder={
                    masked?.opencode.hasSecret
                      ? 'Leave blank to keep existing secret'
                      : 'Enter OPENCODE_SERVER_PASSWORD or Bearer token'
                  }
                  className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                />
              </label>

              {ocDiscoveredModels.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--tv-text-muted)]">
                    Discovered Provider / Model
                  </span>
                  <select
                    data-testid="connections-opencode-model-select"
                    value={ocProviderId && ocModelId ? `${ocProviderId}/${ocModelId}` : ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const slashIdx = raw.indexOf('/');
                      const p = slashIdx > 0 ? raw.slice(0, slashIdx) : '';
                      const m = slashIdx > 0 ? raw.slice(slashIdx + 1) : '';
                      setOcProviderId(p);
                      setOcModelId(m);
                      setOcDirty(true);
                    }}
                    className="h-[32px] px-2 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                  >
                    <option value="">Server Default</option>
                    {ocDiscoveredModels.map((item) => (
                      <option
                        key={`${item.providerID}/${item.modelID}`}
                        value={`${item.providerID}/${item.modelID}`}
                      >
                        {item.providerID} / {item.name || item.modelID}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="p-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-muted)]">
                Tip: Click <strong className="text-[var(--tv-text-primary)]">Launch &amp; Connect Local</strong> below or run{' '}
                <code className="text-[var(--tv-text-primary)]">
                  cmd /c opencode serve --port 4096
                </code>
              </div>

              {ocMsg && (
                <div
                  className={`px-3 py-2 rounded-[4px] border text-[12px] ${
                    connectionStatuses.opencode === 'error'
                      ? 'border-[#f23645]/40 bg-[#f23645]/10 text-[#f23645]'
                      : 'border-[#089981]/40 bg-[#089981]/10 text-[#089981]'
                  }`}
                >
                  {ocMsg}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--tv-border)]">
                <button
                  type="button"
                  data-testid="opencode-autostart-btn"
                  disabled={ocBusy}
                  onClick={() => void launchOpenCodeLocal()}
                  className="h-[32px] px-3 rounded-[4px] border border-[#089981]/50 bg-[#089981]/15 hover:bg-[#089981]/25 text-[#089981] text-[12px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  Launch &amp; Connect Local
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="opencode-test-btn"
                    disabled={ocBusy}
                    onClick={() => void testOpenCode()}
                    className="h-[32px] px-3 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] text-[12px] font-medium cursor-pointer disabled:opacity-50"
                  >
                    Test Connection
                  </button>
                  <button
                    type="button"
                    data-testid="opencode-save-btn"
                    disabled={ocBusy}
                    onClick={() => void saveOpenCode()}
                    className="h-[32px] px-4 rounded-[4px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white text-[12px] font-medium cursor-pointer disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {connectionsTab === 'gemini' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--tv-text-primary)]">
                  Google Gemini (@google/genai)
                </span>
                {renderBadge(connectionStatuses.gemini, 'gemini-status-badge')}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--tv-text-muted)]">Auth Mode</span>
                  <select
                    value={gemAuthMode}
                    onChange={(e) => {
                      setGemAuthMode(e.target.value as GeminiAuthMode);
                      setGemDirty(true);
                    }}
                    className="h-[32px] px-2 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                  >
                    <option value="apiKey">API Key</option>
                    <option value="envKey">Server GEMINI_API_KEY Env</option>
                    <option value="vertexai">Vertex AI</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--tv-text-muted)]">Model</span>
                  <select
                    data-testid="gemini-model-select"
                    value={gemModel}
                    onChange={(e) => {
                      setGemModel(e.target.value as GeminiModel);
                      setGemDirty(true);
                    }}
                    className="h-[32px] px-2 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                  >
                    {GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] text-[var(--tv-text-muted)]">
                  <span>Gemini API Key</span>
                  {masked?.gemini.hasApiKey && (
                    <span className="flex items-center gap-2 text-[#089981]">
                      <span>Configured ({masked.gemini.apiKeyPreview})</span>
                      <button
                        type="button"
                        onClick={async () => {
                          setGemBusy(true);
                          try {
                            const updated = await apiClient.saveConnections({
                              gemini: { apiKey: '' },
                            });
                            setGemApiKey('');
                            setGemKeyDirty(false);
                            applyMaskedResponse(updated);
                            setConnectionStatus('gemini', 'disconnected');
                            setGemMsg('Stored Gemini API key cleared.');
                          } finally {
                            setGemBusy(false);
                          }
                        }}
                        className="text-[10px] text-[#f23645] hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  data-testid="gemini-apikey-input"
                  value={gemApiKey}
                  onChange={(e) => {
                    setGemApiKey(e.target.value);
                    setGemKeyDirty(true);
                  }}
                  placeholder={
                    masked?.gemini.hasApiKey
                      ? 'Leave blank to keep existing API key'
                      : 'Enter Gemini API key (AIza...)'
                  }
                  className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--tv-text-muted)]">
                  Optional Endpoint Base URL (Proxy / Mock Override)
                </span>
                <input
                  type="text"
                  data-testid="gemini-baseurl-input"
                  value={gemBaseUrl}
                  onChange={(e) => {
                    setGemBaseUrl(e.target.value);
                    setGemDirty(true);
                  }}
                  placeholder="https://generativelanguage.googleapis.com"
                  className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                />
              </label>

              {gemAuthMode === 'vertexai' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--tv-text-muted)]">
                      Vertex Project ID
                    </span>
                    <input
                      type="text"
                      value={gemVertexProject}
                      onChange={(e) => setGemVertexProject(e.target.value)}
                      className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--tv-text-muted)]">
                      Location
                    </span>
                    <input
                      type="text"
                      value={gemVertexLocation}
                      onChange={(e) => setGemVertexLocation(e.target.value)}
                      className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                    />
                  </label>
                </div>
              )}

              {gemMsg && (
                <div
                  className={`px-3 py-2 rounded-[4px] border text-[12px] ${
                    connectionStatuses.gemini === 'error'
                      ? 'border-[#f23645]/40 bg-[#f23645]/10 text-[#f23645]'
                      : 'border-[#089981]/40 bg-[#089981]/10 text-[#089981]'
                  }`}
                >
                  {gemMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--tv-border)]">
                <button
                  type="button"
                  data-testid="gemini-test-btn"
                  disabled={gemBusy}
                  onClick={() => void testGemini()}
                  className="h-[32px] px-3 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] text-[12px] font-medium cursor-pointer disabled:opacity-50"
                >
                  Test Connection
                </button>
                <button
                  type="button"
                  data-testid="gemini-save-btn"
                  disabled={gemBusy}
                  onClick={() => void saveGemini()}
                  className="h-[32px] px-4 rounded-[4px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white text-[12px] font-medium cursor-pointer disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {connectionsTab === 'deepseek' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--tv-text-primary)]">
                  DeepSeek Official API (V3 Chat &amp; R1 Reasoner)
                </span>
                {renderBadge(connectionStatuses.deepseek ?? 'disconnected', 'deepseek-status-badge')}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--tv-text-muted)]">Model</span>
                  <select
                    data-testid="deepseek-model-select"
                    value={dsModel}
                    onChange={(e) => {
                      setDsModel(e.target.value);
                      setDsDirty(true);
                    }}
                    className="h-[32px] px-2 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                  >
                    {DEEPSEEK_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--tv-text-muted)]">Base URL</span>
                  <input
                    type="text"
                    data-testid="deepseek-baseurl-input"
                    value={dsBaseUrl}
                    onChange={(e) => {
                      setDsBaseUrl(e.target.value);
                      setDsDirty(true);
                    }}
                    placeholder="https://api.deepseek.com"
                    className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] text-[var(--tv-text-muted)]">
                  <span>DeepSeek API Key</span>
                  {masked?.deepseek?.hasApiKey && (
                    <span className="flex items-center gap-2 text-[#089981]">
                      <span>Configured ({masked.deepseek.apiKeyPreview})</span>
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  data-testid="deepseek-apikey-input"
                  value={dsApiKey}
                  onChange={(e) => {
                    setDsApiKey(e.target.value);
                    setDsKeyDirty(true);
                  }}
                  placeholder={
                    masked?.deepseek?.hasApiKey
                      ? 'Leave blank to keep existing key'
                      : 'Enter DeepSeek API key (sk-...)'
                  }
                  className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                />
              </label>

              {dsMsg && (
                <div
                  className={`px-3 py-2 rounded-[4px] border text-[12px] ${
                    connectionStatuses.deepseek === 'error'
                      ? 'border-[#f23645]/40 bg-[#f23645]/10 text-[#f23645]'
                      : 'border-[#089981]/40 bg-[#089981]/10 text-[#089981]'
                  }`}
                >
                  {dsMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--tv-border)]">
                <button
                  type="button"
                  data-testid="deepseek-test-btn"
                  disabled={dsBusy}
                  onClick={() => void testDeepSeek()}
                  className="h-[32px] px-3 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] text-[12px] font-medium cursor-pointer disabled:opacity-50"
                >
                  Test Connection
                </button>
                <button
                  type="button"
                  data-testid="deepseek-save-btn"
                  disabled={dsBusy}
                  onClick={() => void saveDeepSeek()}
                  className="h-[32px] px-4 rounded-[4px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white text-[12px] font-medium cursor-pointer disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {connectionsTab === 'byok' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--tv-text-primary)]">
                  Bring Your Own API (Any OpenAI-Compatible Endpoint)
                </span>
                {renderBadge(connectionStatuses.byok ?? 'disconnected', 'byok-status-badge')}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {BYOK_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setByokProviderName(preset.name);
                      setByokBaseUrl(preset.baseUrl);
                      setByokModel(preset.defaultModel);
                      setByokDirty(true);
                    }}
                    className="px-2 py-1 rounded bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] border border-[var(--tv-border)] text-[11px] text-[var(--tv-text-secondary)] cursor-pointer"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--tv-text-muted)]">Provider Label</span>
                  <input
                    type="text"
                    value={byokProviderName}
                    onChange={(e) => {
                      setByokProviderName(e.target.value);
                      setByokDirty(true);
                    }}
                    className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--tv-text-muted)]">Model ID</span>
                  <input
                    type="text"
                    data-testid="byok-model-input"
                    value={byokModel}
                    onChange={(e) => {
                      setByokModel(e.target.value);
                      setByokDirty(true);
                    }}
                    placeholder="deepseek/deepseek-chat or gpt-4o"
                    className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] font-mono text-[12px]"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--tv-text-muted)]">
                  API Base URL (/v1/chat/completions compatible)
                </span>
                <input
                  type="text"
                  data-testid="byok-baseurl-input"
                  value={byokBaseUrl}
                  onChange={(e) => {
                    setByokBaseUrl(e.target.value);
                    setByokDirty(true);
                  }}
                  placeholder="https://openrouter.ai/api/v1"
                  className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)] font-mono text-[12px]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] text-[var(--tv-text-muted)]">
                  <span>API Key (Optional for localhost Ollama / LM Studio)</span>
                  {masked?.byok?.hasApiKey && (
                    <span className="text-[#089981]">Configured ({masked.byok.apiKeyPreview})</span>
                  )}
                </div>
                <input
                  type="password"
                  data-testid="byok-apikey-input"
                  value={byokApiKey}
                  onChange={(e) => {
                    setByokApiKey(e.target.value);
                    setByokKeyDirty(true);
                  }}
                  placeholder={
                    masked?.byok?.hasApiKey
                      ? 'Leave blank to keep existing key'
                      : 'Paste Bearer API key (sk-or-..., sk-..., gsk_...)'
                  }
                  className="h-[32px] px-2.5 rounded-[4px] bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[var(--tv-text-primary)]"
                />
              </label>

              {byokMsg && (
                <div
                  className={`px-3 py-2 rounded-[4px] border text-[12px] ${
                    connectionStatuses.byok === 'error'
                      ? 'border-[#f23645]/40 bg-[#f23645]/10 text-[#f23645]'
                      : 'border-[#089981]/40 bg-[#089981]/10 text-[#089981]'
                  }`}
                >
                  {byokMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--tv-border)]">
                <button
                  type="button"
                  data-testid="byok-test-btn"
                  disabled={byokBusy}
                  onClick={() => void testByok()}
                  className="h-[32px] px-3 rounded-[4px] border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] text-[var(--tv-text-primary)] text-[12px] font-medium cursor-pointer disabled:opacity-50"
                >
                  Test Connection
                </button>
                <button
                  type="button"
                  data-testid="byok-save-btn"
                  disabled={byokBusy}
                  onClick={() => void saveByok()}
                  className="h-[32px] px-4 rounded-[4px] bg-[var(--tv-accent)] hover:bg-[var(--tv-accent-hover)] text-white text-[12px] font-medium cursor-pointer disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
