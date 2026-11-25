import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/index.js';
import {
  TIMEFRAME_SECONDS,
  UnknownSymbolError,
  VALID_TIMEFRAMES,
  clearMarketCache,
  getOHLCVBars,
  getSeededBars,
  getSymbolDetails,
  getSymbolDetailsLive,
  listSymbols,
  listSymbolsLive,
  resolveSymbol,
} from '../../server/services/marketData.js';

describe('marketData service', () => {
  afterEach(() => {
    clearMarketCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exposes a 58-symbol catalog across all 5 asset classes (including full Forex & Metals) with required metadata', () => {
    const symbols = listSymbols();
    expect(symbols).toHaveLength(58);

    const classes = new Set(symbols.map((s) => s.assetClass));
    expect(classes).toEqual(new Set(['stocks', 'crypto', 'indices', 'forex', 'metals']));

    for (const s of symbols) {
      expect(s.symbol.length).toBeGreaterThan(0);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.exchange.length).toBeGreaterThan(0);
      expect(s.last).toBeGreaterThan(0);
      expect(s.volume).toBeGreaterThan(0);
      expect(s.avgVolume30d).toBeGreaterThan(0);
    }
  });

  it('resolves aliases cleanly while rejecting unknown tickers', () => {
    expect(resolveSymbol('aapl')).toBe('AAPL');
    expect(resolveSymbol('BTCUSD')).toBe('BTCUSDT');
    expect(resolveSymbol('ethusd')).toBe('ETHUSDT');
    expect(resolveSymbol('NDQ')).toBe('NDX');
    expect(resolveSymbol('GOLD')).toBe('XAUUSD');
    expect(resolveSymbol('SILVER')).toBe('XAGUSD');
    expect(resolveSymbol('COPPER')).toBe('XCUUSD');
    expect(resolveSymbol('GBP/JPY')).toBe('GBPJPY');
    expect(resolveSymbol('USD/INR')).toBe('USDINR');
    expect(resolveSymbol('FAKECOIN')).toBeNull();
  });

  it('generates deterministic and slice-stable OHLCV bars', () => {
    const first = getSeededBars('AAPL', '1D', 300);
    const second = getSeededBars('AAPL', '1D', 300);
    expect(first).toEqual(second);

    const extended = getSeededBars('AAPL', '1D', 500);
    expect(extended).toHaveLength(500);
    expect(extended.slice(-300)).toEqual(first);
  });

  it('satisfies OHLCV invariants across all 58 symbols x 8 timeframes (464 combinations)', () => {
    const symbols = listSymbols();
    expect(symbols).toHaveLength(58);
    expect(VALID_TIMEFRAMES).toHaveLength(8);

    const violations: string[] = [];
    for (const sym of symbols) {
      for (const tf of VALID_TIMEFRAMES) {
        const bars = getSeededBars(sym.symbol, tf, 300);
        if (bars.length !== 300) {
          violations.push(`${sym.symbol}:${tf} expected 300 bars, got ${bars.length}`);
          continue;
        }

        const expectedStep = TIMEFRAME_SECONDS[tf];
        for (let i = 0; i < bars.length; i += 1) {
          const bar = bars[i];
          if (!Number.isInteger(bar.time)) {
            violations.push(`${sym.symbol}:${tf}[${i}] non-integer time ${bar.time}`);
          }
          if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0) {
            violations.push(`${sym.symbol}:${tf}[${i}] non-positive OHLC`);
          }
          if (bar.high < Math.max(bar.open, bar.close)) {
            violations.push(`${sym.symbol}:${tf}[${i}] high < max(open, close)`);
          }
          if (bar.low > Math.min(bar.open, bar.close)) {
            violations.push(`${sym.symbol}:${tf}[${i}] low > min(open, close)`);
          }
          if (bar.volume <= 0) {
            violations.push(`${sym.symbol}:${tf}[${i}] volume <= 0`);
          }

          if (i > 0) {
            const prev = bars[i - 1];
            if (bar.time - prev.time !== expectedStep) {
              violations.push(
                `${sym.symbol}:${tf}[${i}] step ${bar.time - prev.time} !== ${expectedStep}`,
              );
            }
            const openGap = Math.abs(bar.open - prev.close) / prev.close;
            if (openGap >= 0.05) {
              violations.push(`${sym.symbol}:${tf}[${i}] openGap ${openGap} >= 0.05`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps symbol details consistent with trailing 1D OHLCV bars', () => {
    const symbols = listSymbols();
    for (const sym of symbols) {
      const detailsRes = getSymbolDetails(sym.symbol);
      expect(detailsRes).not.toBeNull();
      const details = detailsRes!.details;
      const daily = getSeededBars(sym.symbol, '1D', 300);
      const latest = daily[daily.length - 1];
      const prev = daily[daily.length - 2];

      expect(details.last).toBe(latest.close);
      expect(details.volume).toBe(latest.volume);
      expect(details.change).toBeCloseTo(latest.close - prev.close, 4);
    }
  });

  it('falls back to seeded data when live proxy fails or returns HTTP 503', async () => {
    const rejectFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', rejectFetch);

    const res1 = await getOHLCVBars({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      limit: 300,
      live: true,
    });
    expect(res1.source).toBe('seeded');
    expect(res1.bars).toHaveLength(300);
    expect(rejectFetch).toHaveBeenCalledTimes(1);

    const errResFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'unavailable' }),
    });
    vi.stubGlobal('fetch', errResFetch);

    const res2 = await getOHLCVBars({
      symbol: 'AAPL',
      timeframe: '1D',
      limit: 300,
      live: true,
    });
    expect(res2.source).toBe('seeded');
    expect(res2.bars).toHaveLength(300);
  });

  it('caches live Binance klines within TTL and parses Yahoo Finance charts', async () => {
    const binanceRows = [
      [1700000000000, '90000.0', '91000.0', '89500.0', '90500.0', '1234.5'],
      [1700003600000, '90500.0', '92000.0', '90200.0', '91800.0', '2345.6'],
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => binanceRows,
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await getOHLCVBars({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      limit: 300,
      live: true,
    });
    expect(first.source).toBe('live');
    expect(first.bars).toHaveLength(2);
    expect(first.bars[0].time).toBe(1700000000);
    expect(first.bars[1].close).toBe(91800);

    const second = await getOHLCVBars({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      limit: 300,
      live: true,
    });
    expect(second.source).toBe('live');
    expect(second.bars).toEqual(first.bars);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const yahooPayload = {
      chart: {
        result: [
          {
            timestamp: [1700000000, 1700086400, 1700172800],
            indicators: {
              quote: [
                {
                  open: [220.1, null, 222.5],
                  high: [223.0, null, 225.0],
                  low: [219.5, null, 221.0],
                  close: [222.0, null, 224.2],
                  volume: [100000, null, 120000],
                },
              ],
            },
          },
        ],
      },
    };
    const yahooMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => yahooPayload,
    });
    vi.stubGlobal('fetch', yahooMock);

    const yfRes = await getOHLCVBars({
      symbol: 'AAPL',
      timeframe: '1D',
      limit: 300,
      live: true,
    });
    expect(yfRes.source).toBe('live');
    expect(yfRes.bars).toHaveLength(2);
    expect(yfRes.bars[1].close).toBe(224.2);
  });

  it('guards non-finite limits (NaN / Infinity) to DEFAULT_OHLCV_LIMIT and sorts/dedupes live bars', async () => {
    expect(getSeededBars('AAPL', '1D', NaN)).toHaveLength(300);
    expect(getSeededBars('AAPL', '1D', Infinity)).toHaveLength(300);
    expect(getSeededBars('AAPL', '1D', -Infinity)).toHaveLength(300);

    const ohlcvNan = await getOHLCVBars({
      symbol: 'AAPL',
      timeframe: '1D',
      limit: NaN,
      live: false,
    });
    expect(ohlcvNan.bars).toHaveLength(300);

    // Out-of-order and duplicate timestamps from Binance should be deduped and sorted ascending
    const binanceRows = [
      [1700003600000, '90500.0', '92000.0', '90200.0', '91800.0', '2345.6'],
      [1700000000000, '90000.0', '91000.0', '89500.0', '90500.0', '1234.5'],
      [1700003600000, '90600.0', '92100.0', '90300.0', '91900.0', '2500.0'],
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => binanceRows,
      }),
    );

    const liveSorted = await getOHLCVBars({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      limit: 300,
      live: true,
    });
    expect(liveSorted.source).toBe('live');
    expect(liveSorted.bars).toHaveLength(2);
    expect(liveSorted.bars[0].time).toBe(1700000000);
    expect(liveSorted.bars[1].time).toBe(1700003600);
    expect(liveSorted.bars[1].close).toBe(91900);
  });

  it('hydrates live catalog quotes from Binance batch 24hr and Yahoo meta with caching & 503 fallback', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('data-api.binance.vision/api/v3/ticker/24hr')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              symbol: 'BTCUSDT',
              lastPrice: '98500.50',
              priceChange: '2150.25',
              priceChangePercent: '2.23',
              bidPrice: '98499.10',
              askPrice: '98501.90',
              highPrice: '99100.00',
              lowPrice: '96200.00',
              volume: '31200.4',
            },
            {
              symbol: 'ETHUSDT',
              lastPrice: '3420.10',
              priceChange: '-42.00',
              priceChangePercent: '-1.21',
              bidPrice: '3419.80',
              askPrice: '3420.40',
              highPrice: '3500.00',
              lowPrice: '3380.00',
              volume: '185000.0',
            },
            {
              symbol: 'SOLUSDT',
              lastPrice: '215.40',
              priceChange: '8.20',
              priceChangePercent: '3.96',
              bidPrice: '215.35',
              askPrice: '215.45',
              highPrice: '218.00',
              lowPrice: '205.00',
              volume: '910000.0',
            },
          ],
        };
      }
      if (url.includes('/v8/finance/chart/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 231.75,
                    fulldayChange: 3.25,
                    fulldayChangePercent: 1.42,
                    regularMarketDayHigh: 233.1,
                    regularMarketDayLow: 227.9,
                    fiftyTwoWeekHigh: 260.1,
                    fiftyTwoWeekLow: 164.08,
                    regularMarketVolume: 51200000,
                    currency: 'USD',
                  },
                  timestamp: [1700000000, 1700086400],
                  indicators: {
                    quote: [
                      {
                        open: [228.0, 229.0],
                        high: [230.0, 233.1],
                        low: [227.5, 227.9],
                        close: [228.5, 231.75],
                        volume: [45000000, 51200000],
                      },
                    ],
                  },
                },
              ],
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const liveList = await listSymbolsLive({ live: true });
    expect(liveList.source).toBe('live');
    expect(liveList.symbols).toHaveLength(58);

    const btc = liveList.symbols.find((s) => s.symbol === 'BTCUSDT')!;
    expect(btc.dataSource).toBe('live');
    expect(btc.last).toBe(98500.5);
    expect(btc.bid).toBe(98499.1);
    expect(btc.ask).toBe(98501.9);

    const aapl = liveList.symbols.find((s) => s.symbol === 'AAPL')!;
    expect(aapl.dataSource).toBe('live');
    expect(aapl.last).toBe(231.75);
    expect(aapl.fiftyTwoWeekHigh).toBe(260.1);
    expect(aapl.fiftyTwoWeekLow).toBe(164.08);

    // Second call within TTL hits liveQuoteCache without additional fetch calls
    const callCountAfterFirst = fetchMock.mock.calls.length;
    const cachedList = await listSymbolsLive({ live: true });
    expect(cachedList.source).toBe('live');
    expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst);

    // Clear cache and simulate upstream 503 outage -> automatic fallback to seeded quotes
    clearMarketCache();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'unavailable' }),
      }),
    );
    const fallbackList = await listSymbolsLive({ live: true });
    expect(fallbackList.source).toBe('seeded');
    expect(fallbackList.symbols).toHaveLength(58);
    expect(fallbackList.symbols[0].dataSource).toBe('seeded');
  });

  it('merges dynamic Yahoo symbol search matches and supports non-catalog live tickers (GOOGL, DOGEUSDT)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/v1/finance/search')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              quotes: [
                {
                  symbol: 'GOOGL',
                  longname: 'Alphabet Inc.',
                  exchDisp: 'NASDAQ',
                  quoteType: 'EQUITY',
                },
              ],
            }),
          };
        }
        if (url.includes('/v8/finance/chart/GOOGL')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              chart: {
                result: [
                  {
                    meta: {
                      symbol: 'GOOGL',
                      longName: 'Alphabet Inc.',
                      fullExchangeName: 'NasdaqGS',
                      instrumentType: 'EQUITY',
                      currency: 'USD',
                      regularMarketPrice: 179.42,
                      chartPreviousClose: 176.2,
                      regularMarketDayHigh: 180.5,
                      regularMarketDayLow: 176.8,
                      fiftyTwoWeekHigh: 207.05,
                      fiftyTwoWeekLow: 140.53,
                      regularMarketVolume: 24300000,
                    },
                    timestamp: [1700000000, 1700086400],
                    indicators: {
                      quote: [
                        {
                          open: [176.5, 177.2],
                          high: [178.0, 180.5],
                          low: [175.9, 176.8],
                          close: [176.2, 179.42],
                          volume: [21000000, 24300000],
                        },
                      ],
                    },
                  },
                ],
              },
            }),
          };
        }
        if (url.includes('data-api.binance.vision/api/v3/klines?symbol=DOGEUSDT')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              [1700000000000, '0.3810', '0.3950', '0.3780', '0.3912', '1250000'],
              [1700086400000, '0.3912', '0.4020', '0.3890', '0.3985', '1420000'],
            ],
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }),
    );

    const searchRes = await listSymbolsLive({ q: 'GOOGL', live: true });
    expect(searchRes.source).toBe('live');
    const googl = searchRes.symbols.find((s) => s.symbol === 'GOOGL');
    expect(googl).toBeDefined();
    expect(googl!.last).toBe(179.42);
    expect(googl!.assetClass).toBe('stocks');

    const googlBars = await getOHLCVBars({
      symbol: 'GOOGL',
      timeframe: '1D',
      limit: 10,
      live: true,
    });
    expect(googlBars.source).toBe('live');
    expect(googlBars.bars).toHaveLength(2);
    expect(googlBars.bars[1].close).toBe(179.42);

    const googlDetails = await getSymbolDetailsLive('GOOGL', { live: true });
    expect(googlDetails?.details.symbol).toBe('GOOGL');
    expect(googlDetails?.details.fiftyTwoWeekHigh).toBe(207.05);

    const dogeBars = await getOHLCVBars({
      symbol: 'DOGEUSDT',
      timeframe: '1D',
      limit: 10,
      live: true,
    });
    expect(dogeBars.source).toBe('live');
    expect(dogeBars.bars[1].close).toBe(0.3985);

    await expect(
      getOHLCVBars({ symbol: 'FAKECOIN', timeframe: '1D', live: true }),
    ).rejects.toBeInstanceOf(UnknownSymbolError);
  });
});

describe('Fastify API routes (app.inject)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      logger: false,
      serveStatic: false,
      plugins: [
        {
          prefix: '/api',
          plugin: async (instance) => {
            instance.get('/_plugin-check', async () => ({ ok: true }));
            instance.post('/_plugin-echo', async (request) => ({
              ok: true,
              body: request.body,
            }));
            instance.get('/_plugin-throw', async () => {
              throw new Error('SENSITIVE_INTERNAL_DB_ERROR');
            });
          },
        },
      ],
    });
  });

  afterEach(() => {
    clearMarketCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns service ok payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      service: 'tradingview-copy-api',
    });
  });

  it('supports optional plugins via buildApp options', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/_plugin-check' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('GET /api/market/symbols filters by assetClass and query q and validates bad assetClass', async () => {
    const allRes = await app.inject({ method: 'GET', url: '/api/market/symbols' });
    expect(allRes.statusCode).toBe(200);
    expect(allRes.json().symbols).toHaveLength(58);

    const cryptoRes = await app.inject({
      method: 'GET',
      url: '/api/market/symbols?assetClass=crypto',
    });
    expect(cryptoRes.statusCode).toBe(200);
    expect(cryptoRes.json().symbols).toHaveLength(3);

    const forexRes = await app.inject({
      method: 'GET',
      url: '/api/market/symbols?assetClass=forex',
    });
    expect(forexRes.statusCode).toBe(200);
    expect(forexRes.json().symbols).toHaveLength(37);

    const metalsRes = await app.inject({
      method: 'GET',
      url: '/api/market/symbols?assetClass=metals',
    });
    expect(metalsRes.statusCode).toBe(200);
    expect(metalsRes.json().symbols).toHaveLength(8);

    const queryRes = await app.inject({
      method: 'GET',
      url: '/api/market/symbols?q=nvidia',
    });
    expect(queryRes.statusCode).toBe(200);
    const nvda = queryRes.json().symbols.find((s: { symbol: string }) => s.symbol === 'NVDA');
    expect(nvda).toBeDefined();

    const badRes = await app.inject({
      method: 'GET',
      url: '/api/market/symbols?assetClass=commodities',
    });
    expect(badRes.statusCode).toBe(400);
    expect(badRes.json().error).toBe('INVALID_ASSET_CLASS');
  });

  it('GET /api/market/ohlcv validates query params, preserves 1m vs 1M case sensitivity, and returns bars', async () => {
    const aapl = await app.inject({
      method: 'GET',
      url: '/api/market/ohlcv?symbol=AAPL&timeframe=1D&limit=300',
    });
    expect(aapl.statusCode).toBe(200);
    const body = aapl.json();
    expect(body.symbol).toBe('AAPL');
    expect(body.timeframe).toBe('1D');
    expect(body.source).toBe('seeded');
    expect(body.bars).toHaveLength(300);

    const min1 = await app.inject({
      method: 'GET',
      url: '/api/market/ohlcv?symbol=AAPL&timeframe=1m&limit=10',
    });
    const mon1 = await app.inject({
      method: 'GET',
      url: '/api/market/ohlcv?symbol=AAPL&timeframe=1M&limit=10',
    });
    expect(min1.statusCode).toBe(200);
    expect(mon1.statusCode).toBe(200);
    const minBars = min1.json().bars;
    const monBars = mon1.json().bars;
    expect(minBars[1].time - minBars[0].time).toBe(60);
    expect(monBars[1].time - monBars[0].time).toBe(2592000);

    const ext = await app.inject({
      method: 'GET',
      url: '/api/market/ohlcv?symbol=AAPL&timeframe=1D&limit=500',
    });
    expect(ext.statusCode).toBe(200);
    expect(ext.json().bars).toHaveLength(500);

    expect(
      (await app.inject({ method: 'GET', url: '/api/market/ohlcv' })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/market/ohlcv?symbol=AAPL&timeframe=2h' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/market/ohlcv?symbol=AAPL&limit=0' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/market/ohlcv?symbol=AAPL&limit=1001' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/market/ohlcv?symbol=AAPL&limit=abc' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/market/ohlcv?symbol=FAKECOIN' })).statusCode,
    ).toBe(404);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        if (String(input).includes('/v8/finance/chart/GOOGL')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              chart: {
                result: [
                  {
                    meta: { regularMarketPrice: 181.2, chartPreviousClose: 179.0 },
                    timestamp: [1700000000, 1700086400],
                    indicators: {
                      quote: [
                        {
                          open: [179.0, 180.0],
                          high: [180.5, 182.0],
                          low: [178.5, 179.5],
                          close: [179.8, 181.2],
                          volume: [12000000, 13000000],
                        },
                      ],
                    },
                  },
                ],
              },
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }),
    );

    const googlRes = await app.inject({
      method: 'GET',
      url: '/api/market/ohlcv?symbol=GOOGL&timeframe=1D&limit=10&live=true',
    });
    expect(googlRes.statusCode).toBe(200);
    expect(googlRes.json().source).toBe('live');
    expect(googlRes.json().bars).toHaveLength(2);
  });

  it('GET /api/market/details returns symbol details matching 1D chart and validates errors', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/market/details?symbol=AAPL',
    });
    expect(res.statusCode).toBe(200);
    const { details } = res.json();
    const ohlcv = (
      await app.inject({
        method: 'GET',
        url: '/api/market/ohlcv?symbol=AAPL&timeframe=1D&limit=300',
      })
    ).json();
    expect(details.last).toBe(ohlcv.bars[299].close);

    expect(
      (await app.inject({ method: 'GET', url: '/api/market/details' })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/market/details?symbol=FAKECOIN' }))
        .statusCode,
    ).toBe(404);
  });

  it('returns structured 404 JSON on unknown /api routes and CORS headers on preflight', async () => {
    const notFound = await app.inject({ method: 'GET', url: '/api/unknown-route' });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({
      ok: false,
      error: 'NOT_FOUND',
    });

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/market/ohlcv',
      headers: {
        origin: 'http://127.0.0.1:5173',
        'access-control-request-method': 'GET',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });

  it('applies custom error handler (413, malformed JSON 400, masked 500) to encapsulated plugin routes', async () => {
    const oversizedPayload = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024 + 4096) });
    const tooLargeRes = await app.inject({
      method: 'POST',
      url: '/api/_plugin-echo',
      headers: { 'content-type': 'application/json' },
      payload: oversizedPayload,
    });
    expect(tooLargeRes.statusCode).toBe(413);
    expect(tooLargeRes.json()).toEqual({
      ok: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload exceeds maximum allowed size (2 MiB).',
    });

    const malformedRes = await app.inject({
      method: 'POST',
      url: '/api/_plugin-echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"bad": [1, 2,',
    });
    expect(malformedRes.statusCode).toBe(400);
    expect(malformedRes.json()).toMatchObject({
      ok: false,
      error: 'FST_ERR_CTP_INVALID_JSON_BODY',
    });

    const thrownRes = await app.inject({
      method: 'GET',
      url: '/api/_plugin-throw',
    });
    expect(thrownRes.statusCode).toBe(500);
    const thrownBody = thrownRes.json();
    expect(thrownBody).toEqual({
      ok: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
    });
    expect(JSON.stringify(thrownBody)).not.toContain('SENSITIVE_INTERNAL_DB_ERROR');
  });

  it('rejects repeated/array query parameters on /api/market/* with 400 JSON instead of 500', async () => {
    const repeatedUrls = [
      '/api/market/symbols?q=aapl&q=nvda',
      '/api/market/symbols?assetClass=stocks&assetClass=crypto',
      '/api/market/ohlcv?symbol=AAPL&symbol=NVDA',
      '/api/market/ohlcv?symbol=AAPL&timeframe=1D&timeframe=1h',
      '/api/market/ohlcv?symbol=AAPL&limit=10&limit=20',
      '/api/market/ohlcv?symbol=AAPL&live=true&live=false',
      '/api/market/details?symbol=AAPL&symbol=NVDA',
    ];

    for (const url of repeatedUrls) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ ok: false });
    }
  });
});
