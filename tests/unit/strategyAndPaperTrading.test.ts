import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OHLCVBar, StrategyRuleSpec } from '../../shared/types.js';
import {
  evaluateBarDecision,
  runParameterSweep,
  runStrategyBacktest,
} from '../../shared/strategyEngine.js';
import { buildApp } from '../../server/index.js';
import { resetConnectionsConfig } from '../../server/services/connectionsStore.js';
import { clearMarketCache } from '../../server/services/marketData.js';
import { resetPaperAccount } from '../../server/services/paperTrader.js';
import {
  auditStrategyDescriptionAndSpec,
  explainStrategyDecision,
  generateMasterPromptDraft,
  parseNaturalLanguageToRuleSpec,
  reconcileMasterPromptEditsToSpec,
} from '../../server/services/strategyCompiler.js';
import {
  computeClusteredSupportResistance,
  computeSessionAndLiquidityLevels,
  computeSmartMoneyConcepts,
  computeVolumeProfile,
} from '../../src/lib/technicalOverlays.js';
import { runLocalCopilotCommand } from '../../src/lib/localCopilotEngine.js';

function makeTrendingSineBars(count = 160): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  const startSec = Math.floor(Date.UTC(2025, 0, 1) / 1000);
  for (let i = 0; i < count; i += 1) {
    const wave = Math.sin(i / 6) * 8 + i * 0.18;
    const prevWave = i === 0 ? wave : Math.sin((i - 1) / 6) * 8 + (i - 1) * 0.18;
    const open = 100 + prevWave;
    const close = 100 + wave;
    const high = Math.max(open, close) + 1.4;
    const low = Math.min(open, close) - 1.4;
    bars.push({
      time: startSec + i * 86400,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 1000 + (i % 15) * 150,
    });
  }
  return bars;
}

describe('Strategy Engine, Strict Compiler, Why? Interrogator & Auto Paper Trading', () => {
  beforeEach(() => {
    resetConnectionsConfig();
    resetPaperAccount(100_000);
    clearMarketCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('executes zero-lookahead backtest on EMA 9/21 cross with SL-before-TP, metrics, and sweep', () => {
    const bars = makeTrendingSineBars(160);
    const spec = parseNaturalLanguageToRuleSpec(
      'Buy when EMA 9 crosses above EMA 21 and RSI 14 < 75; exit when EMA 9 crosses below EMA 21 with 3% stop loss and 8% take profit.',
      'AAPL',
      '1D',
    );
    expect(spec.execution.processOnClose).toBe(false);
    expect(spec.risk.stopLossPct).toBe(3);
    expect(spec.risk.takeProfitPct).toBe(8);

    const report = runStrategyBacktest(bars, spec);
    expect(report.barCount).toBe(bars.length);
    expect(report.equityCurve.length).toBe(bars.length);
    expect(report.all.totalTrades).toBeGreaterThanOrEqual(2);
    expect(Number.isFinite(report.sharpeRatio)).toBe(true);
    expect(Number.isFinite(report.sortinoRatio)).toBe(true);
    expect(Number.isFinite(report.calmarRatio)).toBe(true);

    // Zero lookahead check: next-bar open execution means entryBarIndex > signal bar index
    for (const trade of report.trades) {
      expect(trade.entryBarIndex).toBeGreaterThan(0);
      expect(trade.exitBarIndex).toBeGreaterThanOrEqual(trade.entryBarIndex);
      expect(trade.entryTrace.length).toBeGreaterThan(0);
    }

    // Intrabar conservative SL-before-TP verification when both SL & TP touch on same candle
    const closeAboveSpec: StrategyRuleSpec = {
      ...spec,
      id: 'sl-first-test',
      entryLong: {
        combinator: 'AND',
        conditions: [
          {
            id: 'always-in',
            label: 'Close > 0',
            left: { kind: 'price', field: 'close' },
            operator: '>',
            right: { kind: 'number', value: 0 },
          },
        ],
      },
      exitLong: undefined,
      risk: { ...spec.risk, stopLossPct: 2, takeProfitPct: 2 },
      execution: { ...spec.execution, processOnClose: true },
    };
    const shockBars: OHLCVBar[] = [
      { time: 1700000000, open: 100, high: 101, low: 99, close: 100, volume: 100 },
      { time: 1700086400, open: 100, high: 110, low: 90, close: 102, volume: 200 },
      { time: 1700172800, open: 102, high: 103, low: 101, close: 102, volume: 150 },
    ];
    const shockReport = runStrategyBacktest(shockBars, closeAboveSpec);
    expect(shockReport.trades[0]?.exitReason).toBe('stop_loss');

    const sweep = runParameterSweep(bars, spec, 'sharpeRatio');
    expect(sweep.ok).toBe(true);
    expect(sweep.results.length).toBeGreaterThan(0);
    expect(sweep.best).toBeDefined();
  });

  it('strictly audits lookahead bias, vague wording, contradictions, unfavorable R:R and clears with strict fixes', async () => {
    const lookaheadPrompt = 'Buy when tomorrow close looks bullish and close > 100';
    const baseSpec = parseNaturalLanguageToRuleSpec(lookaheadPrompt, 'BTCUSDT', '1h');
    const badSpec: StrategyRuleSpec = {
      ...baseSpec,
      entryLong: {
        combinator: 'AND',
        conditions: [
          {
            id: 'c1',
            label: 'RSI(14) > 70',
            left: { kind: 'indicator', indicator: 'rsi', period: 14 },
            operator: '>',
            right: { kind: 'number', value: 70 },
          },
          {
            id: 'c2',
            label: 'RSI(14) < 30',
            left: { kind: 'indicator', indicator: 'rsi', period: 14 },
            operator: '<',
            right: { kind: 'number', value: 30 },
          },
        ],
      },
      risk: { ...baseSpec.risk, stopLossPct: 5, takeProfitPct: 2 },
    };

    const issues = auditStrategyDescriptionAndSpec(
      "Buy when tomorrow's close looks bullish with high volume",
      badSpec,
    );
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has('LOOKAHEAD_BIAS')).toBe(true);
    expect(codes.has('CONTRADICTORY_CONDITIONS')).toBe(true);
    expect(codes.has('VAGUE_LANGUAGE')).toBe(true);
    expect(codes.has('UNFAVORABLE_RR')).toBe(true);

    // Master prompt auto-fix removes lookahead text & missing rules so approval can proceed
    const draftRes = await generateMasterPromptDraft({
      description: "Buy when tomorrow's close crosses above EMA 9",
      symbol: 'BTCUSDT',
      timeframe: '1h',
      provider: 'deterministic',
      applyStrictFixes: true,
    });
    expect(draftRes.ok).toBe(true);
    expect(draftRes.draft.approved).toBe(false);
    expect(draftRes.draft.hasCriticalIssues).toBe(false);
    expect(draftRes.draft.masterPrompt).toContain('Is this Master Prompt & Rule Specification fine');
  });

  it('explains any trade or bar with exact PASS/FAIL ConditionEvalTrace', async () => {
    const bars = makeTrendingSineBars(120);
    const spec = parseNaturalLanguageToRuleSpec(
      'Buy when EMA 9 crosses above EMA 21 with 2% stop loss and 5% take profit.',
      'AAPL',
      '1D',
    );
    const report = runStrategyBacktest(bars, spec);
    const firstTrade = report.trades[0];
    expect(firstTrade).toBeDefined();

    const explained = await explainStrategyDecision(
      {
        question: 'Why did Trade #1 trigger?',
        spec,
        provider: 'deterministic',
        report,
        tradeNumber: firstTrade.tradeNumber,
        bars,
      },
      bars,
    );
    expect(explained.ok).toBe(true);
    expect(explained.inspectedTrade?.tradeNumber).toBe(firstTrade.tradeNumber);
    expect(explained.groundTruthTrace).toBeDefined();
    expect(explained.groundTruthTrace?.entryLongChecks.length).toBeGreaterThan(0);
    expect(explained.answer).toContain('PASS');

    // Also test direct evaluateBarDecision trace
    const barTrace = evaluateBarDecision(bars, spec, bars.length - 1);
    expect(barTrace.barIndex).toBe(bars.length - 1);
    expect(barTrace.entryLongChecks.length).toBeGreaterThan(0);
  });

  it('enforces approval & audit gate on /api/strategy/backtest and paper trading safety + kill switch on /api/paper/*', async () => {
    const app = await buildApp({ logger: false, serveStatic: false });
    const bars = makeTrendingSineBars(100);
    const spec = parseNaturalLanguageToRuleSpec(
      'Buy when EMA 9 crosses above EMA 21 with 2% stop loss and 6% take profit.',
      'AAPL',
      '1D',
    );

    // 1. Unapproved backtest rejected (400)
    const unapproved = await app.inject({
      method: 'POST',
      url: '/api/strategy/backtest',
      payload: { spec, approved: false, bars },
    });
    expect(unapproved.statusCode).toBe(400);

    // 2. Approved with lookahead text in audit rejected (400)
    const lookaheadBlocked = await app.inject({
      method: 'POST',
      url: '/api/strategy/backtest',
      payload: {
        spec,
        approved: true,
        bars,
        descriptionForAudit: 'Peek into next bar high before buying',
      },
    });
    expect(lookaheadBlocked.statusCode).toBe(400);

    // 3. Approved clean backtest succeeds (200)
    const cleanBacktest = await app.inject({
      method: 'POST',
      url: '/api/strategy/backtest',
      payload: {
        spec,
        approved: true,
        masterPrompt: 'Approved clean EMA 9/21 strategy with 2% SL / 6% TP.',
        bars,
      },
    });
    expect(cleanBacktest.statusCode).toBe(200);
    const btJson = cleanBacktest.json();
    expect(btJson.ok).toBe(true);
    expect(btJson.report.all.totalTrades).toBeGreaterThanOrEqual(1);

    // 4. Deploy paper bot using a real generated Master Prompt (must not self-trigger on "Strict Anti-Lookahead")
    const realDraft = await generateMasterPromptDraft({
      description: 'Buy when EMA 9 crosses above EMA 21 with 2% stop loss and 6% take profit.',
      symbol: 'AAPL',
      timeframe: '1D',
      provider: 'deterministic',
      applyStrictFixes: true,
    });
    const deployRes = await app.inject({
      method: 'POST',
      url: '/api/paper/bots',
      payload: {
        name: 'Strict EMA Paper Bot',
        symbol: 'AAPL',
        timeframe: '1D',
        spec: realDraft.draft.compiledSpec,
        approvedMasterPrompt: realDraft.draft.masterPrompt,
      },
    });
    expect(deployRes.statusCode).toBe(200);
    const deployed = deployRes.json();
    expect(deployed.state.mode).toBe('paper_only');
    expect(deployed.bot.status).toBe('armed');

    // 5. Force entry evaluation via a guaranteed Close > 0 signal and verify Kill Switch flatten
    const entrySpec: StrategyRuleSpec = {
      ...spec,
      entryLong: {
        combinator: 'AND',
        conditions: [
          {
            id: 'force-entry',
            label: 'Close > 1',
            left: { kind: 'price', field: 'close' },
            operator: '>',
            right: { kind: 'number', value: 1 },
          },
        ],
      },
    };
    const deployEntry = await app.inject({
      method: 'POST',
      url: '/api/paper/bots',
      payload: {
        name: 'Force Entry Bot',
        symbol: 'AAPL',
        timeframe: '1D',
        spec: entrySpec,
        approvedMasterPrompt: 'Approved Close > 1 paper test strategy.',
      },
    });
    expect(deployEntry.statusCode).toBe(200);

    const evalRes = await app.inject({
      method: 'POST',
      url: '/api/paper/evaluate',
      payload: {
        symbol: 'AAPL',
        timeframe: '1D',
        bars,
        livePrice: bars[bars.length - 1].close,
      },
    });
    expect(evalRes.statusCode).toBe(200);
    const afterEval = evalRes.json();
    expect(afterEval.state.positions.length).toBe(1);
    expect(afterEval.state.orders[0].action).toBe('open_long');
    expect(afterEval.state.orders[0].ruleTrace.length).toBeGreaterThan(0);

    // Trigger Global Kill Switch -> flattens open positions and kills armed bots
    const ksRes = await app.inject({
      method: 'POST',
      url: '/api/paper/kill-switch',
      payload: {
        reason: 'Unit test emergency halt',
        latestPrices: { AAPL: bars[bars.length - 1].close },
      },
    });
    expect(ksRes.statusCode).toBe(200);
    const ksState = ksRes.json().state;
    expect(ksState.killSwitchActive).toBe(true);
    expect(ksState.positions.length).toBe(0);
    expect(ksState.bots.every((b: { status: string }) => b.status === 'killed')).toBe(true);

    // Cannot deploy another bot while Kill Switch is active
    const blockedDeploy = await app.inject({
      method: 'POST',
      url: '/api/paper/bots',
      payload: {
        name: 'Blocked Bot',
        symbol: 'AAPL',
        timeframe: '1D',
        spec: entrySpec,
        approvedMasterPrompt: 'Approved Close > 1.',
      },
    });
    expect(blockedDeploy.statusCode).toBe(400);

    // Reset restores clean $100,000 paper state
    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/paper/reset',
      payload: { initialCash: 100000 },
    });
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().state.killSwitchActive).toBe(false);
    expect(resetRes.json().state.cash).toBe(100000);

    await app.close();
  });

  it('halts bots and flattens positions when daily max-loss circuit breaker triggers', async () => {
    const app = await buildApp({ logger: false, serveStatic: false });
    const bars = makeTrendingSineBars(40);
    const baseSpec = parseNaturalLanguageToRuleSpec(
      'Buy when Close > 1 with 10% stop loss and 30% take profit and max daily loss 2%.',
      'AAPL',
      '1D',
    );
    const aggSpec: StrategyRuleSpec = {
      ...baseSpec,
      entryLong: {
        combinator: 'AND',
        conditions: [
          {
            id: 'entry-close',
            label: 'Close > 1',
            left: { kind: 'price', field: 'close' },
            operator: '>',
            right: { kind: 'number', value: 1 },
          },
        ],
      },
      risk: {
        ...baseSpec.risk,
        riskPerTradePct: 5,
        maxPositionPct: 90,
        maxDailyLossPct: 2,
        stopLossPct: 20,
      },
    };

    const deployRes = await app.inject({
      method: 'POST',
      url: '/api/paper/bots',
      payload: {
        name: 'Circuit Breaker Bot',
        symbol: 'AAPL',
        timeframe: '1D',
        spec: aggSpec,
        approvedMasterPrompt: 'Approved Close > 1.',
      },
    });
    expect(deployRes.statusCode).toBe(200);

    const openRes = await app.inject({
      method: 'POST',
      url: '/api/paper/evaluate',
      payload: { symbol: 'AAPL', timeframe: '1D', bars, livePrice: 100 },
    });
    expect(openRes.json().state.positions.length).toBe(1);

    // Crash price sharply enough to exceed 2% daily portfolio drawdown
    const crashRes = await app.inject({
      method: 'POST',
      url: '/api/paper/evaluate',
      payload: { symbol: 'AAPL', timeframe: '1D', bars, livePrice: 80 },
    });
    const crashed = crashRes.json().state;
    expect(crashed.positions.length).toBe(0);
    expect(crashed.bots[0].status).toBe('halted_daily_loss');
    expect(crashed.orders[0].action).toBe('blocked_risk');

    await app.close();
  });

  it('computes Supertrend/ADX/Volume/Pattern rules plus Walk-Forward, Monte Carlo, Cost Stress, Regimes, and Quant Scorecard', () => {
    const bars = makeTrendingSineBars(180);
    const spec = parseNaturalLanguageToRuleSpec(
      'Buy when Supertrend bullish and ADX 14 > 15 and volume > 1.0x with 2x ATR stop and 6% take profit.',
      'BTCUSDT',
      '1h',
    );
    expect(spec.risk.stopLossAtrMult).toBe(2);
    expect(spec.entryLong?.conditions.some((c) => c.left.kind === 'indicator' && c.left.indicator === 'supertrend_dir')).toBe(true);
    expect(spec.entryLong?.conditions.some((c) => c.left.kind === 'indicator' && c.left.indicator === 'adx')).toBe(true);

    const report = runStrategyBacktest(bars, spec);
    expect(report.walkForward).toBeDefined();
    expect(['ROBUST', 'FRAGILE', 'OVERFIT']).toContain(report.walkForward?.verdict);
    expect(report.monteCarlo).toBeDefined();
    expect(report.monteCarlo?.iterations).toBe(500);
    expect(report.costStress).toBeDefined();
    expect(report.regimes?.length).toBe(3);
    expect(report.scorecard).toBeDefined();
    expect(['A', 'B', 'C', 'D', 'F']).toContain(report.scorecard?.grade);
  });

  it('reconciles manual Master Prompt edits & conversational refinements and enforces Paper Firewall on manual orders', async () => {
    const app = await buildApp({ logger: false, serveStatic: false });
    const bars = makeTrendingSineBars(120);

    const draftRes = await generateMasterPromptDraft({
      description: 'Buy when EMA 9 crosses above EMA 21 with 2% stop loss and 6% take profit.',
      symbol: 'AAPL',
      timeframe: '1D',
      provider: 'deterministic',
      applyStrictFixes: true,
    });

    const editedText = draftRes.draft.masterPrompt
      .replace(/Stop-Loss:\s*2%/i, 'Stop-Loss: 1.5%')
      .replace(/Take-Profit:\s*6%/i, 'Take-Profit: 7.5%');

    const reconciled = reconcileMasterPromptEditsToSpec(editedText, draftRes.draft.compiledSpec);
    expect(reconciled.risk.stopLossPct).toBe(1.5);
    expect(reconciled.risk.takeProfitPct).toBe(7.5);

    const refineRes = await app.inject({
      method: 'POST',
      url: '/api/strategy/refine',
      payload: {
        draft: draftRes.draft,
        editedMasterPrompt: editedText,
        userFollowup: 'Also require ADX 14 > 20',
        provider: 'deterministic',
      },
    });
    expect(refineRes.statusCode).toBe(200);
    const refinedBody = refineRes.json();
    expect(refinedBody.draft.compiledSpec.risk.stopLossPct).toBe(1.5);
    expect(refinedBody.draft.compiledSpec.risk.takeProfitPct).toBe(7.5);
    expect(
      refinedBody.draft.compiledSpec.entryLong.conditions.some(
        (c: { left: { kind: string; indicator?: string } }) =>
          c.left.kind === 'indicator' && c.left.indicator === 'adx',
      ),
    ).toBe(true);

    // Backtest endpoint reconciles edited masterPrompt automatically
    const btRes = await app.inject({
      method: 'POST',
      url: '/api/strategy/backtest',
      payload: {
        spec: draftRes.draft.compiledSpec,
        masterPrompt: editedText,
        approved: true,
        bars,
      },
    });
    expect(btRes.statusCode).toBe(200);
    expect(btRes.json().report.spec.risk.stopLossPct).toBe(1.5);

    // Manual Paper Order + Firewall maxOpenPositions check + Close Position
    await app.inject({
      method: 'POST',
      url: '/api/paper/firewall',
      payload: { maxOpenPositions: 1 },
    });

    const ord1 = await app.inject({
      method: 'POST',
      url: '/api/paper/order',
      payload: {
        symbol: 'AAPL',
        side: 'long',
        notionalUsd: 2000,
        stopLossPct: 2,
        takeProfitPct: 5,
        price: 180,
      },
    });
    expect(ord1.statusCode).toBe(200);
    expect(ord1.json().state.positions.length).toBe(1);

    // Second distinct symbol should be blocked by maxOpenPositions = 1 firewall
    const ord2 = await app.inject({
      method: 'POST',
      url: '/api/paper/order',
      payload: {
        symbol: 'BTCUSDT',
        side: 'long',
        notionalUsd: 2000,
        price: 65000,
      },
    });
    expect(ord2.statusCode).toBe(400);
    expect(ord2.json().state.positions.length).toBe(1);
    expect(ord2.json().state.orders[0].action).toBe('blocked_risk');

    // Close AAPL position cleanly
    const pos = ord1.json().state.positions[0];
    const closeRes = await app.inject({
      method: 'POST',
      url: '/api/paper/positions/close',
      payload: { botId: pos.botId, symbol: pos.symbol, exitPrice: 185 },
    });
    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json().state.positions.length).toBe(0);
    expect(closeRes.json().state.realizedPnl).toBeGreaterThan(0);

    await app.close();
  });

  it('computes VPVR, SMC, Clustered S/R, and executes Instant Hybrid /slash commands in <50ms', () => {
    const bars = makeTrendingSineBars(120);
    const sr = computeClusteredSupportResistance(bars, 2);
    expect(sr.length).toBeGreaterThanOrEqual(2);

    const vp = computeVolumeProfile(bars, 24);
    expect(vp).not.toBeNull();
    expect(vp!.buckets.length).toBe(24);
    expect(vp!.vahPrice).toBeGreaterThanOrEqual(vp!.pocPrice);
    expect(vp!.pocPrice).toBeGreaterThanOrEqual(vp!.valPrice);

    const smc = computeSmartMoneyConcepts(bars);
    expect(Array.isArray(smc.structures)).toBe(true);
    expect(Array.isArray(smc.zones)).toBe(true);

    const ctx = {
      symbol: 'BTCUSDT',
      timeframe: '1h' as const,
      bars,
      watchlist: [
        {
          symbol: 'BTCUSDT',
          name: 'Bitcoin',
          exchange: 'BINANCE',
          assetClass: 'crypto' as const,
          last: 68000,
          change: 1400,
          changePercent: 2.1,
          volume: 120000,
          avgVolume30d: 95000,
        },
      ],
    };

    expect(runLocalCopilotCommand('hello world', ctx)).toBeNull();

    const srCmd = runLocalCopilotCommand('/sr', ctx);
    expect(srCmd?.handledLocally).toBe(true);
    expect(srCmd!.chartActions.length).toBeGreaterThanOrEqual(2);
    expect(srCmd!.toolCalls[0].durationMs).toBeLessThan(100);

    expect(runLocalCopilotCommand('/vp', ctx)?.chartActions[0]?.type).toBe('toggle_vp');
    expect(runLocalCopilotCommand('/smc', ctx)?.chartActions[0]?.type).toBe('toggle_smc');
    expect(runLocalCopilotCommand('/sessions', ctx)?.chartActions[0]?.type).toBe('toggle_sessions');
    expect(runLocalCopilotCommand('/forward', ctx)?.chartActions[0]?.type).toBe('start_forward_test');
    expect(runLocalCopilotCommand('/replay', ctx)?.chartActions[0]?.type).toBe('start_replay');
    expect(runLocalCopilotCommand('/scan', ctx)?.chartActions[0]?.type).toBe('switch_symbol');

    // Intraday Session Killzones + PDH/PDL liquidity levels
    const intradayBars: OHLCVBar[] = Array.from({ length: 180 }, (_, idx) => {
      const t = Math.floor(Date.UTC(2026, 2, 10, 0, 0, 0) / 1000) + idx * 3600;
      return {
        time: t,
        open: 65000 + idx * 12,
        high: 65150 + idx * 12,
        low: 64850 + idx * 12,
        close: 65040 + idx * 12,
        volume: 950 + idx * 5,
      };
    });
    const sess = computeSessionAndLiquidityLevels(intradayBars, '1h');
    expect(sess.levels.some((l) => l.label === 'PDH')).toBe(true);
    expect(sess.levels.some((l) => l.label === 'PDL')).toBe(true);
    expect(sess.sessions.length).toBeGreaterThanOrEqual(3);
  });

  it('serves 15,000+ Ultra historical bars on GET /api/market/history and runs 12,000-bar Deep Backtest with Intrabar Magnifier & Monthly Returns', async () => {
    const app = await buildApp({ logger: false, serveStatic: false });

    const histRes = await app.inject({
      method: 'GET',
      url: '/api/market/history?symbol=BTCUSDT&timeframe=1m&limit=15000&live=false',
    });
    expect(histRes.statusCode).toBe(200);
    const histBody = histRes.json();
    expect(histBody.bars).toHaveLength(15000);
    expect(histBody.hasMoreBefore).toBe(true);
    expect(histBody.bars[14999].time).toBeGreaterThan(histBody.bars[0].time);

    // Backward scroll pagination via ?before=
    const olderRes = await app.inject({
      method: 'GET',
      url: `/api/market/history?symbol=BTCUSDT&timeframe=1m&limit=4000&before=${histBody.bars[0].time}&live=false`,
    });
    expect(olderRes.statusCode).toBe(200);
    const olderBody = olderRes.json();
    expect(olderBody.bars).toHaveLength(4000);
    expect(olderBody.bars[olderBody.bars.length - 1].time).toBeLessThan(histBody.bars[0].time);

    // Server-side 12,000-bar Deep Backtest (avoids large POST body & downsamples equityCurve cleanly)
    const spec = parseNaturalLanguageToRuleSpec(
      'Buy when EMA 9 crosses above EMA 21 with 2% stop loss and 5% take profit.',
      'BTCUSDT',
      '5m',
    );
    spec.execution = {
      ...spec.execution,
      leverage: 2,
      intrabarMagnifier: true,
    };

    const deepBtRes = await app.inject({
      method: 'POST',
      url: '/api/strategy/backtest',
      payload: {
        spec,
        approved: true,
        masterPrompt: 'Approved 12,000-bar Ultra Deep Backtest with Bar Magnifier.',
        symbol: 'BTCUSDT',
        timeframe: '5m',
        historyLimit: 12000,
      },
    });
    expect(deepBtRes.statusCode).toBe(200);
    const deepBt = deepBtRes.json();
    expect(deepBt.ok).toBe(true);
    expect(deepBt.report.barCount).toBe(12000);
    expect(deepBt.report.equityCurve.length).toBeLessThanOrEqual(1605);
    expect(typeof deepBt.report.monthlyReturns).toBe('object');

    await app.close();
  });

  it('masks DeepSeek & BYOK secrets, extracts DeepSeek R1 reasoning_content, and parses forward-test directives on /api/ai/*', async () => {
    const app = await buildApp({ logger: false, serveStatic: false });
    const secretKey = 'sk-deepseek-ultra-secret-9988';

    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        deepseek: {
          enabled: true,
          apiKey: secretKey,
          baseUrl: 'https://mock-deepseek.local/v1',
          model: 'deepseek-reasoner',
        },
        byok: {
          enabled: true,
          providerName: 'OpenRouter',
          apiKey: 'sk-or-byok-7766',
          baseUrl: 'https://mock-openrouter.local/v1',
          model: 'anthropic/claude-3.7-sonnet',
        },
      },
    });
    expect(saveRes.statusCode).toBe(200);
    const saveText = saveRes.body;
    expect(saveText).not.toContain(secretKey);
    expect(saveText).not.toContain('sk-or-byok-7766');
    expect(saveRes.json().deepseek.hasApiKey).toBe(true);
    expect(saveRes.json().byok.hasApiKey).toBe(true);

    const mockPayload = {
      model: 'deepseek-reasoner',
      choices: [
        {
          message: {
            reasoning_content:
              'Evaluating loaded EMA 9/21 backtest drawdown and tightening stop-loss to 1.5% for live demo forward test.',
            content:
              'Tightened stop-loss to 1.5% and launching live demo forward test now.\n```forward-test\n{"startForwardTest": true}\n```',
          },
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => mockPayload,
        text: async () => JSON.stringify(mockPayload),
      })),
    );

    const testRes = await app.inject({
      method: 'POST',
      url: '/api/ai/test',
      payload: { provider: 'deepseek' },
    });
    expect(testRes.statusCode).toBe(200);
    expect(testRes.json().ok).toBe(true);

    const invokeRes = await app.inject({
      method: 'POST',
      url: '/api/ai/invoke',
      payload: {
        provider: 'deepseek',
        prompt: 'Tighten stop loss to 1.5% and execute my loaded strategy in the demo forward tester.',
        chartContext: { symbol: 'BTCUSDT', timeframe: '5m' },
      },
    });
    expect(invokeRes.statusCode).toBe(200);
    const inv = invokeRes.json();
    expect(inv.ok).toBe(true);
    expect(inv.reasoningText).toContain('1.5%');
    expect(inv.startForwardTest).toBe(true);
    expect(invokeRes.body).not.toContain(secretKey);

    await app.close();
  });
});
