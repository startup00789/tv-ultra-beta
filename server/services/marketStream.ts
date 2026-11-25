import type {
  LiveBarTickEvent,
  LiveQuoteTickEvent,
  LiveStreamStatusEvent,
  Timeframe,
} from '../../shared/types.js';
import {
  getBinanceInterval,
  getSymbolPrecision,
  getYahooTicker,
  isCryptoTicker,
  resolveCanonicalFromYahoo,
  resolveSymbol,
} from './marketData.js';

export interface DecodedYahooPricing {
  id: string;
  price: number;
  time?: number;
  change?: number;
  changePercent?: number;
  dayVolume?: number;
  dayHigh?: number;
  dayLow?: number;
  bid?: number;
  ask?: number;
  marketHours?: number;
}

export interface MarketStreamSessionOptions {
  symbol: string;
  timeframe: Timeframe;
  watchlist: string[];
  onStatus: (ev: LiveStreamStatusEvent) => void;
  onBar: (ev: LiveBarTickEvent) => void;
  onQuote: (ev: LiveQuoteTickEvent) => void;
}

const MAX_WATCHLIST_STREAM_SYMBOLS = 30;
const AGG_TRADE_THROTTLE_MS = 120;
const BOOK_TICKER_THROTTLE_MS = 300;
const RECONNECT_BACKOFF_MS = [1000, 2000, 5000] as const;

const activeSessions = new Set<{ close: () => void }>();

export function closeAllMarketStreams(): void {
  for (const session of Array.from(activeSessions)) {
    session.close();
  }
  activeSessions.clear();
}

function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function decodeZigZag64(val: bigint): number {
  return Number((val >> 1n) ^ -(val & 1n));
}

/**
 * Zero-dependency protobuf wire decoder for Yahoo Finance WebSocket PricingData messages.
 */
export function decodeYahooPricingData(base64Payload: string): DecodedYahooPricing | null {
  const trimmed = base64Payload.trim();
  if (!trimmed) return null;

  let buf: Buffer;
  try {
    buf = Buffer.from(trimmed, 'base64');
  } catch {
    return null;
  }
  if (buf.length < 4) return null;

  let offset = 0;
  const readVarint = (): bigint | null => {
    let result = 0n;
    let shift = 0n;
    while (offset < buf.length && shift <= 63n) {
      const byte = buf[offset++];
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
    }
    return null;
  };

  let id = '';
  let price = NaN;
  let time: number | undefined;
  let change: number | undefined;
  let changePercent: number | undefined;
  let dayVolume: number | undefined;
  let dayHigh: number | undefined;
  let dayLow: number | undefined;
  let bid: number | undefined;
  let ask: number | undefined;
  let marketHours: number | undefined;

  while (offset < buf.length) {
    const tagRaw = readVarint();
    if (tagRaw === null) break;
    const tag = Number(tagRaw);
    const field = tag >>> 3;
    const wire = tag & 0x07;

    if (wire === 0) {
      const val = readVarint();
      if (val === null) break;
      if (field === 3) {
        time = decodeZigZag64(val);
      } else if (field === 9) {
        dayVolume = decodeZigZag64(val);
      } else if (field === 17) {
        marketHours = Number(val);
      }
    } else if (wire === 1) {
      if (offset + 8 > buf.length) break;
      offset += 8;
    } else if (wire === 2) {
      const lenRaw = readVarint();
      if (lenRaw === null) break;
      const len = Number(lenRaw);
      if (len < 0 || offset + len > buf.length) break;
      if (field === 1) {
        id = buf.subarray(offset, offset + len).toString('utf8').trim();
      }
      offset += len;
    } else if (wire === 5) {
      if (offset + 4 > buf.length) break;
      const f = buf.readFloatLE(offset);
      offset += 4;
      if (!Number.isFinite(f)) continue;
      if (field === 2) price = f;
      else if (field === 8) changePercent = f;
      else if (field === 10) dayHigh = f;
      else if (field === 11) dayLow = f;
      else if (field === 12) change = f;
      else if (field === 23) bid = f;
      else if (field === 25) ask = f;
    } else {
      break;
    }
  }

  if (!id || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    id,
    price,
    time,
    change,
    changePercent,
    dayVolume,
    dayHigh,
    dayLow,
    bid,
    ask,
    marketHours,
  };
}

export function yahooPricingToQuoteEvent(pricing: DecodedYahooPricing): LiveQuoteTickEvent {
  const symbol = resolveCanonicalFromYahoo(pricing.id);
  const precision = getSymbolPrecision(symbol, pricing.price);
  const updatedAt =
    pricing.time && Number.isFinite(pricing.time) && pricing.time > 1_000_000_000_000
      ? new Date(pricing.time).toISOString()
      : new Date().toISOString();

  const ev: LiveQuoteTickEvent = {
    symbol,
    last: roundTo(pricing.price, precision),
    updatedAt,
  };

  if (pricing.change !== undefined && Number.isFinite(pricing.change)) {
    ev.change = roundTo(pricing.change, precision);
  }
  if (pricing.changePercent !== undefined && Number.isFinite(pricing.changePercent)) {
    ev.changePercent = roundTo(pricing.changePercent, 2);
  }
  if (pricing.bid !== undefined && Number.isFinite(pricing.bid) && pricing.bid > 0) {
    ev.bid = roundTo(pricing.bid, precision);
  }
  if (pricing.ask !== undefined && Number.isFinite(pricing.ask) && pricing.ask > 0) {
    ev.ask = roundTo(pricing.ask, precision);
  }
  if (pricing.dayVolume !== undefined && Number.isFinite(pricing.dayVolume) && pricing.dayVolume > 0) {
    ev.volume = Math.round(pricing.dayVolume);
  }
  if (pricing.dayHigh !== undefined && Number.isFinite(pricing.dayHigh) && pricing.dayHigh > 0) {
    ev.dayHigh = roundTo(pricing.dayHigh, precision);
  }
  if (pricing.dayLow !== undefined && Number.isFinite(pricing.dayLow) && pricing.dayLow > 0) {
    ev.dayLow = roundTo(pricing.dayLow, precision);
  }
  if (pricing.marketHours !== undefined) {
    ev.marketOpen = pricing.marketHours === 1;
  }

  return ev;
}

interface BinanceKlinePayload {
  t?: number;
  s?: string;
  o?: string;
  c?: string;
  h?: string;
  l?: string;
  v?: string;
  x?: boolean;
}

interface BinanceCombinedPayload {
  stream?: string;
  data?: {
    e?: string;
    s?: string;
    k?: BinanceKlinePayload;
    p?: string;
    q?: string;
    c?: string;
    o?: string;
    h?: string;
    l?: string;
    v?: string;
    b?: string;
    a?: string;
  };
}

export function parseBinanceCombinedMessage(
  rawJson: string,
  activeSymbol: string,
  activeTimeframe: Timeframe,
): { barEvent?: LiveBarTickEvent; quoteEvent?: LiveQuoteTickEvent } | null {
  let parsed: BinanceCombinedPayload;
  try {
    parsed = JSON.parse(rawJson) as BinanceCombinedPayload;
  } catch {
    return null;
  }

  const stream = parsed?.stream ?? '';
  const data = parsed?.data;
  if (!data || typeof data !== 'object') return null;

  const nowIso = new Date().toISOString();

  if (data.e === 'kline' && data.k) {
    const k = data.k;
    const rawSym = typeof k.s === 'string' ? k.s.toUpperCase() : '';
    const canonical = resolveSymbol(rawSym) ?? rawSym;
    if (!canonical) return null;

    const time = Math.floor(Number(k.t) / 1000);
    const openRaw = Number(k.o);
    const highRaw = Number(k.h);
    const lowRaw = Number(k.l);
    const closeRaw = Number(k.c);
    const volRaw = Math.max(1, Math.round(Number(k.v) || 1));
    if (
      !Number.isFinite(time) ||
      !Number.isFinite(openRaw) ||
      !Number.isFinite(highRaw) ||
      !Number.isFinite(lowRaw) ||
      !Number.isFinite(closeRaw) ||
      openRaw <= 0 ||
      closeRaw <= 0
    ) {
      return null;
    }

    const precision = getSymbolPrecision(canonical, closeRaw);
    const open = roundTo(openRaw, precision);
    const close = roundTo(closeRaw, precision);
    const high = Math.max(roundTo(highRaw, precision), open, close);
    const low = Math.min(roundTo(lowRaw, precision), open, close);

    const quoteEvent: LiveQuoteTickEvent = {
      symbol: canonical,
      last: close,
      marketOpen: true,
      source: 'trade',
      updatedAt: nowIso,
    };

    const resolvedActive = resolveSymbol(activeSymbol) ?? activeSymbol.trim().toUpperCase();
    if (canonical === resolvedActive) {
      return {
        barEvent: {
          symbol: canonical,
          timeframe: activeTimeframe,
          bar: { time, open, high, low, close, volume: volRaw },
          isClosed: Boolean(k.x),
        },
        quoteEvent,
      };
    }
    return { quoteEvent };
  }

  if (data.e === 'aggTrade') {
    const rawSym = typeof data.s === 'string' ? data.s.toUpperCase() : '';
    const canonical = resolveSymbol(rawSym) ?? rawSym;
    const priceRaw = Number(data.p);
    if (!canonical || !Number.isFinite(priceRaw) || priceRaw <= 0) {
      return null;
    }
    const precision = getSymbolPrecision(canonical, priceRaw);
    return {
      quoteEvent: {
        symbol: canonical,
        last: roundTo(priceRaw, precision),
        marketOpen: true,
        source: 'trade',
        updatedAt: nowIso,
      },
    };
  }

  if (data.e === '24hrMiniTicker') {
    const rawSym = typeof data.s === 'string' ? data.s.toUpperCase() : '';
    const canonical = resolveSymbol(rawSym) ?? rawSym;
    const lastRaw = Number(data.c);
    const openRaw = Number(data.o);
    const highRaw = Number(data.h);
    const lowRaw = Number(data.l);
    const volRaw = Number(data.v);
    if (!canonical || !Number.isFinite(lastRaw) || lastRaw <= 0) {
      return null;
    }

    const precision = getSymbolPrecision(canonical, lastRaw);
    const last = roundTo(lastRaw, precision);
    const change =
      Number.isFinite(openRaw) && openRaw > 0 ? roundTo(last - openRaw, precision) : undefined;
    const changePercent =
      Number.isFinite(openRaw) && openRaw > 0
        ? roundTo(((last - openRaw) / openRaw) * 100, 2)
        : undefined;

    return {
      quoteEvent: {
        symbol: canonical,
        last,
        change,
        changePercent,
        dayHigh: Number.isFinite(highRaw) && highRaw > 0 ? roundTo(highRaw, precision) : undefined,
        dayLow: Number.isFinite(lowRaw) && lowRaw > 0 ? roundTo(lowRaw, precision) : undefined,
        volume: Number.isFinite(volRaw) && volRaw > 0 ? Math.round(volRaw) : undefined,
        marketOpen: true,
        source: 'ticker',
        updatedAt: nowIso,
      },
    };
  }

  if (stream.endsWith('@bookTicker') || (typeof data.b === 'string' && typeof data.a === 'string')) {
    const rawSym = typeof data.s === 'string' ? data.s.toUpperCase() : '';
    const canonical = resolveSymbol(rawSym) ?? rawSym;
    const bidRaw = Number(data.b);
    const askRaw = Number(data.a);
    if (
      !canonical ||
      !Number.isFinite(bidRaw) ||
      !Number.isFinite(askRaw) ||
      bidRaw <= 0 ||
      askRaw <= 0
    ) {
      return null;
    }
    const precision = getSymbolPrecision(canonical, bidRaw);
    const bid = roundTo(bidRaw, precision);
    const ask = roundTo(askRaw, precision);
    return {
      quoteEvent: {
        symbol: canonical,
        bid,
        ask,
        marketOpen: true,
        source: 'book',
        updatedAt: nowIso,
      },
    };
  }

  return null;
}

export function createMarketStreamSession(
  options: MarketStreamSessionOptions,
): { close: () => void } {
  const activeSymbol =
    resolveSymbol(options.symbol) ?? options.symbol.trim().toUpperCase();
  const timeframe = options.timeframe;

  const uniqueSymbols = new Set<string>([activeSymbol]);
  for (const raw of options.watchlist) {
    if (uniqueSymbols.size >= MAX_WATCHLIST_STREAM_SYMBOLS) break;
    const sym = resolveSymbol(raw) ?? raw.trim().toUpperCase();
    if (sym) uniqueSymbols.add(sym);
  }

  const cryptoSymbols: string[] = [];
  const yahooTickers: string[] = [];
  const seenYahoo = new Set<string>();

  for (const sym of uniqueSymbols) {
    if (isCryptoTicker(sym)) {
      cryptoSymbols.push(sym);
    } else {
      const yahooSym = getYahooTicker(sym);
      if (yahooSym && !seenYahoo.has(yahooSym)) {
        seenYahoo.add(yahooSym);
        yahooTickers.push(yahooSym);
      }
    }
  }

  let closed = false;
  let binanceWs: WebSocket | null = null;
  let yahooWs: WebSocket | null = null;
  let binanceReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let yahooReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let binanceAttempt = 0;
  let yahooAttempt = 0;

  let binanceConnected = false;
  let yahooConnected = false;
  const lastTradeEmitBySym = new Map<string, number>();
  const lastBookEmitBySym = new Map<string, number>();

  const emitStatus = () => {
    if (closed) return;
    const providers: Array<'binance' | 'yahoo'> = [];
    if (binanceConnected) providers.push('binance');
    if (yahooConnected) providers.push('yahoo');
    options.onStatus({
      connected: providers.length > 0,
      providers,
      timestamp: new Date().toISOString(),
    });
  };

  const connectBinance = () => {
    if (closed || cryptoSymbols.length === 0 || typeof WebSocket === 'undefined') return;

    const streams: string[] = [];
    if (isCryptoTicker(activeSymbol)) {
      const interval = getBinanceInterval(timeframe);
      streams.push(`${activeSymbol.toLowerCase()}@kline_${interval}`);
      streams.push(`${activeSymbol.toLowerCase()}@aggTrade`);
      streams.push(`${activeSymbol.toLowerCase()}@bookTicker`);
    }
    for (const sym of cryptoSymbols) {
      streams.push(`${sym.toLowerCase()}@miniTicker`);
    }

    const uniqueStreams = Array.from(new Set(streams));
    const url = `wss://data-stream.binance.vision/stream?streams=${uniqueStreams.join('/')}`;

    try {
      const ws = new WebSocket(url);
      binanceWs = ws;

      ws.addEventListener('open', () => {
        if (closed) {
          ws.close();
          return;
        }
        binanceAttempt = 0;
        binanceConnected = true;
        emitStatus();
      });

      ws.addEventListener('message', (event) => {
        if (closed) return;
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        const parsed = parseBinanceCombinedMessage(raw, activeSymbol, timeframe);
        if (!parsed) return;

        if (parsed.barEvent) {
          options.onBar(parsed.barEvent);
          if (parsed.quoteEvent) {
            options.onQuote(parsed.quoteEvent);
          }
          return;
        }

        if (parsed.quoteEvent) {
          const now = Date.now();
          if (parsed.quoteEvent.source === 'book') {
            const lastEmit = lastBookEmitBySym.get(parsed.quoteEvent.symbol) ?? 0;
            if (now - lastEmit < BOOK_TICKER_THROTTLE_MS) {
              return;
            }
            lastBookEmitBySym.set(parsed.quoteEvent.symbol, now);
          } else if (parsed.quoteEvent.source === 'trade') {
            const lastEmit = lastTradeEmitBySym.get(parsed.quoteEvent.symbol) ?? 0;
            if (now - lastEmit < AGG_TRADE_THROTTLE_MS) {
              return;
            }
            lastTradeEmitBySym.set(parsed.quoteEvent.symbol, now);
          }
          options.onQuote(parsed.quoteEvent);
        }
      });

      ws.addEventListener('error', () => {
        // Reconnect handled by close listener
      });

      ws.addEventListener('close', () => {
        if (binanceWs === ws) binanceWs = null;
        binanceConnected = false;
        emitStatus();
        if (!closed) {
          const delay =
            RECONNECT_BACKOFF_MS[Math.min(binanceAttempt, RECONNECT_BACKOFF_MS.length - 1)];
          binanceAttempt += 1;
          binanceReconnectTimer = setTimeout(connectBinance, delay);
        }
      });
    } catch {
      if (!closed) {
        const delay =
          RECONNECT_BACKOFF_MS[Math.min(binanceAttempt, RECONNECT_BACKOFF_MS.length - 1)];
        binanceAttempt += 1;
        binanceReconnectTimer = setTimeout(connectBinance, delay);
      }
    }
  };

  const connectYahoo = () => {
    if (closed || yahooTickers.length === 0 || typeof WebSocket === 'undefined') return;

    try {
      const ws = new WebSocket('wss://streamer.finance.yahoo.com');
      yahooWs = ws;

      ws.addEventListener('open', () => {
        if (closed) {
          ws.close();
          return;
        }
        yahooAttempt = 0;
        yahooConnected = true;
        try {
          ws.send(JSON.stringify({ subscribe: yahooTickers }));
        } catch {
          // Ignore send failure on closing socket
        }
        emitStatus();
      });

      ws.addEventListener('message', (event) => {
        if (closed) return;
        const decoded = decodeYahooPricingData(String(event.data));
        if (!decoded) return;
        options.onQuote(yahooPricingToQuoteEvent(decoded));
      });

      ws.addEventListener('error', () => {
        // Reconnect handled by close listener
      });

      ws.addEventListener('close', () => {
        if (yahooWs === ws) yahooWs = null;
        yahooConnected = false;
        emitStatus();
        if (!closed) {
          const delay =
            RECONNECT_BACKOFF_MS[Math.min(yahooAttempt, RECONNECT_BACKOFF_MS.length - 1)];
          yahooAttempt += 1;
          yahooReconnectTimer = setTimeout(connectYahoo, delay);
        }
      });
    } catch {
      if (!closed) {
        const delay =
          RECONNECT_BACKOFF_MS[Math.min(yahooAttempt, RECONNECT_BACKOFF_MS.length - 1)];
        yahooAttempt += 1;
        yahooReconnectTimer = setTimeout(connectYahoo, delay);
      }
    }
  };

  connectBinance();
  connectYahoo();

  const session = {
    close: () => {
      if (closed) return;
      closed = true;
      activeSessions.delete(session);
      if (binanceReconnectTimer) {
        clearTimeout(binanceReconnectTimer);
        binanceReconnectTimer = null;
      }
      if (yahooReconnectTimer) {
        clearTimeout(yahooReconnectTimer);
        yahooReconnectTimer = null;
      }
      try {
        binanceWs?.close();
      } catch {
        // Ignore close errors
      }
      try {
        yahooWs?.close();
      } catch {
        // Ignore close errors
      }
      binanceWs = null;
      yahooWs = null;
    },
  };

  activeSessions.add(session);
  return session;
}
