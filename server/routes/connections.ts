import type { FastifyPluginAsync } from 'fastify';
import type { ConnectionsUpdateRequest } from '../../shared/types.js';
import {
  ConnectionConfigError,
  getMaskedConnectionsConfig,
  updateConnectionsConfig,
} from '../services/connectionsStore.js';

export const connectionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/connections', async () => {
    return getMaskedConnectionsConfig();
  });

  fastify.post<{ Body: ConnectionsUpdateRequest }>(
    '/connections',
    async (request, reply) => {
      try {
        const updated = updateConnectionsConfig(request.body);
        return updated;
      } catch (err) {
        if (err instanceof ConnectionConfigError) {
          return reply.status(err.statusCode).send({
            ok: false,
            code: err.code,
            error: err.code,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
};

export default connectionsRoutes;
