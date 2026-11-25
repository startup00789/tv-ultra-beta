import type {
  LiveBarTickEvent,
  LiveQuoteTickEvent,
  LiveStreamStatusEvent,
  MarketStreamStatus,
  Timeframe,
} from '../../shared/types';

export interface MarketStreamSubscriptionOptions {
  symbol: string;
  timeframe: Timeframe;
  watchlist: string[];
  onStatus: (status: MarketStreamStatus, ev?: LiveStreamStatusEvent) => void;
  onBar: (ev: LiveBarTickEvent) => void;
  onQuote: (ev: LiveQuoteTickEvent) => void;
}

export function subscribeMarketStream(
  options: MarketStreamSubscriptionOptions,
): () => void {
  if (typeof globalThis.EventSource === 'undefined') {
    return () => {};
  }

  const qs = new URLSearchParams({
    symbol: options.symbol,
    timeframe: options.timeframe,
  });
  if (options.watchlist.length > 0) {
    qs.set('watchlist', options.watchlist.join(','));
  }

  let closed = false;
  options.onStatus('connecting');

  const es = new globalThis.EventSource(`/api/market/stream?${qs.toString()}`);

  es.addEventListener('status', (ev) => {
    if (closed) return;
    try {
      const parsed = JSON.parse((ev as MessageEvent<string>).data) as LiveStreamStatusEvent;
      options.onStatus(parsed.connected ? 'live' : 'connecting', parsed);
    } catch {
      // Ignore malformed status event
    }
  });

  es.addEventListener('bar', (ev) => {
    if (closed) return;
    try {
      const parsed = JSON.parse((ev as MessageEvent<string>).data) as LiveBarTickEvent;
      options.onBar(parsed);
    } catch {
      // Ignore malformed bar tick
    }
  });

  es.addEventListener('quote', (ev) => {
    if (closed) return;
    try {
      const parsed = JSON.parse((ev as MessageEvent<string>).data) as LiveQuoteTickEvent;
      options.onQuote(parsed);
    } catch {
      // Ignore malformed quote tick
    }
  });

  es.addEventListener('error', () => {
    if (closed) return;
    options.onStatus('reconnecting');
  });

  return () => {
    if (closed) return;
    closed = true;
    es.close();
    options.onStatus('disconnected');
  };
}
