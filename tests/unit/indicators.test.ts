import { describe, expect, it } from 'vitest';
import type { OHLCVBar } from '../../shared/types';
import {
  INDICATOR_CATALOG,
  calcATR,
  calcBollingerBands,
  calcEMA,
  calcMACD,
  calcRSI,
  calcSMA,
  calcVWAP,
} from '../../src/lib/indicators';

function makeBars(closes: number[]): OHLCVBar[] {
  return closes.map((close, idx) => ({
    time: 1_700_000_000 + idx * 86_400,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000 + idx * 10,
  }));
}

describe('technical indicators math', () => {
  it('computes exact SMA values aligned to timestamps', () => {
    const bars = makeBars([10, 20, 30, 40, 50]);
    const sma = calcSMA(bars, 3);
    expect(sma).toEqual([
      { time: bars[2].time, value: 20 },
      { time: bars[3].time, value: 30 },
      { time: bars[4].time, value: 40 },
    ]);
  });

  it('computes EMA weighting recent prices higher on monotonic uptrend', () => {
    const bars = makeBars([10, 12, 14, 16, 18, 20, 22, 24, 26, 28]);
    const sma = calcSMA(bars, 5);
    const ema = calcEMA(bars, 5);
    expect(ema).toHaveLength(sma.length);
    // For linear rising prices, EMA starts equal to SMA and tracks closely behind/at SMA depending on slope; check finite & strictly increasing
    for (let i = 1; i < ema.length; i += 1) {
      expect(ema[i].value).toBeGreaterThan(ema[i - 1].value);
    }
  });

  it('computes Bollinger Bands with upper > middle > lower', () => {
    const bars = makeBars(
      Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 2) * 5 + i * 0.3),
    );
    const bb = calcBollingerBands(bars, 10, 2);
    expect(bb.middle).toHaveLength(21);
    for (let i = 0; i < bb.middle.length; i += 1) {
      expect(bb.upper[i].value).toBeGreaterThan(bb.middle[i].value);
      expect(bb.middle[i].value).toBeGreaterThan(bb.lower[i].value);
    }
  });

  it('computes VWAP across all bars within [min low, max high]', () => {
    const bars = makeBars([100, 105, 102, 108, 110]);
    const vwap = calcVWAP(bars);
    expect(vwap).toHaveLength(5);
    for (const pt of vwap) {
      expect(pt.value).toBeGreaterThanOrEqual(99);
      expect(pt.value).toBeLessThanOrEqual(111);
    }
  });

  it('bounds RSI within [0, 100] and detects strong bullish momentum near 100', () => {
    const rising = makeBars(Array.from({ length: 25 }, (_, i) => 50 + i * 2));
    const rsi = calcRSI(rising, 14);
    expect(rsi.length).toBeGreaterThan(0);
    for (const pt of rsi) {
      expect(pt.value).toBeGreaterThanOrEqual(0);
      expect(pt.value).toBeLessThanOrEqual(100);
    }
    expect(rsi[rsi.length - 1].value).toBeGreaterThan(95);
  });

  it('computes MACD line, signal line, and histogram consistently', () => {
    const bars = makeBars(
      Array.from({ length: 60 }, (_, i) => 100 + i * 0.8 + Math.cos(i / 3) * 3),
    );
    const macd = calcMACD(bars, 12, 26, 9);
    expect(macd.macd.length).toBeGreaterThan(0);
    expect(macd.signal.length).toBeGreaterThan(0);
    expect(macd.histogram).toHaveLength(macd.signal.length);
  });

  it('computes positive ATR and exposes full catalog', () => {
    const bars = makeBars(Array.from({ length: 30 }, (_, i) => 200 + (i % 4) * 3));
    const atr = calcATR(bars, 14);
    expect(atr.length).toBeGreaterThan(0);
    for (const pt of atr) {
      expect(pt.value).toBeGreaterThan(0);
    }
    expect(INDICATOR_CATALOG.map((c) => c.id)).toEqual([
      'sma',
      'ema',
      'bb',
      'vwap',
      'supertrend',
      'rsi',
      'macd',
      'stoch',
      'adx',
      'atr',
      'obv',
    ]);
  });
});
