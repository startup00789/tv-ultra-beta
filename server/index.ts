import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyPluginAsync,
} from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { aiRoutes } from './routes/ai.js';
import { bigqueryRoutes } from './routes/bigquery.js';
import { connectionsRoutes } from './routes/connections.js';
import { marketRoutes } from './routes/market.js';
import { strategyRoutes } from './routes/strategy.js';
import { startPaperBotDaemon, stopPaperBotDaemon } from './services/paperTrader.js';

export interface BuildAppPluginEntry {
  plugin: FastifyPluginAsync;
  prefix?: string;
}

export interface BuildAppOptions {
  logger?: boolean;
  serveStatic?: boolean;
  plugins?: BuildAppPluginEntry[];
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  const app = Fastify({
    logger: options.logger ?? !isTestEnv,
    bodyLimit: 2 * 1024 * 1024, // 2 MiB
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateDistDirs = [
    path.resolve(currentDir, '..', 'dist'),
    path.resolve(currentDir, '..', '..', 'dist'),
  ];
  const distDir = candidateDistDirs.find((dir) => existsSync(path.join(dir, 'index.html')));
  const shouldServeStatic = options.serveStatic !== false && Boolean(distDir);

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || error.statusCode === 413) {
      return reply.status(413).send({
        ok: false,
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size (2 MiB).',
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        ok: false,
        error: 'VALIDATION_ERROR',
        message: error.message,
        details: error.validation,
      });
    }

    const status = error.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.status(status).send({
        ok: false,
        error: error.code || 'BAD_REQUEST',
        message: error.message,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      ok: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
    });
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      return reply.status(404).send({
        ok: false,
        error: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found.`,
      });
    }

    if (shouldServeStatic && distDir && request.method === 'GET') {
      return reply.sendFile('index.html');
    }

    return reply.status(404).send({
      ok: false,
      error: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found.`,
    });
  });

  app.get('/api/health', async () => {
    return {
      ok: true,
      service: 'tradingview-copy-api',
    };
  });

  await app.register(marketRoutes, { prefix: '/api/market' });
  await app.register(connectionsRoutes, { prefix: '/api' });
  await app.register(aiRoutes, { prefix: '/api' });
  await app.register(bigqueryRoutes, { prefix: '/api' });
  await app.register(strategyRoutes, { prefix: '/api' });

  if (options.plugins) {
    for (const entry of options.plugins) {
      if (entry.prefix) {
        await app.register(entry.plugin, { prefix: entry.prefix });
      } else {
        await app.register(entry.plugin);
      }
    }
  }

  if (shouldServeStatic && distDir) {
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
      wildcard: false,
    });
  }

  return app;
}

function normalizeForPlatform(filePath: string): string {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath;
}

function resolveRealPath(targetPath: string): string {
  try {
    return realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function isMainModule(): boolean {
  if (process.env.VITEST || !process.argv[1]) {
    return false;
  }

  const currentFile = normalizeForPlatform(resolveRealPath(fileURLToPath(import.meta.url)));
  const entryFile = normalizeForPlatform(resolveRealPath(path.resolve(process.argv[1])));

  if (currentFile === entryFile) {
    return true;
  }

  if (path.extname(entryFile) === '') {
    const currentWithoutExt = currentFile.replace(/\.(ts|mts|js|mjs)$/i, '');
    return currentWithoutExt === entryFile;
  }

  return false;
}

if (isMainModule()) {
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '127.0.0.1';

  buildApp()
    .then(async (app) => {
      app.addHook('onClose', async () => {
        stopPaperBotDaemon();
      });
      await app.listen({ port, host });
      startPaperBotDaemon(10_000);
    })
    .catch((err) => {
      console.error('Failed to start Fastify server:', err);
      process.exit(1);
    });
}
