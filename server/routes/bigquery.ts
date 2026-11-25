import type { FastifyPluginAsync } from 'fastify';
import type {
  BigQueryDryRunRequest,
  BigQueryExecuteRequest,
} from '../../shared/types.js';
import { getBigQueryPresets } from '../services/bigquerySandbox.js';
import {
  dryRunBigQuery,
  executeBigQuery,
  testBigQueryConnection,
} from '../services/bigqueryService.js';
import { getRawConnectionsConfig } from '../services/connectionsStore.js';

interface PresetsQuery {
  symbol?: unknown;
}

export const bigqueryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: PresetsQuery }>(
    '/bigquery/presets',
    async (request, reply) => {
      const { symbol } = request.query;
      if (symbol !== undefined && typeof symbol !== 'string') {
        return reply.status(400).send({
          ok: false,
          code: 'BAD_REQUEST',
          message: 'Query parameter "symbol" must be a string.',
        });
      }
      const { bigquery } = getRawConnectionsConfig();
      return {
        presets: getBigQueryPresets(symbol || 'AAPL', bigquery),
      };
    },
  );

  fastify.post('/bigquery/test', async (_request, reply) => {
    const { bigquery } = getRawConnectionsConfig();
    const result = await testBigQueryConnection(bigquery);
    return reply.status(result.status).send(result.body);
  });

  fastify.post<{ Body: BigQueryDryRunRequest }>(
    '/bigquery/dry-run',
    async (request, reply) => {
      if (!request.body || typeof request.body !== 'object') {
        return reply.status(400).send({
          ok: false,
          mode: 'sandbox',
          valid: false,
          estimatedBytes: 0,
          error: 'Request body is required.',
        });
      }
      const { bigquery } = getRawConnectionsConfig();
      const result = await dryRunBigQuery(bigquery, request.body);
      return reply.status(result.status).send(result.body);
    },
  );

  fastify.post<{ Body: BigQueryExecuteRequest }>(
    '/bigquery/execute',
    async (request, reply) => {
      if (!request.body || typeof request.body !== 'object') {
        return reply.status(400).send({
          ok: false,
          executionMode: 'sandbox',
          jobId: 'bq_invalid_req',
          estimatedBytes: 0,
          durationMs: 0,
          queryType: 'CUSTOM',
          columns: [],
          rows: [],
          error: 'Request body is required.',
          code: 'BAD_REQUEST',
        });
      }
      const { bigquery } = getRawConnectionsConfig();
      const result = await executeBigQuery(bigquery, request.body);
      return reply.status(result.status).send(result.body);
    },
  );
};

export default bigqueryRoutes;
