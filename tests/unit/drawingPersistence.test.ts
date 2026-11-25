import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawingObject } from '../../shared/types';

const STORAGE_KEY = 'tv_ultra_drawings_v1';

function makeStorage(seed?: Record<string, string>) {
  const data = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}

function legacyLong(): DrawingObject {
  return {
    id: 'legacy-long',
    tool: 'long_position',
    symbol: 'AAPL',
    timeframe: '1D',
    points: [
      { time: 1000, price: 100 },
      { time: 5000, price: 104 },
    ],
    color: '#089981',
    targetPrice: 104,
    stopPrice: 98,
    visible: true,
    locked: false,
  };
}

describe('drawing persistence and position synchronization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', makeStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('restores drawings and migrates legacy two-anchor positions on load', async () => {
    const seeded = makeStorage({
      [STORAGE_KEY]: JSON.stringify({
        version: 1,
        savedAt: 123,
        drawings: [legacyLong(), { garbage: true }],
      }),
    });
    vi.stubGlobal('localStorage', seeded);
    const { useWorkspaceStore } = await import('../../src/state/workspaceStore');

    const restored = useWorkspaceStore.getState().drawings;
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('legacy-long');
    expect(restored[0].points).toHaveLength(3);
    expect(restored[0].points[2].price).toBeCloseTo(98);
  });

  it('normalizes positions on add and keeps metadata in sync on body drag', async () => {
    const { useWorkspaceStore } = await import('../../src/state/workspaceStore');
    const state = useWorkspaceStore.getState();
    state.addDrawing(legacyLong());

    const added = useWorkspaceStore.getState().drawings[0];
    expect(added.points).toHaveLength(3);
    expect(added.targetPrice).toBeCloseTo(104);
    expect(added.stopPrice).toBeCloseTo(98);

    // Simulate a body drag: all three anchors move by the same delta.
    const moved = added.points.map((p) => ({ ...p, price: p.price + 5 }));
    useWorkspaceStore.getState().updateDrawing('legacy-long', { points: moved });

    const after = useWorkspaceStore.getState().drawings[0];
    expect(after.points[0].price).toBeCloseTo(105);
    expect(after.targetPrice).toBeCloseTo(109);
    expect(after.stopPrice).toBeCloseTo(103);
  });

  it('rebuilds anchors when only a level price is updated', async () => {
    const { useWorkspaceStore } = await import('../../src/state/workspaceStore');
    useWorkspaceStore.getState().addDrawing(legacyLong());
    useWorkspaceStore
      .getState()
      .updateDrawing('legacy-long', { targetPrice: 112 });

    const d = useWorkspaceStore.getState().drawings[0];
    expect(d.points).toHaveLength(3);
    expect(d.points[1].price).toBeCloseTo(112);
    expect(d.targetPrice).toBeCloseTo(112);
    expect(d.points[2].price).toBeCloseTo(98);
  });

  it('clamps crossed levels to a valid bracket', async () => {
    const { useWorkspaceStore } = await import('../../src/state/workspaceStore');
    useWorkspaceStore.getState().addDrawing(legacyLong());
    useWorkspaceStore.getState().updateDrawing('legacy-long', { targetPrice: 90 });

    const d = useWorkspaceStore.getState().drawings[0];
    expect(d.targetPrice).toBeGreaterThan(d.points[0].price);
    expect(d.stopPrice).toBeLessThan(d.points[0].price);
  });

  it('debounces writes to a versioned envelope', async () => {
    vi.useFakeTimers();
    const storage = makeStorage();
    vi.stubGlobal('localStorage', storage);
    const { useWorkspaceStore } = await import('../../src/state/workspaceStore');

    useWorkspaceStore.getState().addDrawing(legacyLong());
    expect(storage.getItem(STORAGE_KEY)).toBeNull();

    await vi.advanceTimersByTimeAsync(300);
    const raw = storage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!);
    expect(envelope.version).toBe(1);
    expect(envelope.drawings).toHaveLength(1);
    expect(envelope.drawings[0].points).toHaveLength(3);
  });
});
