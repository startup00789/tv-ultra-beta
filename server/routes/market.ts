import type { FastifyPluginAsync } from 'fastify';
import {
  DEFAULT_OHLCV_LIMIT,
  DEFAULT_ULTRA_LIMIT,
  MAX_SEEDED_BARS,
  MAX_ULTRA_BARS,
  UnknownSymbolError,
  getOHLCVBars,
  getSymbolDetailsLive,
  getUltraOHLCVBars,
  isValidAssetClass,
  isValidTimeframe,
  listSymbolsLive,
} from '../services/marketData.js';
import {
  closeAllMarketStreams,
  createMarketStreamSession,
} from '../services/marketStream.js';

interface SymbolsQuery {
  q?: unknown;
  assetClass?: unknown;
  live?: unknown;
  refresh?: unknown;
}

interface OhlcvQuery {
  symbol?: unknown;
  timeframe?: unknown;
  limit?: unknown;
  live?: unknown;
  refresh?: unknown;
}

interface DetailsQuery {
  symbol?: unknown;
  live?: unknown;
  refresh?: unknown;
}

interface StreamQuery {
  symbol?: unknown;
  timeframe?: unknown;
  watchlist?: unknown;
}

function isNonStringDefined(val: unknown): boolean {
  return val !== undefined && typeof val !== 'string';
}

function parseBooleanFlag(
  raw: unknown,
  paramName: string,
): { ok: true; value: boolean | undefined } | { ok: false; message: string } {
  if (raw === undefined || raw === '') {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== 'string') {
    return { ok: false, message: `Query parameter "${paramName}" must be a single string value.` };
  }
  if (raw === 'true' || raw === '1') {
    return { ok: true, value: true };
  }
  if (raw === 'false' || raw === '0') {
    return { ok: true, value: false };
  }
  return {
    ok: false,
    message: `Invalid ${paramName} flag "${raw}". Expected true, false, 1, or 0.`,
  };
}

export const marketRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onClose', async () => {
    closeAllMarketStreams();
  });

  fastify.get<{ Querystring: SymbolsQuery }>('/symbols', async (request, reply) => {
    const { q, assetClass, live, refresh } = request.query;

    if (isNonStringDefined(q)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_QUERY_PARAM',
        message: 'Query parameter "q" must be a single string value.',
      });
    }

    if (isNonStringDefined(assetClass)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_QUERY_PARAM',
        message: 'Query parameter "assetClass" must be a single string value.',
      });
    }

    const parsedLive = parseBooleanFlag(live, 'live');
    if (!parsedLive.ok) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_LIVE_PARAM',
        message: parsedLive.message,
      });
    }

    const parsedRefresh = parseBooleanFlag(refresh, 'refresh');
    if (!parsedRefresh.ok) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_QUERY_PARAM',
        message: parsedRefresh.message,
      });
    }

    const qStr = typeof q === 'string' ? q : undefined;
    const assetClassStr = typeof assetClass === 'string' ? assetClass : undefined;
    const targetAssetClass = assetClassStr && assetClassStr !== '' ? assetClassStr : 'all';

    if (!isValidAssetClass(targetAssetClass)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_ASSET_CLASS',
        message: `Invalid assetClass "${assetClassStr}". Expected one of: all, stocks, crypto, indices, forex.`,
      });
    }

    return listSymbolsLive({
      q: qStr,
      assetClass: targetAssetClass,
      live: parsedLive.value,
      bypassCache: parsedRefresh.value === true,
    });
  });

  fastify.get<{ Querystring: OhlcvQuery }>('/ohlcv', async (request, reply) => {
    const { symbol, timeframe = '1D', limit, live, refresh } = request.query;

    if (isNonStringDefined(symbol)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_SYMBOL',
        message: 'Query parameter "symbol" must be a single string value.',
      });
    }

    if (typeof symbol !== 'string' || symbol.trim() === '') {
      return reply.status(400).send({
        ok: false,
        error: 'MISSING_SYMBOL',
        message: 'Query parameter "symbol" is required.',
      });
    }

    if (typeof timeframe !== 'string') {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_QUERY_PARAM',
        message: 'Query parameter "timeframe" must be a single string value.',
      });
    }

    if (isNonStringDefined(limit)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_QUERY_PARAM',
        message: 'Query parameter "limit" must be a single string value.',
      });
    }

    const parsedLive = parseBooleanFlag(live, 'live');
    if (!parsedLive.ok) {
      return reply.status(400).send({
        ok: false,
        error: typeof live !== 'string' ? 'INVALID_QUERY_PARAM' : 'INVALID_LIVE_PARAM',
        message: parsedLive.message,
      });
    }

    const parsedRefresh = parseBooleanFlag(refresh, 'refresh');
    if (!parsedRefresh.ok) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_QUERY_PARAM',
        message: parsedRefresh.message,
      });
    }

    if (!isValidTimeframe(timeframe)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_TIMEFRAME',
        message: `Invalid timeframe "${timeframe}". Expected one of: 1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M.`,
      });
    }

    let parsedLimit = DEFAULT_OHLCV_LIMIT;
    if (typeof limit === 'string' && limit !== '') {
      const n = Number(limit);
      if (!Number.isInteger(n) || n < 1 || n > MAX_SEEDED_BARS) {
        return reply.status(400).send({
          ok: false,
          error: 'INVALID_LIMIT',
          message: `Invalid limit "${limit}". Expected an integer between 1 and ${MAX_SEEDED_BARS}.`,
        });
      }
      parsedLimit = n;
    }

    try {
      return await getOHLCVBars({
        symbol,
        timeframe,
        limit: parsedLimit,
        live: parsedLive.value,
        bypassCache: parsedRefresh.value === true,
      });
    } catch (err) {
      if (err instanceof UnknownSymbolError) {
        return reply.status(404).send({
          ok: false,
          error: 'UNKNOWN_SYMBOL',
          message: `Symbol "${symbol}" was not found in market catalog.`,
        });
      }
      throw err;
    }
  });

  fastify.get<{
    Querystring: {
      symbol?: unknown;
      timeframe?: unknown;
      limit?: unknown;
      before?: unknown;
      from?: unknown;
      to?: unknown;
      live?: unknown;
      refresh?: unknown;
    };
  }>('/history', async (request, reply) => {
    const { symbol, timeframe = '1D', limit, before, from, to, live, refresh } = request.query;

    if (typeof symbol !== 'string' || symbol.trim() === '') {
      return reply.status(400).send({
        ok: false,
        error: 'MISSING_SYMBOL',
        message: 'Query parameter "symbol" is required.',
      });
    }
    if (typeof timeframe !== 'string' || !isValidTimeframe(timeframe)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_TIMEFRAME',
        message: `Invalid timeframe "${String(timeframe)}".`,
      });
    }

    const parsedLive = parseBooleanFlag(live, 'live');
    if (!parsedLive.ok) {
      return reply.status(400).send({ ok: false, error: 'INVALID_LIVE_PARAM', message: parsedLive.message });
    }
    const parsedRefresh = parseBooleanFlag(refresh, 'refresh');
    if (!parsedRefresh.ok) {
      return reply.status(400).send({ ok: false, error: 'INVALID_QUERY_PARAM', message: parsedRefresh.message });
    }

    let parsedLimit = DEFAULT_ULTRA_LIMIT;
    if (typeof limit === 'string' && limit !== '') {
      const n = Number(limit);
      if (!Number.isInteger(n) || n < 1 || n > MAX_ULTRA_BARS) {
        return reply.status(400).send({
          ok: false,
          error: 'INVALID_LIMIT',
          message: `Invalid limit "${limit}". Expected an integer between 1 and ${MAX_ULTRA_BARS}.`,
        });
      }
      parsedLimit = n;
    }

    const beforeNum = typeof before === 'string' && before !== '' ? Number(before) : undefined;
    const fromNum = typeof from === 'string' && from !== '' ? Number(from) : undefined;
    const toNum = typeof to === 'string' && to !== '' ? Number(to) : undefined;

    try {
      return await getUltraOHLCVBars({
        symbol,
        timeframe,
        limit: parsedLimit,
        before: Number.isFinite(beforeNum) ? beforeNum : undefined,
        fromTime: Number.isFinite(fromNum) ? fromNum : undefined,
        toTime: Number.isFinite(toNum) ? toNum : undefined,
        live: parsedLive.value,
        bypassCache: parsedRefresh.value === true,
      });
    } catch (err) {
      if (err instanceof UnknownSymbolError) {
        return reply.status(404).send({
          ok: false,
          error: 'UNKNOWN_SYMBOL',
          message: `Symbol "${symbol}" was not found.`,
        });
      }
      throw err;
    }
  });

  fastify.get<{ Querystring: DetailsQuery }>('/details', async (request, reply) => {
    const { symbol, live, refresh } = request.query;

    if (isNonStringDefined(symbol)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_SYMBOL',
        message: 'Query parameter "symbol" must be a single string value.',
      });
    }

    if (typeof symbol !== 'string' || symbol.trim() === '') {
      return reply.status(400).send({
        ok: false,
        error: 'MISSING_SYMBOL',
        message: 'Query parameter "symbol" is required.',
      });
    }

    const parsedLive = parseBooleanFlag(live, 'live');
    if (!parsedLive.ok) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_LIVE_PARAM',
        message: parsedLive.message,
      });
    }

    const parsedRefresh = parseBooleanFlag(refresh, 'refresh');
    if (!parsedRefresh.ok) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_QUERY_PARAM',
        message: parsedRefresh.message,
      });
    }

    const details = await getSymbolDetailsLive(symbol, {
      live: parsedLive.value,
      bypassCache: parsedRefresh.value === true,
    });
    if (!details) {
      return reply.status(404).send({
        ok: false,
        error: 'UNKNOWN_SYMBOL',
        message: `Symbol "${symbol}" was not found in market catalog.`,
      });
    }

    return details;
  });

  fastify.get<{ Querystring: StreamQuery }>('/stream', async (request, reply) => {
    const { symbol, timeframe = '1D', watchlist } = request.query;

    if (isNonStringDefined(symbol) || typeof symbol !== 'string' || symbol.trim() === '') {
      return reply.status(400).send({
        ok: false,
        error: 'MISSING_SYMBOL',
        message: 'Query parameter "symbol" is required.',
      });
    }

    if (typeof timeframe !== 'string' || !isValidTimeframe(timeframe)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_TIMEFRAME',
        message: `Invalid timeframe "${String(timeframe)}". Expected one of: 1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M.`,
      });
    }

    if (isNonStringDefined(watchlist)) {
      return reply.status(400).send({
        ok: false,
        error: 'INVALID_QUERY_PARAM',
        message: 'Query parameter "watchlist" must be a single comma-separated string.',
      });
    }

    const watchlistItems =
      typeof watchlist === 'string' && watchlist.trim() !== ''
        ? watchlist
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 30)
        : [];

    reply.hijack();

    const origin = request.headers.origin;
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    };
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    reply.raw.writeHead(200, headers);
    reply.raw.flushHeaders?.();

    let closed = false;

    const writeEvent = (eventName: string, payload: unknown) => {
      if (closed || reply.raw.writableEnded) return;
      reply.raw.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    reply.raw.write(': connected\n\n');
    writeEvent('status', {
      connected: true,
      providers: [],
      timestamp: new Date().toISOString(),
    });

    const session = createMarketStreamSession({
      symbol,
      timeframe,
      watchlist: watchlistItems,
      onStatus: (statusEv) => writeEvent('status', statusEv),
      onBar: (barEv) => writeEvent('bar', barEv),
      onQuote: (quoteEv) => writeEvent('quote', quoteEv),
    });

    const heartbeat = setInterval(() => {
      if (!closed && !reply.raw.writableEnded) {
        reply.raw.write(': heartbeat\n\n');
      }
    }, 15_000);

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      session.close();
    };

    request.raw.on('close', cleanup);
    reply.raw.on('close', cleanup);
  });
};
