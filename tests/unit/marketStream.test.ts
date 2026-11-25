import { describe, expect, it } from 'vitest';
import {
  decodeYahooPricingData,
  parseBinanceCombinedMessage,
  yahooPricingToQuoteEvent,
} from '../../server/services/marketStream.js';

describe('marketStream decoders & parsers', () => {
  it('decodes Yahoo Finance base64 protobuf PricingData frames and rejects invalid payloads', () => {
    const sample =
      'CgdCVEMtVVNEFd8TXEcYkL7RyL9oIgNVU0QqA0NDQzApOAFFZJsOwUiAgKSnhwRVi8lmR114a1lHZTBHrMV9mrJlR7ABgICkp4cE2AEE4AGAgKSnhwToAYCA';

    const decoded = decodeYahooPricingData(sample);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe('BTC-USD');
    expect(decoded!.price).toBeCloseTo(56339.87, 1);
    expect(decoded!.time).toBe(1795238277000);
    expect(decoded!.change).toBeCloseTo(-5512.9, 1);
    expect(decoded!.changePercent).toBeCloseTo(-8.91, 1);
    expect(decoded!.dayVolume).toBe(69700190208);
    expect(decoded!.dayHigh).toBeCloseTo(59081.54, 1);
    expect(decoded!.dayLow).toBeCloseTo(55659.47, 1);

    expect(decodeYahooPricingData('')).toBeNull();
    expect(decodeYahooPricingData('AA==')).toBeNull();
  });

  it('maps decoded Yahoo symbols back to canonical workspace tickers', () => {
    const spxQuote = yahooPricingToQuoteEvent({
      id: '^GSPC',
      price: 6910.42,
      change: -12.34,
      changePercent: -0.18,
      marketHours: 1,
      time: 1795238277000,
    });
    expect(spxQuote.symbol).toBe('SPX');
    expect(spxQuote.last).toBe(6910.42);
    expect(spxQuote.marketOpen).toBe(true);

    const eurQuote = yahooPricingToQuoteEvent({
      id: 'EURUSD=X',
      price: 1.09754,
      marketHours: 3,
    });
    expect(eurQuote.symbol).toBe('EURUSD');
    expect(eurQuote.last).toBe(1.0975);
    expect(eurQuote.marketOpen).toBe(false);
  });

  it('parses Binance combined kline, 24hrMiniTicker, and bookTicker frames accurately', () => {
    const klineRaw = JSON.stringify({
      stream: 'btcusdt@kline_1m',
      data: {
        e: 'kline',
        s: 'BTCUSDT',
        k: {
          t: 1795238220000,
          s: 'BTCUSDT',
          i: '1m',
          o: '56387.61000000',
          c: '56406.94000000',
          h: '56419.32000000',
          l: '56357.71000000',
          v: '31.63318000',
          x: false,
        },
      },
    });

    const parsedKline = parseBinanceCombinedMessage(klineRaw, 'BTCUSDT', '1m');
    expect(parsedKline?.barEvent).toEqual({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      bar: {
        time: 1795238220,
        open: 56387.61,
        high: 56419.32,
        low: 56357.71,
        close: 56406.94,
        volume: 32,
      },
      isClosed: false,
    });
    expect(parsedKline?.quoteEvent?.last).toBe(56406.94);

    // Non-matching active symbol should still produce quoteEvent without barEvent
    const otherSymbolKline = parseBinanceCombinedMessage(klineRaw, 'AAPL', '1D');
    expect(otherSymbolKline?.barEvent).toBeUndefined();
    expect(otherSymbolKline?.quoteEvent?.symbol).toBe('BTCUSDT');

    const miniTickerRaw = JSON.stringify({
      stream: 'ethusdt@miniTicker',
      data: {
        e: '24hrMiniTicker',
        s: 'ETHUSDT',
        c: '1570.34',
        o: '1723.26',
        h: '1763.33',
        l: '1538.00',
        v: '767544.53',
      },
    });
    const parsedMini = parseBinanceCombinedMessage(miniTickerRaw, 'BTCUSDT', '1m');
    expect(parsedMini?.quoteEvent).toMatchObject({
      symbol: 'ETHUSDT',
      last: 1570.34,
      dayHigh: 1763.33,
      dayLow: 1538,
      volume: 767545,
      marketOpen: true,
    });
    expect(parsedMini?.quoteEvent?.change).toBeCloseTo(-152.92, 2);

    const aggTradeRaw = JSON.stringify({
      stream: 'btcusdt@aggTrade',
      data: {
        e: 'aggTrade',
        s: 'BTCUSDT',
        p: '55768.48000000',
        q: '0.12500000',
      },
    });
    const parsedTrade = parseBinanceCombinedMessage(aggTradeRaw, 'BTCUSDT', '1m');
    expect(parsedTrade?.barEvent).toBeUndefined();
    expect(parsedTrade?.quoteEvent).toMatchObject({
      symbol: 'BTCUSDT',
      last: 55768.48,
      source: 'trade',
      marketOpen: true,
    });

    const bookTickerRaw = JSON.stringify({
      stream: 'btcusdt@bookTicker',
      data: {
        s: 'BTCUSDT',
        b: '56373.19',
        a: '56373.20',
      },
    });
    const parsedBook = parseBinanceCombinedMessage(bookTickerRaw, 'BTCUSDT', '1m');
    expect(parsedBook?.quoteEvent).toMatchObject({
      symbol: 'BTCUSDT',
      bid: 56373.19,
      ask: 56373.2,
      source: 'book',
      marketOpen: true,
    });
    expect(parsedBook?.quoteEvent?.last).toBeUndefined();
  });
});
