import { describe, expect, it } from 'vitest';
import type { DrawingObject, OHLCVBar } from '../../shared/types';
import {
  buildPositionDrawing,
  buildPositionTags,
  clampPositionPixels,
  computePositionMetrics,
  formatPositionMoney,
  formatPositionQty,
  formatPositionRatio,
  formatPositionSignedMoney,
  geometryToPoints,
  inferTickSize,
  normalizePositionGeometry,
  resolvePositionConfig,
  resolvePositionGeometry,
  simulatePositionOutcome,
  syncPositionDrawing,
  translatePositionGeometry,
  type PositionConfig,
} from '../../src/lib/drawingPosition';

function config(overrides: Partial<PositionConfig> = {}): PositionConfig {
  return {
    accountSize: 1000,
    lotSize: 1,
    riskMode: 'percent',
    riskValue: 25,
    leverage: 10000,
    pointValue: 1,
    qtyPrecision: 2,
    tickSize: 0.01,
    ...overrides,
  };
}

function baseDrawing(overrides: Partial<DrawingObject> = {}): DrawingObject {
  return {
    id: 'p1',
    tool: 'long_position',
    symbol: 'AAPL',
    timeframe: '1D',
    points: [
      { time: 1000, price: 100 },
      { time: 5000, price: 104 },
      { time: 5000, price: 96 },
    ],
    color: '#787b86',
    visible: true,
    locked: false,
    ...overrides,
  };
}

describe('position geometry', () => {
  it('builds a symmetric three-anchor long bracket', () => {
    const built = buildPositionDrawing(
      'long_position',
      { time: 1000, price: 100 },
      { time: 5000, price: 104 },
      0.01,
    );
    expect(built.points).toHaveLength(3);
    expect(built.targetPrice).toBeCloseTo(104);
    expect(built.stopPrice).toBeCloseTo(96);
    expect(built.points[1].time).toBe(5000);
    expect(built.points[2].time).toBe(5000);
  });

  it('mirrors the bracket for shorts', () => {
    const built = buildPositionDrawing(
      'short_position',
      { time: 1000, price: 100 },
      { time: 5000, price: 96 },
      0.01,
    );
    expect(built.targetPrice).toBeCloseTo(96);
    expect(built.stopPrice).toBeCloseTo(104);
  });

  it('clamps inverted levels to the correct side of entry', () => {
    const longGeom = normalizePositionGeometry(
      'long',
      { leftTime: 1, rightTime: 9, entry: 100, target: 99, stop: 105 },
      0.01,
    );
    expect(longGeom.target).toBeCloseTo(100.01);
    expect(longGeom.stop).toBeCloseTo(99.99);
    expect(longGeom.adjusted).toBe(true);

    const shortGeom = normalizePositionGeometry(
      'short',
      { leftTime: 1, rightTime: 9, entry: 100, target: 101, stop: 99 },
      0.01,
    );
    expect(shortGeom.target).toBeCloseTo(99.99);
    expect(shortGeom.stop).toBeCloseTo(100.01);
  });

  it('migrates legacy two-anchor drawings using target/stop metadata', () => {
    const legacy = baseDrawing({
      points: [
        { time: 1000, price: 100 },
        { time: 5000, price: 104 },
      ],
      targetPrice: 104,
      stopPrice: 98,
    });
    const migrated = syncPositionDrawing(legacy);
    expect(migrated.points).toHaveLength(3);
    expect(migrated.points[1].price).toBeCloseTo(104);
    expect(migrated.points[2].price).toBeCloseTo(98);
    expect(migrated.targetPrice).toBeCloseTo(104);
    expect(migrated.stopPrice).toBeCloseTo(98);
    expect(migrated.stopColor).toBe('#f23645');
    expect(migrated.targetColor).toBe('#089981');
  });

  it('resolves geometry straight from three points without metadata', () => {
    const geometry = resolvePositionGeometry(
      {
        tool: 'long_position',
        points: [
          { time: 1000, price: 100 },
          { time: 5000, price: 104 },
          { time: 5000, price: 98 },
        ],
      },
      0.01,
    );
    expect(geometry.entry).toBe(100);
    expect(geometry.target).toBe(104);
    expect(geometry.stop).toBe(98);
    expect(geometry.rightTime).toBe(5000);
  });

  it('translates all levels by the same delta', () => {
    const moved = translatePositionGeometry(
      { leftTime: 1000, rightTime: 5000, entry: 100, target: 104, stop: 98 },
      60,
      -2,
    );
    expect(moved).toEqual({
      leftTime: 1060,
      rightTime: 5060,
      entry: 98,
      target: 102,
      stop: 96,
    });
  });

  it('infers tick sizes for crypto, FX, and equities', () => {
    expect(inferTickSize('BTCUSDT', 65000)).toBe(1);
    expect(inferTickSize('ETHUSDT', 3200)).toBe(0.01);
    expect(inferTickSize('EURUSD', 1.08)).toBe(0.0001);
    expect(inferTickSize('USDJPY', 150)).toBe(0.001);
    expect(inferTickSize('AAPL', 220)).toBe(0.01);
  });
});

describe('position sizing math', () => {
  it('matches TradingView risk/leverage formulas for a long', () => {
    const geom = { leftTime: 0, rightTime: 1, entry: 100, target: 104, stop: 98 };
    const metrics = computePositionMetrics('long', geom, config());

    // Risk% 25 of 1000 = 250; qtyRisk = 250 / (2 * 1) / 1 = 125.
    expect(metrics.riskSize).toBe(250);
    expect(metrics.qty).toBe(125);
    expect(metrics.riskReward).toBeCloseTo(2);
    expect(metrics.targetOffset).toBeCloseTo(4);
    expect(metrics.stopOffset).toBeCloseTo(2);
    expect(metrics.targetPct).toBeCloseTo(4);
    expect(metrics.stopPct).toBeCloseTo(2);
    expect(metrics.targetTicks).toBe(400);
    expect(metrics.stopTicks).toBe(200);
    expect(metrics.targetPnl).toBeCloseTo(500);
    expect(metrics.stopPnl).toBeCloseTo(-250);
    expect(metrics.targetBalance).toBeCloseTo(1500);
    expect(metrics.stopBalance).toBeCloseTo(750);
  });

  it('caps quantity by leverage when risk allows more', () => {
    const geom = { leftTime: 0, rightTime: 1, entry: 100, target: 104, stop: 99 };
    const metrics = computePositionMetrics(
      'long',
      geom,
      config({ riskValue: 90, leverage: 1 }),
    );
    // qtyRisk = 900 / 1 = 900, qtyLvg = (1000 * 1 / 100) = 10.
    expect(metrics.qty).toBe(10);
    expect(metrics.targetPnl).toBeCloseTo(40);
  });

  it('mirrors signs for shorts', () => {
    const geom = { leftTime: 0, rightTime: 1, entry: 100, target: 96, stop: 102 };
    const metrics = computePositionMetrics(
      'short',
      geom,
      config({ riskMode: 'amount', riskValue: 100, leverage: 100 }),
    );
    expect(metrics.riskSize).toBe(100);
    expect(metrics.qty).toBe(50);
    expect(metrics.targetPnl).toBeCloseTo(200);
    expect(metrics.stopPnl).toBeCloseTo(-100);
    expect(metrics.riskReward).toBeCloseTo(2);
  });

  it('floors quantity to lot size and honours qty precision', () => {
    const geom = { leftTime: 0, rightTime: 1, entry: 100, target: 103, stop: 96 };
    const metrics = computePositionMetrics(
      'long',
      geom,
      config({ lotSize: 5, riskValue: 15, qtyPrecision: 1 }),
    );
    // qtyRisk = 150 / 4 / 5 = 7.5 → floored to one 5-unit lot.
    expect(metrics.qty).toBe(5);
  });

  it('marks invalid brackets instead of producing NaN quantities', () => {
    const metrics = computePositionMetrics(
      'long',
      { leftTime: 0, rightTime: 1, entry: 0, target: 1, stop: -1 },
      config(),
    );
    expect(metrics.valid).toBe(false);
    expect(metrics.qty).toBe(0);
    expect(metrics.reason).toBeTruthy();
  });
});

describe('position outcome simulation', () => {
  const entry = 100;
  const target = 104;
  const stop = 98;
  const geometry = { leftTime: 1000, rightTime: 5000, entry, target, stop };
  const longCfg = config({ riskMode: 'amount', riskValue: 100, leverage: 100 });
  const metrics = computePositionMetrics('long', geometry, longCfg);

  const bar = (time: number, open: number, high: number, low: number, close: number): OHLCVBar => ({
    time,
    open,
    high,
    low,
    close,
    volume: 1000,
  });

  it('reports Closed P&L when the target is reached first', () => {
    const bars = [bar(1000, 100, 100.5, 99.5, 100), bar(2000, 100, 105, 99, 104)];
    const outcome = simulatePositionOutcome('long', geometry, metrics, bars, longCfg);
    expect(outcome.status).toBe('target');
    expect(outcome.closed).toBe(true);
    expect(outcome.pnl).toBeCloseTo(200);
    expect(outcome.balance).toBeCloseTo(1200);
  });

  it('uses candle direction as a deterministic same-candle tie-breaker', () => {
    const bars = [bar(1000, 100, 101, 99, 100), bar(2000, 104, 105, 97, 98)];
    const outcome = simulatePositionOutcome('long', geometry, metrics, bars, longCfg);
    expect(outcome.status).toBe('stop');
    expect(outcome.ambiguousSameBar).toBe(true);
    expect(outcome.pnl).toBeCloseTo(-100);
  });

  it('reports Open P&L when neither level was touched after entry', () => {
    const bars = [bar(1000, 100, 101, 99, 100), bar(2000, 101, 102, 100.5, 101)];
    const outcome = simulatePositionOutcome('long', geometry, metrics, bars, longCfg);
    expect(outcome.status).toBe('open');
    expect(outcome.closed).toBe(false);
    expect(outcome.openPnl).toBeCloseTo(50);
  });

  it('reports not-entered when price never traded through the entry area', () => {
    const bars = [bar(1000, 110, 111, 109, 110), bar(2000, 112, 113, 110, 112)];
    const outcome = simulatePositionOutcome('long', geometry, metrics, bars, longCfg);
    expect(outcome.status).toBe('not-entered');
    expect(outcome.closed).toBe(false);
  });

  it('handles short targets correctly', () => {
    const shortGeom = { leftTime: 1000, rightTime: 5000, entry, target: 96, stop: 102 };
    const shortCfg = config({ riskMode: 'amount', riskValue: 100, leverage: 100 });
    const shortMetrics = computePositionMetrics('short', shortGeom, shortCfg);
    const bars = [bar(1000, 100, 101, 99, 100), bar(2000, 100, 101, 95, 96)];
    const outcome = simulatePositionOutcome(
      'short',
      shortGeom,
      shortMetrics,
      bars,
      shortCfg,
    );
    expect(outcome.status).toBe('target');
    expect(outcome.pnl).toBeCloseTo(200);
  });
});

describe('position formatting and tags', () => {
  it('formats TradingView-style values', () => {
    expect(formatPositionMoney(1250)).toBe('1,250');
    expect(formatPositionSignedMoney(-250)).toBe('-250');
    expect(formatPositionSignedMoney(500)).toBe('+500');
    expect(formatPositionQty(657.125, 2)).toBe('657.13');
    expect(formatPositionRatio(2)).toBe('2');
    expect(formatPositionRatio(0.5)).toBe('0.5');
    expect(formatPositionRatio(0)).toBe('—');
  });

  it('builds full and compact tag text', () => {
    const geom = { leftTime: 0, rightTime: 1, entry: 100, target: 104, stop: 98 };
    const metrics = computePositionMetrics('long', geom, config());
    const outcome = simulatePositionOutcome('long', geom, metrics, [], config());
    const full = buildPositionTags(metrics, outcome, {
      tickSize: 0.01,
      qtyPrecision: 2,
    });
    expect(full.target).toContain('Target: 4.00 (4.000%) 400');
    expect(full.target).toContain('Amount: 1,500');
    expect(full.stop).toContain('Amount: 750');
    expect(full.centerLine1).toContain('Qty: 125');
    expect(full.centerLine2).toBe('Risk/Reward Ratio: 2');

    const compact = buildPositionTags(metrics, outcome, {
      tickSize: 0.01,
      qtyPrecision: 2,
      compact: true,
    });
    expect(compact.target).toBe('Target: 4.00 (4.000%)');
    expect(compact.centerLine1).not.toContain('Qty');
  });

  it('clamps pixel boxes and tag layouts inside the pane', () => {
    const clamped = clampPositionPixels(
      { leftX: -40, rightX: 9999, entryY: -20, targetY: -80, stopY: 900 },
      800,
      400,
      10,
    );
    expect(clamped.leftX).toBe(10);
    expect(clamped.rightX).toBe(790);
    expect(clamped.targetY).toBe(10);
    expect(clamped.stopY).toBe(390);
  });

  it('keeps geometryToPoints aligned with the three-anchor contract', () => {
    const points = geometryToPoints({
      leftTime: 100,
      rightTime: 900,
      entry: 100,
      target: 108,
      stop: 94,
    });
    expect(points).toEqual([
      { time: 100, price: 100 },
      { time: 900, price: 108 },
      { time: 900, price: 94 },
    ]);
  });

  it('normalizes config values defensively', () => {
    const cfg = resolvePositionConfig(
      {
        accountSize: -5,
        lotSize: Number.NaN,
        riskValue: -1,
        leverage: 0,
        qtyPrecision: 99,
      },
      0,
    );
    expect(cfg.accountSize).toBe(10000);
    expect(cfg.lotSize).toBe(1);
    expect(cfg.riskValue).toBe(1);
    expect(cfg.leverage).toBe(1);
    expect(cfg.qtyPrecision).toBe(8);
    expect(cfg.tickSize).toBe(0.01);
  });
});
