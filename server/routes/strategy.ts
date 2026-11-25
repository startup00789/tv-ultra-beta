import type { FastifyPluginAsync } from 'fastify';
import type {
  MasterPromptRequest,
  OHLCVBar,
  PaperFirewallConfig,
  PaperManualOrderRequest,
  StrategyBacktestRequest,
  StrategyExplainRequest,
  StrategyRefineRequest,
  StrategyRuleSpec,
  StrategySweepRequest,
  Timeframe,
} from '../../shared/types.js';
import {
  runParameterSweep,
  runStrategyBacktest,
} from '../../shared/strategyEngine.js';
import {
  MAX_ULTRA_BARS,
  getOHLCVBars,
  getUltraOHLCVBars,
  isValidTimeframe,
} from '../services/marketData.js';
import {
  closePaperPosition,
  deletePaperBot,
  deployPaperBot,
  evaluatePaperBotsForSymbol,
  executeManualPaperTrade,
  getPaperAccountState,
  placeManualPaperOrder,
  resetPaperAccount,
  togglePaperBotStatus,
  triggerPaperKillSwitch,
  updatePaperFirewall,
  updatePaperPositionBrackets,
} from '../services/paperTrader.js';
import {
  auditStrategyDescriptionAndSpec,
  explainStrategyDecision,
  generateMasterPromptDraft,
  reconcileMasterPromptEditsToSpec,
  refineMasterPromptDraft,
} from '../services/strategyCompiler.js';

async function resolveBars(
  symbol: string,
  timeframe: Timeframe,
  supplied?: OHLCVBar[],
  deepOpts?: { historyLimit?: number; fromTime?: number; toTime?: number },
): Promise<OHLCVBar[]> {
  if (
    !deepOpts?.historyLimit &&
    deepOpts?.fromTime === undefined &&
    deepOpts?.toTime === undefined &&
    Array.isArray(supplied) &&
    supplied.length >= 10
  ) {
    return supplied;
  }
  const tf: Timeframe = isValidTimeframe(timeframe) ? timeframe : '1D';
  const sym = symbol.trim().toUpperCase() || 'AAPL';
  if (deepOpts?.historyLimit || deepOpts?.fromTime !== undefined || deepOpts?.toTime !== undefined) {
    const targetLimit = Math.min(MAX_ULTRA_BARS, Math.max(100, deepOpts.historyLimit ?? 5000));
    const ultra = await getUltraOHLCVBars({
      symbol: sym,
      timeframe: tf,
      limit: targetLimit,
      fromTime: deepOpts.fromTime,
      toTime: deepOpts.toTime,
    });
    if (ultra.bars.length >= 10) {
      return ultra.bars;
    }
  }
  if (Array.isArray(supplied) && supplied.length >= 10) {
    return supplied;
  }
  const res = await getOHLCVBars({
    symbol: sym,
    timeframe: tf,
    limit: 300,
  });
  return res.bars;
}

export const strategyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: MasterPromptRequest }>(
    '/strategy/master-prompt',
    async (request, reply) => {
      const body = request.body;
      if (!body || typeof body.description !== 'string' || !body.description.trim()) {
        return reply.status(400).send({
          ok: false,
          message: 'Please describe your strategy in plain English before generating a Master Prompt.',
        });
      }
      const res = await generateMasterPromptDraft(body);
      return reply.status(200).send(res);
    },
  );

  fastify.post<{ Body: StrategyRefineRequest }>(
    '/strategy/refine',
    async (request, reply) => {
      const body = request.body;
      if (!body || !body.draft || !body.draft.compiledSpec) {
        return reply.status(400).send({
          ok: false,
          message: 'Existing MasterPromptDraft is required to refine.',
        });
      }
      const res = await refineMasterPromptDraft(body);
      return reply.status(200).send(res);
    },
  );

  fastify.post<{ Body: StrategyBacktestRequest }>(
    '/strategy/backtest',
    async (request, reply) => {
      const body = request.body;
      if (!body || !body.spec) {
        return reply.status(400).send({
          ok: false,
          message: 'Compiled StrategyRuleSpec is required.',
        });
      }
      if (!body.approved) {
        return reply.status(400).send({
          ok: false,
          message: 'Master Prompt confirmation is required before running the backtest.',
        });
      }

      const reconciledSpec = body.masterPrompt
        ? reconcileMasterPromptEditsToSpec(body.masterPrompt, body.spec)
        : body.spec;

      const issues = auditStrategyDescriptionAndSpec(
        body.descriptionForAudit ?? body.masterPrompt ?? reconciledSpec.summary ?? '',
        reconciledSpec,
      );
      const critical = issues.filter((i) => i.severity === 'critical');
      if (critical.length > 0) {
        return reply.status(400).send({
          ok: false,
          auditIssues: issues,
          message: `Strict Rule Audit blocked execution: ${critical.map((c) => c.explanation).join(' | ')}`,
        });
      }

      const symbol = body.symbol ?? reconciledSpec.symbol ?? 'AAPL';
      const timeframe = body.timeframe ?? reconciledSpec.timeframe ?? '1D';
      const bars = await resolveBars(symbol, timeframe, body.bars, {
        historyLimit: body.historyLimit,
        fromTime: body.fromTime,
        toTime: body.toTime,
      });
      const report = runStrategyBacktest(bars, {
        ...reconciledSpec,
        symbol: symbol.toUpperCase(),
        timeframe,
      });

      // Downsample massive 40k-bar equityCurve for crisp transport while preserving exact endpoints & extremes
      if (report.equityCurve.length > 1600) {
        const stride = Math.ceil(report.equityCurve.length / 1400);
        const sampled = report.equityCurve.filter(
          (_pt, idx) => idx === 0 || idx === report.equityCurve.length - 1 || idx % stride === 0,
        );
        report.equityCurve = sampled;
      }

      return reply.status(200).send({
        ok: true,
        report,
        auditIssues: issues,
      });
    },
  );

  fastify.post<{ Body: StrategySweepRequest }>(
    '/strategy/sweep',
    async (request, reply) => {
      const body = request.body;
      if (!body || !body.spec) {
        return reply.status(400).send({
          ok: false,
          message: 'StrategyRuleSpec is required for parameter sweep.',
        });
      }
      const symbol = body.symbol ?? body.spec.symbol ?? 'AAPL';
      const timeframe = body.timeframe ?? body.spec.timeframe ?? '1D';
      const bars = await resolveBars(symbol, timeframe, body.bars);
      const sweep = runParameterSweep(bars, body.spec, body.metric ?? 'sharpeRatio');
      return reply.status(200).send(sweep);
    },
  );

  fastify.post<{ Body: StrategyExplainRequest }>(
    '/strategy/explain',
    async (request, reply) => {
      const body = request.body;
      if (!body || !body.spec || typeof body.question !== 'string' || !body.question.trim()) {
        return reply.status(400).send({
          ok: false,
          message: 'StrategyRuleSpec and a question are required.',
        });
      }
      const bars = await resolveBars(
        body.spec.symbol,
        body.spec.timeframe,
        body.bars,
      );
      const explained = await explainStrategyDecision(body, bars);
      return reply.status(200).send(explained);
    },
  );

  // ============================================================================
  // Built-In Automated Paper Trading Routes (No Real Money)
  // ============================================================================

  fastify.get('/paper/state', async () => {
    return {
      ok: true,
      state: getPaperAccountState(),
    };
  });

  fastify.post<{
    Body: {
      name?: string;
      symbol: string;
      timeframe: Timeframe;
      spec: StrategyRuleSpec;
      approvedMasterPrompt: string;
    };
  }>('/paper/bots', async (request, reply) => {
    const body = request.body;
    if (!body || !body.spec) {
      return reply.status(400).send({ ok: false, message: 'Strategy spec is required.' });
    }
    const res = deployPaperBot(body);
    if (!res.ok) {
      return reply.status(400).send({
        ok: false,
        message: res.error,
        state: res.state,
      });
    }
    return reply.status(200).send({
      ok: true,
      bot: res.bot,
      state: res.state,
    });
  });

  fastify.post<{ Params: { id: string } }>(
    '/paper/bots/:id/toggle',
    async (request, reply) => {
      const res = togglePaperBotStatus(request.params.id);
      if (!res.ok) {
        return reply.status(400).send({
          ok: false,
          message: res.error,
          state: res.state,
        });
      }
      return reply.status(200).send({ ok: true, state: res.state });
    },
  );

  fastify.delete<{ Params: { id: string } }>('/paper/bots/:id', async (request) => {
    const state = deletePaperBot(request.params.id);
    return { ok: true, state };
  });

  fastify.post<{
    Body: {
      symbol: string;
      timeframe: Timeframe;
      bars?: OHLCVBar[];
      livePrice?: number;
    };
  }>('/paper/evaluate', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.symbol !== 'string') {
      return reply.status(400).send({ ok: false, message: 'symbol is required.' });
    }
    const tf: Timeframe = isValidTimeframe(body.timeframe) ? body.timeframe : '1D';
    const bars = await resolveBars(body.symbol, tf, body.bars);
    const state = evaluatePaperBotsForSymbol({
      symbol: body.symbol,
      timeframe: tf,
      bars,
      livePrice: body.livePrice,
    });
    return reply.status(200).send({ ok: true, state });
  });

  fastify.post<{ Body?: { reason?: string; latestPrices?: Record<string, number> } }>(
    '/paper/kill-switch',
    async (request) => {
      const state = triggerPaperKillSwitch(
        request.body?.reason,
        request.body?.latestPrices,
      );
      return { ok: true, state };
    },
  );

  fastify.post<{ Body?: { initialCash?: number } }>('/paper/reset', async (request) => {
    const state = resetPaperAccount(request.body?.initialCash);
    return { ok: true, state };
  });

  fastify.post<{
    Body: {
      symbol: string;
      side: 'long' | 'short';
      notionalUsd?: number;
      quantity?: number;
      livePrice: number;
      reason?: string;
    };
  }>('/paper/manual-trade', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.symbol !== 'string' || (body.side !== 'long' && body.side !== 'short')) {
      return reply.status(400).send({ ok: false, message: 'symbol and side (long|short) are required.' });
    }
    const res = executeManualPaperTrade({
      symbol: body.symbol,
      side: body.side,
      notionalUsd: body.notionalUsd,
      quantity: body.quantity,
      livePrice: body.livePrice,
      reason: body.reason,
    });
    if (!res.ok) {
      return reply.status(400).send({ ok: false, message: res.error, state: res.state });
    }
    return reply.status(200).send({ ok: true, state: res.state });
  });

  fastify.post<{ Body: PaperManualOrderRequest }>('/paper/order', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.symbol !== 'string' || (body.side !== 'long' && body.side !== 'short')) {
      return reply.status(400).send({ ok: false, message: 'symbol and side (long|short) are required.' });
    }
    const res = await placeManualPaperOrder(body);
    if (!res.ok) {
      return reply.status(400).send({ ok: false, message: res.error, state: res.state });
    }
    return reply.status(200).send({ ok: true, state: res.state });
  });

  fastify.post<{ Body: { botId: string; symbol: string; exitPrice?: number } }>(
    '/paper/positions/close',
    async (request, reply) => {
      const { botId, symbol, exitPrice } = request.body ?? {};
      if (!symbol) {
        return reply.status(400).send({ ok: false, message: 'symbol is required.' });
      }
      const res = closePaperPosition(botId || '*', symbol, exitPrice);
      if (!res.ok) {
        return reply.status(400).send({ ok: false, message: res.error, state: res.state });
      }
      return reply.status(200).send({ ok: true, state: res.state });
    },
  );

  fastify.post<{
    Body: { botId: string; symbol: string; stopLossPrice?: number; takeProfitPrice?: number };
  }>('/paper/positions/brackets', async (request, reply) => {
    const { botId, symbol, stopLossPrice, takeProfitPrice } = request.body ?? {};
    if (!botId || !symbol) {
      return reply.status(400).send({ ok: false, message: 'botId and symbol are required.' });
    }
    const res = updatePaperPositionBrackets(botId, symbol, stopLossPrice, takeProfitPrice);
    if (!res.ok) {
      return reply.status(400).send({ ok: false, message: res.error, state: res.state });
    }
    return reply.status(200).send({ ok: true, state: res.state });
  });

  fastify.post<{ Body: Partial<PaperFirewallConfig> }>('/paper/firewall', async (request) => {
    const state = updatePaperFirewall(request.body ?? {});
    return { ok: true, state };
  });
};

export default strategyRoutes;
