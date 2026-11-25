import type { FastifyPluginAsync } from 'fastify';
import type {
  AIProviderInvokeRequest,
  GeminiInvokeRequest,
  OpenCodeInvokeRequest,
} from '../../shared/types.js';
import { getRawConnectionsConfig } from '../services/connectionsStore.js';
import { invokeGemini, testGeminiConnection } from '../services/geminiClient.js';
import {
  invokeOpenAICompat,
  testOpenAICompatConnection,
} from '../services/openaiCompatClient.js';
import { invokeOpenCode, testOpenCodeConnection } from '../services/opencodeClient.js';
import {
  autostartLocalOpenCode,
  getOpenCodeStatus,
  stopManagedOpenCodeServer,
} from '../services/opencodeLauncher.js';

export const aiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onClose', async () => {
    stopManagedOpenCodeServer();
  });

  fastify.get('/opencode/status', async () => {
    return getOpenCodeStatus();
  });

  fastify.post<{ Body?: { port?: unknown } }>(
    '/opencode/autostart',
    async (request, reply) => {
      const rawPort =
        request.body && typeof request.body === 'object' ? request.body.port : undefined;
      const port = rawPort !== undefined ? Number(rawPort) : undefined;
      const result = await autostartLocalOpenCode(
        port !== undefined ? { port } : undefined,
      );
      return reply.status(result.status).send(result.body);
    },
  );

  fastify.post('/opencode/stop', async () => {
    stopManagedOpenCodeServer();
    return { ok: true, stopped: true };
  });

  fastify.post('/opencode/test', async (_request, reply) => {
    const { opencode } = getRawConnectionsConfig();
    const result = await testOpenCodeConnection(opencode);
    return reply.status(result.status).send(result.body);
  });

  fastify.post<{ Body: OpenCodeInvokeRequest }>(
    '/opencode/invoke',
    async (request, reply) => {
      if (!request.body || typeof request.body !== 'object') {
        return reply.status(400).send({
          ok: false,
          code: 'BAD_REQUEST',
          message: 'Request body is required.',
        });
      }
      const { opencode } = getRawConnectionsConfig();
      const result = await invokeOpenCode(opencode, request.body);
      return reply.status(result.status).send(result.body);
    },
  );

  fastify.post('/gemini/test', async (_request, reply) => {
    const { gemini } = getRawConnectionsConfig();
    const result = await testGeminiConnection(gemini);
    return reply.status(result.status).send(result.body);
  });

  fastify.post<{ Body: GeminiInvokeRequest }>(
    '/gemini/invoke',
    async (request, reply) => {
      if (!request.body || typeof request.body !== 'object') {
        return reply.status(400).send({
          ok: false,
          code: 'BAD_REQUEST',
          message: 'Request body is required.',
        });
      }
      const { gemini } = getRawConnectionsConfig();
      const result = await invokeGemini(gemini, request.body);
      return reply.status(result.status).send(result.body);
    },
  );

  fastify.post<{ Body?: { provider?: 'deepseek' | 'byok' } }>(
    '/ai/test',
    async (request, reply) => {
      const provider = request.body?.provider === 'byok' ? 'byok' : 'deepseek';
      const raw = getRawConnectionsConfig();
      const cfg = provider === 'byok' ? raw.byok : raw.deepseek;
      const result = await testOpenAICompatConnection(provider, cfg);
      return reply.status(result.status).send(result.body);
    },
  );

  fastify.post<{ Body: AIProviderInvokeRequest }>(
    '/ai/invoke',
    async (request, reply) => {
      if (!request.body || typeof request.body !== 'object') {
        return reply.status(400).send({
          ok: false,
          provider: 'deepseek',
          code: 'BAD_REQUEST',
          message: 'Request body is required.',
        });
      }
      const provider = request.body.provider === 'byok' ? 'byok' : 'deepseek';
      const raw = getRawConnectionsConfig();
      const cfg = provider === 'byok' ? raw.byok : raw.deepseek;
      const result = await invokeOpenAICompat(provider, cfg, request.body);
      return reply.status(result.status).send(result.body);
    },
  );
};

export default aiRoutes;
