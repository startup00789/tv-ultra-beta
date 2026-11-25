import { useEffect, useState } from 'react';
import { FastForward, Pause, Play, Rewind, StepBack, StepForward, X } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { useWorkspaceStore } from '../../state/workspaceStore';

const SPEEDS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '1x', ms: 800 },
  { label: '2x', ms: 400 },
  { label: '5x', ms: 160 },
  { label: '10x', ms: 75 },
];

export function BarReplayBar() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const bars = useWorkspaceStore((s) => s.bars);
  const replayActive = useWorkspaceStore((s) => s.replayActive);
  const replayIndex = useWorkspaceStore((s) => s.replayIndex);
  const replayPlaying = useWorkspaceStore((s) => s.replayPlaying);
  const replaySpeedMs = useWorkspaceStore((s) => s.replaySpeedMs);
  const paperAccount = useWorkspaceStore((s) => s.paperAccount);

  const stepReplay = useWorkspaceStore((s) => s.stepReplay);
  const setReplayIndex = useWorkspaceStore((s) => s.setReplayIndex);
  const setReplayPlaying = useWorkspaceStore((s) => s.setReplayPlaying);
  const setReplaySpeedMs = useWorkspaceStore((s) => s.setReplaySpeedMs);
  const stopReplay = useWorkspaceStore((s) => s.stopReplay);
  const setPaperAccount = useWorkspaceStore((s) => s.setPaperAccount);

  const [tradeFeedback, setTradeFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!replayActive || !replayPlaying) return;
    const id = window.setInterval(() => {
      stepReplay(1);
    }, replaySpeedMs);
    return () => window.clearInterval(id);
  }, [replayActive, replayPlaying, replaySpeedMs, stepReplay]);

  if (!replayActive || bars.length === 0) return null;

  const clampedIdx = Math.max(1, Math.min(bars.length, replayIndex));
  const currentBar = bars[clampedIdx - 1];
  const dateLabel = currentBar
    ? new Date(currentBar.time * 1000).toISOString().slice(0, 16).replace('T', ' ')
    : '—';

  const openPos = paperAccount?.positions.find((p) => p.symbol === symbol);

  const handleReplayTrade = async (side: 'long' | 'short') => {
    if (!currentBar) return;
    try {
      const res = await apiClient.placePaperOrder({
        symbol,
        side,
        notionalUsd: 2500,
        price: currentBar.close,
        stopLossPct: 2,
        takeProfitPct: 5,
        note: `Bar Replay ${side.toUpperCase()} @ bar ${clampedIdx}/${bars.length}`,
      });
      if (res.ok) {
        setPaperAccount(res.state);
        setTradeFeedback(`${side.toUpperCase()} filled @ ${currentBar.close.toFixed(2)}`);
        window.setTimeout(() => setTradeFeedback(null), 2500);
      }
    } catch (err) {
      setTradeFeedback(err instanceof Error ? err.message : 'Order blocked');
      window.setTimeout(() => setTradeFeedback(null), 2500);
    }
  };

  const handleReplayClose = async () => {
    if (!openPos || !currentBar) return;
    try {
      const res = await apiClient.closePaperPosition({
        botId: openPos.botId,
        symbol,
        exitPrice: currentBar.close,
      });
      if (res.ok) {
        setPaperAccount(res.state);
        setTradeFeedback(`Closed @ ${currentBar.close.toFixed(2)}`);
        window.setTimeout(() => setTradeFeedback(null), 2500);
      }
    } catch {
      // Ignore close error
    }
  };

  return (
    <div
      data-testid="bar-replay-bar"
      className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-[var(--tv-accent)]/50 bg-[var(--tv-bg-elevated)]/95 shadow-2xl text-[11px] text-[var(--tv-text-primary)] select-none"
    >
      <span className="inline-flex items-center gap-1 font-semibold text-[var(--tv-accent)]">
        <Rewind className="w-3.5 h-3.5" />
        <span>Replay</span>
      </span>

      <input
        type="range"
        aria-label="Replay bar position"
        min={5}
        max={bars.length}
        value={clampedIdx}
        onChange={(e) => setReplayIndex(Number(e.target.value))}
        className="w-[100px] accent-[var(--tv-accent)] cursor-pointer"
      />

      <span className="font-mono text-[10px] text-[var(--tv-text-muted)] whitespace-nowrap">
        {clampedIdx}/{bars.length} · {dateLabel}
      </span>

      <div className="tv-divider-v !h-4" />

      <button
        type="button"
        aria-label="Step back 1 bar"
        onClick={() => stepReplay(-1)}
        className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--tv-bg-hover)] cursor-pointer"
      >
        <StepBack className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        data-testid="replay-play-btn"
        aria-label={replayPlaying ? 'Pause replay' : 'Play replay'}
        onClick={() => setReplayPlaying(!replayPlaying)}
        className="w-6 h-6 rounded bg-[var(--tv-accent)] text-white flex items-center justify-center hover:bg-[var(--tv-accent-hover)] cursor-pointer"
      >
        {replayPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>

      <button
        type="button"
        data-testid="replay-step-btn"
        aria-label="Step forward 1 bar"
        onClick={() => stepReplay(1)}
        className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--tv-bg-hover)] cursor-pointer"
      >
        <StepForward className="w-3.5 h-3.5" />
      </button>

      <select
        aria-label="Replay speed"
        value={replaySpeedMs}
        onChange={(e) => setReplaySpeedMs(Number(e.target.value))}
        className="h-[22px] px-1 rounded bg-[var(--tv-bg-panel)] border border-[var(--tv-border)] text-[10px]"
      >
        {SPEEDS.map((s) => (
          <option key={s.ms} value={s.ms}>
            {s.label}
          </option>
        ))}
      </select>

      <div className="tv-divider-v !h-4" />

      {/* Replay Simulated Broker Controls (matching TradingView replay-broker.js) */}
      <button
        type="button"
        onClick={() => void handleReplayTrade('long')}
        className="h-[22px] px-2 rounded bg-[#089981] hover:bg-[#089981]/90 text-white font-semibold text-[10px] cursor-pointer"
      >
        Buy
      </button>
      <button
        type="button"
        onClick={() => void handleReplayTrade('short')}
        className="h-[22px] px-2 rounded bg-[#f23645] hover:bg-[#f23645]/90 text-white font-semibold text-[10px] cursor-pointer"
      >
        Sell
      </button>
      {openPos && (
        <button
          type="button"
          onClick={() => void handleReplayClose()}
          className="h-[22px] px-2 rounded border border-[var(--tv-border)] bg-[var(--tv-bg-panel)] hover:bg-[var(--tv-bg-hover)] text-[10px] cursor-pointer"
        >
          Flatten ({openPos.unrealizedPnl >= 0 ? '+' : ''}${openPos.unrealizedPnl.toFixed(0)})
        </button>
      )}

      {tradeFeedback && (
        <span className="text-[10px] font-semibold text-[#089981] whitespace-nowrap">
          {tradeFeedback}
        </span>
      )}

      <button
        type="button"
        data-testid="replay-exit-btn"
        aria-label="Exit Bar Replay"
        title="Exit Bar Replay"
        onClick={stopReplay}
        className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-muted)] hover:text-[#f23645] hover:bg-[var(--tv-bg-hover)] cursor-pointer"
      >
        <FastForward className="w-3 h-3 hidden" />
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
