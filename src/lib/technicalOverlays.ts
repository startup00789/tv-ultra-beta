import type { OHLCVBar, Timeframe } from '../../shared/types';

export interface LiquidityLevel {
  id: string;
  label: 'PDH' | 'PDL' | 'PWH' | 'PWL';
  price: number;
  fromTime: number;
  toTime: number;
  kind: 'high' | 'low';
  color: string;
}

export interface SessionKillzone {
  id: string;
  name: 'Asia' | 'London' | 'NY';
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  color: string;
}

export interface SessionsAndLiquidityResult {
  levels: LiquidityLevel[];
  sessions: SessionKillzone[];
}

export interface SupportResistanceZone {
  price: number;
  kind: 'support' | 'resistance';
  touches: number;
  strength: 'major' | 'minor';
  lastTouchTime: number;
}

export interface VolumeProfileBucket {
  priceLow: number;
  priceHigh: number;
  priceMid: number;
  upVolume: number;
  downVolume: number;
  totalVolume: number;
  inValueArea: boolean;
  isPoc: boolean;
}

export interface VolumeProfileResult {
  buckets: VolumeProfileBucket[];
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  maxBucketVolume: number;
}

export interface SmcStructureBreak {
  kind: 'BOS' | 'CHoCH';
  direction: 'bullish' | 'bearish';
  fromTime: number;
  toTime: number;
  price: number;
}

export interface SmcZone {
  id: string;
  kind: 'FVG' | 'OB';
  direction: 'bullish' | 'bearish';
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
  mitigated: boolean;
}

export interface SmartMoneyResult {
  structures: SmcStructureBreak[];
  zones: SmcZone[];
}

function quickAtr(bars: OHLCVBar[], period = 14): number {
  if (bars.length < 2) return (bars[0]?.close ?? 100) * 0.015;
  const slice = bars.slice(-Math.max(3, period + 1));
  let sum = 0;
  let count = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const tr = Math.max(
      slice[i].high - slice[i].low,
      Math.abs(slice[i].high - slice[i - 1].close),
      Math.abs(slice[i].low - slice[i - 1].close),
    );
    sum += tr;
    count += 1;
  }
  return count > 0 ? sum / count : slice[slice.length - 1].close * 0.015;
}

/**
 * Clustered Fractal Swing Support & Resistance Detector.
 * Uses 5-bar pivot fractals grouped within 0.6 * ATR(14) and ranked by touch count + recency.
 */
export function computeClusteredSupportResistance(
  bars: OHLCVBar[],
  maxLevelsPerSide = 3,
): SupportResistanceZone[] {
  if (bars.length < 7) return [];
  const atr = Math.max(1e-6, quickAtr(bars, 14));
  const tol = atr * 0.65;
  const lastClose = bars[bars.length - 1].close;

  interface RawPivot {
    price: number;
    time: number;
  }
  const pivots: RawPivot[] = [];
  const start = Math.max(2, bars.length - 180);
  for (let i = start; i < bars.length - 2; i += 1) {
    const h = bars[i].high;
    const l = bars[i].low;
    if (
      h >= bars[i - 1].high &&
      h >= bars[i - 2].high &&
      h >= bars[i + 1].high &&
      h >= bars[i + 2].high
    ) {
      pivots.push({ price: h, time: bars[i].time });
    }
    if (
      l <= bars[i - 1].low &&
      l <= bars[i - 2].low &&
      l <= bars[i + 1].low &&
      l <= bars[i + 2].low
    ) {
      pivots.push({ price: l, time: bars[i].time });
    }
  }

  interface Cluster {
    sum: number;
    touches: number;
    lastTime: number;
  }
  const clusters: Cluster[] = [];
  for (const p of pivots) {
    const existing = clusters.find((c) => Math.abs(c.sum / c.touches - p.price) <= tol);
    if (existing) {
      existing.sum += p.price;
      existing.touches += 1;
      existing.lastTime = Math.max(existing.lastTime, p.time);
    } else {
      clusters.push({ sum: p.price, touches: 1, lastTime: p.time });
    }
  }

  const zones: SupportResistanceZone[] = clusters.map((c) => {
    const avg = c.sum / c.touches;
    return {
      price: Number(avg.toFixed(avg < 10 ? 4 : 2)),
      kind: avg >= lastClose ? 'resistance' : 'support',
      touches: c.touches,
      strength: c.touches >= 3 ? 'major' : 'minor',
      lastTouchTime: c.lastTime,
    };
  });

  const supports = zones
    .filter((z) => z.kind === 'support')
    .sort((a, b) => b.touches - a.touches || b.price - a.price)
    .slice(0, maxLevelsPerSide);
  const resistances = zones
    .filter((z) => z.kind === 'resistance')
    .sort((a, b) => b.touches - a.touches || a.price - b.price)
    .slice(0, maxLevelsPerSide);

  if (supports.length === 0) {
    const low = Math.min(...bars.slice(-60).map((b) => b.low));
    supports.push({
      price: Number(low.toFixed(low < 10 ? 4 : 2)),
      kind: 'support',
      touches: 1,
      strength: 'major',
      lastTouchTime: bars[bars.length - 1].time,
    });
  }
  if (resistances.length === 0) {
    const high = Math.max(...bars.slice(-60).map((b) => b.high));
    resistances.push({
      price: Number(high.toFixed(high < 10 ? 4 : 2)),
      kind: 'resistance',
      touches: 1,
      strength: 'major',
      lastTouchTime: bars[bars.length - 1].time,
    });
  }

  return [...resistances, ...supports];
}

/**
 * Visible-Range Volume Profile (VPVR) matching TradingView's `line-tool-volume-profile`:
 * Computes Up/Down volume distribution across price rows, POC, and 70% Value Area (VAH/VAL).
 */
export function computeVolumeProfile(
  bars: OHLCVBar[],
  bucketCount = 24,
): VolumeProfileResult | null {
  if (bars.length < 3) return null;
  const n = Math.max(8, Math.min(60, Math.floor(bucketCount)));
  let minLow = Infinity;
  let maxHigh = -Infinity;
  for (const b of bars) {
    if (b.low < minLow) minLow = b.low;
    if (b.high > maxHigh) maxHigh = b.high;
  }
  const span = maxHigh - minLow;
  if (!(span > 0)) return null;
  const step = span / n;

  const buckets: VolumeProfileBucket[] = Array.from({ length: n }, (_, idx) => {
    const priceLow = minLow + idx * step;
    const priceHigh = priceLow + step;
    return {
      priceLow,
      priceHigh,
      priceMid: (priceLow + priceHigh) / 2,
      upVolume: 0,
      downVolume: 0,
      totalVolume: 0,
      inValueArea: false,
      isPoc: false,
    };
  });

  let totalAllVolume = 0;
  for (const b of bars) {
    const vol = Math.max(0, b.volume);
    if (vol === 0) continue;
    totalAllVolume += vol;
    const isUp = b.close >= b.open;
    const startIdx = Math.max(0, Math.min(n - 1, Math.floor((b.low - minLow) / step)));
    const endIdx = Math.max(0, Math.min(n - 1, Math.floor((b.high - minLow) / step)));
    const covered = endIdx - startIdx + 1;
    const share = vol / covered;
    for (let k = startIdx; k <= endIdx; k += 1) {
      if (isUp) buckets[k].upVolume += share;
      else buckets[k].downVolume += share;
      buckets[k].totalVolume += share;
    }
  }

  let pocIdx = 0;
  let maxBucketVolume = 0;
  for (let i = 0; i < n; i += 1) {
    if (buckets[i].totalVolume > maxBucketVolume) {
      maxBucketVolume = buckets[i].totalVolume;
      pocIdx = i;
    }
  }
  buckets[pocIdx].isPoc = true;
  buckets[pocIdx].inValueArea = true;

  // Expand outward from POC until 70% of total volume is captured (standard TradingView VA=70%)
  const targetVaVol = totalAllVolume * 0.7;
  let capturedVol = buckets[pocIdx].totalVolume;
  let loIdx = pocIdx;
  let hiIdx = pocIdx;
  while (capturedVol < targetVaVol && (loIdx > 0 || hiIdx < n - 1)) {
    const nextBelow = loIdx > 0 ? buckets[loIdx - 1].totalVolume : -1;
    const nextAbove = hiIdx < n - 1 ? buckets[hiIdx + 1].totalVolume : -1;
    if (nextAbove >= nextBelow && hiIdx < n - 1) {
      hiIdx += 1;
      buckets[hiIdx].inValueArea = true;
      capturedVol += buckets[hiIdx].totalVolume;
    } else if (loIdx > 0) {
      loIdx -= 1;
      buckets[loIdx].inValueArea = true;
      capturedVol += buckets[loIdx].totalVolume;
    } else {
      break;
    }
  }

  return {
    buckets,
    pocPrice: buckets[pocIdx].priceMid,
    vahPrice: buckets[hiIdx].priceHigh,
    valPrice: buckets[loIdx].priceLow,
    maxBucketVolume: Math.max(1e-6, maxBucketVolume),
  };
}

/**
 * Smart Money Concepts (SMC) Engine:
 * Detects Break of Structure (BOS), Change of Character (CHoCH), Fair Value Gaps (FVG),
 * and institutional Order Blocks (OB).
 */
export function computeSmartMoneyConcepts(bars: OHLCVBar[]): SmartMoneyResult {
  const structures: SmcStructureBreak[] = [];
  const zones: SmcZone[] = [];
  if (bars.length < 10) return { structures, zones };

  const atr = Math.max(1e-6, quickAtr(bars, 14));
  const lastTime = bars[bars.length - 1].time;
  const startIdx = Math.max(3, bars.length - 140);

  let lastSwingHigh: { price: number; time: number } | null = null;
  let lastSwingLow: { price: number; time: number } | null = null;
  let trend: 'bullish' | 'bearish' | null = null;

  for (let i = startIdx; i < bars.length; i += 1) {
    // Confirm 2-bar lagged swing pivot at i - 2 (zero lookahead!)
    const pIdx = i - 2;
    if (pIdx >= 2) {
      const ph = bars[pIdx].high;
      const pl = bars[pIdx].low;
      if (
        ph > bars[pIdx - 1].high &&
        ph >= bars[pIdx - 2].high &&
        ph > bars[pIdx + 1].high &&
        ph >= bars[pIdx + 2].high
      ) {
        lastSwingHigh = { price: ph, time: bars[pIdx].time };
      }
      if (
        pl < bars[pIdx - 1].low &&
        pl <= bars[pIdx - 2].low &&
        pl < bars[pIdx + 1].low &&
        pl <= bars[pIdx + 2].low
      ) {
        lastSwingLow = { price: pl, time: bars[pIdx].time };
      }
    }

    const bar = bars[i];
    if (lastSwingHigh && bar.close > lastSwingHigh.price) {
      structures.push({
        kind: trend === 'bearish' ? 'CHoCH' : 'BOS',
        direction: 'bullish',
        fromTime: lastSwingHigh.time,
        toTime: bar.time,
        price: lastSwingHigh.price,
      });
      trend = 'bullish';
      lastSwingHigh = null;
    } else if (lastSwingLow && bar.close < lastSwingLow.price) {
      structures.push({
        kind: trend === 'bullish' ? 'CHoCH' : 'BOS',
        direction: 'bearish',
        fromTime: lastSwingLow.time,
        toTime: bar.time,
        price: lastSwingLow.price,
      });
      trend = 'bearish';
      lastSwingLow = null;
    }

    // 3-Candle Fair Value Gaps (FVG)
    if (i >= 2) {
      const b0 = bars[i - 2];
      const b1 = bars[i - 1];
      const b2 = bars[i];
      if (b2.low > b0.high && b2.low - b0.high >= atr * 0.18 && b1.close > b1.open) {
        let mitigated = false;
        for (let m = i + 1; m < bars.length; m += 1) {
          if (bars[m].low <= b0.high) {
            mitigated = true;
            break;
          }
        }
        zones.push({
          id: `fvg-bull-${b1.time}`,
          kind: 'FVG',
          direction: 'bullish',
          startTime: b0.time,
          endTime: lastTime,
          top: b2.low,
          bottom: b0.high,
          mitigated,
        });
      } else if (b2.high < b0.low && b0.low - b2.high >= atr * 0.18 && b1.close < b1.open) {
        let mitigated = false;
        for (let m = i + 1; m < bars.length; m += 1) {
          if (bars[m].high >= b0.low) {
            mitigated = true;
            break;
          }
        }
        zones.push({
          id: `fvg-bear-${b1.time}`,
          kind: 'FVG',
          direction: 'bearish',
          startTime: b0.time,
          endTime: lastTime,
          top: b0.low,
          bottom: b2.high,
          mitigated,
        });
      }
    }

    // Displacement Order Blocks (last opposing candle before >= 1.4x ATR impulse)
    if (i >= 1) {
      const prev = bars[i - 1];
      const body = Math.abs(bar.close - bar.open);
      if (body >= atr * 1.4) {
        if (bar.close > bar.open && prev.close < prev.open) {
          let mitigated = false;
          for (let m = i + 1; m < bars.length; m += 1) {
            if (bars[m].close < prev.low) {
              mitigated = true;
              break;
            }
          }
          zones.push({
            id: `ob-bull-${prev.time}`,
            kind: 'OB',
            direction: 'bullish',
            startTime: prev.time,
            endTime: lastTime,
            top: prev.open,
            bottom: prev.low,
            mitigated,
          });
        } else if (bar.close < bar.open && prev.close > prev.open) {
          let mitigated = false;
          for (let m = i + 1; m < bars.length; m += 1) {
            if (bars[m].close > prev.high) {
              mitigated = true;
              break;
            }
          }
          zones.push({
            id: `ob-bear-${prev.time}`,
            kind: 'OB',
            direction: 'bearish',
            startTime: prev.time,
            endTime: lastTime,
            top: prev.high,
            bottom: prev.open,
            mitigated,
          });
        }
      }
    }
  }

  const activeZones = zones.filter((z) => !z.mitigated).slice(-8);
  return {
    structures: structures.slice(-8),
    zones: activeZones.length > 0 ? activeZones : zones.slice(-6),
  };
}

/**
 * Institutional Session Killzones & Key Liquidity Draws (PDH / PDL / PWH / PWL):
 * - Computes Previous Day High/Low (PDH/PDL) and Previous Week High/Low (PWH/PWL)
 *   from UTC calendar boundaries in `bars`.
 * - On intraday timeframes (`1m`, `5m`, `15m`, `1h`, `4h`), computes Asia (00:00–07:00 UTC),
 *   London (07:00–13:00 UTC), and New York (13:00–20:00 UTC) range boxes across recent days.
 */
export function computeSessionAndLiquidityLevels(
  bars: OHLCVBar[],
  timeframe: Timeframe,
): SessionsAndLiquidityResult {
  if (bars.length < 4) {
    return { levels: [], sessions: [] };
  }

  const lastTime = bars[bars.length - 1].time;
  const levels: LiquidityLevel[] = [];
  const sessions: SessionKillzone[] = [];

  // Group bars by UTC day & ISO week (1970-01-01 was Thursday -> +345600s aligns Monday 00:00 UTC)
  interface BucketStats {
    key: number;
    high: number;
    low: number;
    firstTime: number;
  }
  const dayBuckets: BucketStats[] = [];
  const weekBuckets: BucketStats[] = [];

  const scanStart = Math.max(0, bars.length - 3000);
  for (let i = scanStart; i < bars.length; i += 1) {
    const b = bars[i];
    const dayKey = Math.floor(b.time / 86400);
    const weekKey = Math.floor((b.time + 345600) / 604800);

    const lastDay = dayBuckets[dayBuckets.length - 1];
    if (!lastDay || lastDay.key !== dayKey) {
      dayBuckets.push({ key: dayKey, high: b.high, low: b.low, firstTime: b.time });
    } else {
      if (b.high > lastDay.high) lastDay.high = b.high;
      if (b.low < lastDay.low) lastDay.low = b.low;
    }

    const lastWeek = weekBuckets[weekBuckets.length - 1];
    if (!lastWeek || lastWeek.key !== weekKey) {
      weekBuckets.push({ key: weekKey, high: b.high, low: b.low, firstTime: b.time });
    } else {
      if (b.high > lastWeek.high) lastWeek.high = b.high;
      if (b.low < lastWeek.low) lastWeek.low = b.low;
    }
  }

  if (dayBuckets.length >= 2) {
    const prevDay = dayBuckets[dayBuckets.length - 2];
    levels.push(
      {
        id: `pdh-${prevDay.key}`,
        label: 'PDH',
        price: prevDay.high,
        fromTime: prevDay.firstTime,
        toTime: lastTime,
        kind: 'high',
        color: '#f59e0b',
      },
      {
        id: `pdl-${prevDay.key}`,
        label: 'PDL',
        price: prevDay.low,
        fromTime: prevDay.firstTime,
        toTime: lastTime,
        kind: 'low',
        color: '#089981',
      },
    );
  }

  if (weekBuckets.length >= 2) {
    const prevWeek = weekBuckets[weekBuckets.length - 2];
    levels.push(
      {
        id: `pwh-${prevWeek.key}`,
        label: 'PWH',
        price: prevWeek.high,
        fromTime: prevWeek.firstTime,
        toTime: lastTime,
        kind: 'high',
        color: '#a855f7',
      },
      {
        id: `pwl-${prevWeek.key}`,
        label: 'PWL',
        price: prevWeek.low,
        fromTime: prevWeek.firstTime,
        toTime: lastTime,
        kind: 'low',
        color: '#2962ff',
      },
    );
  }

  const isIntraday =
    timeframe === '1m' ||
    timeframe === '5m' ||
    timeframe === '15m' ||
    timeframe === '1h' ||
    timeframe === '4h';

  if (isIntraday && dayBuckets.length > 0) {
    const recentDayKeys = new Set(dayBuckets.slice(-3).map((d) => d.key));
    const sessionDefs: ReadonlyArray<{
      name: 'Asia' | 'London' | 'NY';
      startHour: number;
      endHour: number;
      color: string;
    }> = [
      { name: 'Asia', startHour: 0, endHour: 7, color: '#06b6d4' },
      { name: 'London', startHour: 7, endHour: 13, color: '#f59e0b' },
      { name: 'NY', startHour: 13, endHour: 20, color: '#2962ff' },
    ];

    const recentBars = bars.filter((b) => recentDayKeys.has(Math.floor(b.time / 86400)));
    for (const day of dayBuckets.slice(-3)) {
      const dayBars = recentBars.filter((b) => Math.floor(b.time / 86400) === day.key);
      for (const def of sessionDefs) {
        const sBars = dayBars.filter((b) => {
          const hr = Math.floor((b.time % 86400) / 3600);
          return hr >= def.startHour && hr < def.endHour;
        });
        if (sBars.length >= 2) {
          let sHigh = -Infinity;
          let sLow = Infinity;
          for (const sb of sBars) {
            if (sb.high > sHigh) sHigh = sb.high;
            if (sb.low < sLow) sLow = sb.low;
          }
          sessions.push({
            id: `sess-${day.key}-${def.name}`,
            name: def.name,
            startTime: sBars[0].time,
            endTime: sBars[sBars.length - 1].time,
            high: sHigh,
            low: sLow,
            color: def.color,
          });
        }
      }
    }
  }

  return {
    levels,
    sessions: sessions.slice(-9),
  };
}
