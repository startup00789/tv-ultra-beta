import type {
  OHLCVBar,
  PaperAccountState,
  PaperFirewallConfig,
  PaperManualOrderRequest,
  PaperOrderLog,
  PaperPosition,
  PaperTradingBot,
  StrategyRuleSpec,
  Timeframe,
} from '../../shared/types.js';
import { evaluateBarDecision } from '../../shared/strategyEngine.js';
import { getOHLCVBars } from './marketData.js';
import { auditStrategyDescriptionAndSpec } from './strategyCompiler.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

let daemonTimer: ReturnType<typeof setInterval> | null = null;
let daemonTickBusy = false;
let lastRealizedLossAtMs = 0;
let accountState: PaperAccountState = createInitialAccount(100_000);

function createInitialAccount(initialCash = 100_000): PaperAccountState {
  const nowIso = new Date().toISOString();
  return {
    mode: 'paper_only',
    initialCash,
    cash: initialCash,
    equity: initialCash,
    realizedPnl: 0,
    unrealizedPnl: 0,
    dailyPnl: 0,
    dailyLossLimitPct: 3.0,
    killSwitchActive: false,
    firewall: {
      maxOpenPositions: 5,
      maxTotalExposurePct: 85,
      cooldownAfterLossSec: 0,
      maxOrdersPerMinute: 20,
    },
    equityHistory: [{ timestamp: nowIso, equity: initialCash, cash: initialCash }],
    daemonRunning: daemonTimer !== null,
    bots: [],
    positions: [],
    orders: [],
    updatedAt: nowIso,
  };
}

function recomputeEquity(): PaperAccountState {
  let unrealized = 0;
  let marketValue = 0;
  for (const pos of accountState.positions) {
    const grossDiff =
      pos.side === 'long'
        ? (pos.currentPrice - pos.avgEntryPrice) * pos.quantity
        : (pos.avgEntryPrice - pos.currentPrice) * pos.quantity;
    const costBasis = pos.avgEntryPrice * pos.quantity;
    pos.unrealizedPnl = round2(grossDiff);
    pos.unrealizedPnlPct = costBasis > 0 ? round2((grossDiff / costBasis) * 100) : 0;
    unrealized += grossDiff;
    marketValue += costBasis + grossDiff;
  }
  const nowIso = new Date().toISOString();
  accountState.unrealizedPnl = round2(unrealized);
  accountState.equity = round2(accountState.cash + marketValue);
  accountState.dailyPnl = round2(accountState.realizedPnl + unrealized);
  accountState.daemonRunning = daemonTimer !== null;
  accountState.updatedAt = nowIso;

  const prevSnap = accountState.equityHistory[accountState.equityHistory.length - 1];
  if (!prevSnap || Math.abs(prevSnap.equity - accountState.equity) >= 0.01) {
    accountState.equityHistory = [
      ...accountState.equityHistory.slice(-119),
      { timestamp: nowIso, equity: accountState.equity, cash: accountState.cash },
    ];
  }
  return accountState;
}

function checkRiskFirewall(notionalUsd: number): string | null {
  const fw = accountState.firewall;
  if (accountState.positions.length >= fw.maxOpenPositions) {
    return `Risk Firewall: max open positions reached (${accountState.positions.length}/${fw.maxOpenPositions}).`;
  }
  const currentExposure = accountState.positions.reduce(
    (sum, p) => sum + Math.abs(p.currentPrice * p.quantity),
    0,
  );
  const maxExposureUsd = Math.max(100, accountState.equity) * (fw.maxTotalExposurePct / 100);
  if (currentExposure + notionalUsd > maxExposureUsd * 1.001) {
    return `Risk Firewall: total exposure ($${round2(currentExposure + notionalUsd)}) exceeds ${fw.maxTotalExposurePct}% cap ($${round2(maxExposureUsd)}).`;
  }
  if (fw.cooldownAfterLossSec > 0 && lastRealizedLossAtMs > 0) {
    const elapsedSec = (Date.now() - lastRealizedLossAtMs) / 1000;
    if (elapsedSec < fw.cooldownAfterLossSec) {
      return `Risk Firewall: post-loss cooldown active (${Math.ceil(fw.cooldownAfterLossSec - elapsedSec)}s remaining).`;
    }
  }
  const oneMinAgo = Date.now() - 60_000;
  const recentOrders = accountState.orders.filter(
    (o) => o.action !== 'blocked_risk' && Date.parse(o.timestamp) >= oneMinAgo,
  ).length;
  if (recentOrders >= fw.maxOrdersPerMinute) {
    return `Risk Firewall: order rate limit (${fw.maxOrdersPerMinute}/min) exceeded.`;
  }
  return null;
}

export function resetPaperAccount(initialCash = 100_000): PaperAccountState {
  lastRealizedLossAtMs = 0;
  accountState = createInitialAccount(Math.max(1000, initialCash));
  return getPaperAccountState();
}

export function getPaperAccountState(): PaperAccountState {
  return recomputeEquity();
}

export function deployPaperBot(input: {
  name?: string;
  symbol: string;
  timeframe: Timeframe;
  spec: StrategyRuleSpec;
  approvedMasterPrompt: string;
}): { ok: boolean; state: PaperAccountState; bot?: PaperTradingBot; error?: string } {
  if (!input.approvedMasterPrompt || !input.approvedMasterPrompt.trim()) {
    return {
      ok: false,
      state: getPaperAccountState(),
      error: 'Approved Master Prompt is required before deploying an automated paper bot.',
    };
  }

  const issues = auditStrategyDescriptionAndSpec(input.approvedMasterPrompt, input.spec);
  const critical = issues.filter((i) => i.severity === 'critical');
  if (critical.length > 0) {
    return {
      ok: false,
      state: getPaperAccountState(),
      error: `Strict rule gate blocked deployment: ${critical.map((c) => c.explanation).join(' | ')}`,
    };
  }

  if (accountState.killSwitchActive) {
    return {
      ok: false,
      state: getPaperAccountState(),
      error: 'Global Kill Switch is active. Reset or clear the Kill Switch before arming a bot.',
    };
  }

  const bot: PaperTradingBot = {
    id: `bot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name?.trim() || `${input.symbol.toUpperCase()} Auto-Paper Bot`,
    symbol: input.symbol.trim().toUpperCase(),
    timeframe: input.timeframe,
    status: 'armed',
    spec: {
      ...input.spec,
      symbol: input.symbol.trim().toUpperCase(),
      timeframe: input.timeframe,
    },
    approvedMasterPrompt: input.approvedMasterPrompt,
    lastEvaluatedBarTime: null,
    tradesExecuted: 0,
    realizedPnl: 0,
    createdAt: new Date().toISOString(),
  };

  accountState.bots = [bot, ...accountState.bots];
  accountState.dailyLossLimitPct = Math.max(0.5, input.spec.risk.maxDailyLossPct || 3.0);
  return {
    ok: true,
    bot,
    state: recomputeEquity(),
  };
}

export function togglePaperBotStatus(botId: string): {
  ok: boolean;
  state: PaperAccountState;
  error?: string;
} {
  const bot = accountState.bots.find((b) => b.id === botId);
  if (!bot) {
    return { ok: false, state: getPaperAccountState(), error: 'Bot not found.' };
  }
  if (bot.status === 'armed') {
    bot.status = 'paused';
  } else {
    if (accountState.killSwitchActive) {
      return {
        ok: false,
        state: getPaperAccountState(),
        error: 'Cannot arm bot while Global Kill Switch is active.',
      };
    }
    bot.status = 'armed';
  }
  return { ok: true, state: recomputeEquity() };
}

export function deletePaperBot(botId: string): PaperAccountState {
  accountState.bots = accountState.bots.filter((b) => b.id !== botId);
  return recomputeEquity();
}

function appendOrderLog(entry: Omit<PaperOrderLog, 'id' | 'timestamp'>): void {
  accountState.orders = [
    {
      ...entry,
      id: `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    },
    ...accountState.orders,
  ].slice(0, 200);
}

export function executeManualPaperTrade(input: {
  symbol: string;
  side: 'long' | 'short';
  notionalUsd?: number;
  quantity?: number;
  livePrice: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  reason?: string;
}): { ok: boolean; state: PaperAccountState; error?: string } {
  if (accountState.killSwitchActive) {
    return { ok: false, state: getPaperAccountState(), error: 'Kill Switch is active.' };
  }
  const sym = input.symbol.trim().toUpperCase();
  const price = Number(input.livePrice);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, state: getPaperAccountState(), error: 'Invalid live price.' };
  }

  const existing = accountState.positions.find((p) => p.symbol === sym && p.botId === 'manual');
  if (existing) {
    return {
      ok: false,
      state: getPaperAccountState(),
      error: `Manual ${existing.side} position already open for ${sym}. Close it first.`,
    };
  }

  const side = input.side;
  const targetNotional =
    Number.isFinite(input.quantity) && (input.quantity as number) > 0
      ? (input.quantity as number) * price
      : Math.max(10, Math.min(Number(input.notionalUsd ?? 1000), accountState.cash * 0.95));

  const fwError = checkRiskFirewall(targetNotional);
  if (fwError) {
    appendOrderLog({
      botId: 'manual',
      botName: 'Manual Paper Ticket',
      symbol: sym,
      side: side === 'long' ? 'buy' : 'sell',
      action: 'blocked_risk',
      quantity: 0,
      price: round4(price),
      commission: 0,
      reason: fwError,
      ruleTrace: [],
    });
    return { ok: false, state: recomputeEquity(), error: fwError };
  }

  const qty = round4(targetNotional / price);
  if (qty <= 0) {
    return { ok: false, state: getPaperAccountState(), error: 'Insufficient paper cash.' };
  }

  const comm = round2(qty * price * 0.0005);
  const totalCost = qty * price + comm;
  if (totalCost > accountState.cash) {
    return { ok: false, state: getPaperAccountState(), error: 'Insufficient paper cash.' };
  }

  const slPct = input.stopLossPct && input.stopLossPct > 0 ? input.stopLossPct / 100 : 0.02;
  const tpPct = input.takeProfitPct && input.takeProfitPct > 0 ? input.takeProfitPct / 100 : 0.05;

  accountState.cash = round2(accountState.cash - totalCost);
  accountState.positions.push({
    symbol: sym,
    side,
    quantity: qty,
    avgEntryPrice: round4(price),
    currentPrice: round4(price),
    stopLossPrice: round4(side === 'long' ? price * (1 - slPct) : price * (1 + slPct)),
    takeProfitPrice: round4(side === 'long' ? price * (1 + tpPct) : price * (1 - tpPct)),
    unrealizedPnl: 0,
    unrealizedPnlPct: 0,
    openedAt: new Date().toISOString(),
    botId: 'manual',
  });
  appendOrderLog({
    botId: 'manual',
    botName: 'Manual Paper Ticket',
    symbol: sym,
    side: side === 'long' ? 'buy' : 'sell',
    action: side === 'long' ? 'open_long' : 'open_short',
    quantity: qty,
    price: round4(price),
    commission: comm,
    reason: input.reason?.trim() || 'Manual paper bracket order executed.',
    ruleTrace: [],
  });

  return { ok: true, state: recomputeEquity() };
}

export async function placeManualPaperOrder(
  req: PaperManualOrderRequest,
): Promise<{ ok: boolean; state: PaperAccountState; error?: string }> {
  let livePrice = req.price;
  if (!livePrice || !Number.isFinite(livePrice) || livePrice <= 0) {
    const res = await getOHLCVBars({ symbol: req.symbol, timeframe: '1D', limit: 5 });
    livePrice = res.bars[res.bars.length - 1]?.close ?? 0;
  }
  return executeManualPaperTrade({
    symbol: req.symbol,
    side: req.side,
    notionalUsd: req.notionalUsd,
    quantity: req.quantity,
    livePrice,
    stopLossPct: req.stopLossPct,
    takeProfitPct: req.takeProfitPct,
    reason: req.note,
  });
}

export function closePaperPosition(
  botId: string,
  symbol: string,
  exitPrice?: number,
): { ok: boolean; state: PaperAccountState; error?: string } {
  const sym = symbol.trim().toUpperCase();
  const pos = accountState.positions.find(
    (p) => p.symbol === sym && (p.botId === botId || botId === '*'),
  );
  if (!pos) {
    return { ok: false, state: getPaperAccountState(), error: `No open position found for ${sym}.` };
  }
  const bot = accountState.bots.find((b) => b.id === pos.botId);
  const px = exitPrice && Number.isFinite(exitPrice) && exitPrice > 0 ? exitPrice : pos.currentPrice;
  closePositionInternal(
    pos,
    bot,
    px,
    pos.side === 'long' ? 'close_long' : 'close_short',
    'Position closed manually from Paper Trading Desk.',
    [],
  );
  return { ok: true, state: recomputeEquity() };
}

export function updatePaperPositionBrackets(
  botId: string,
  symbol: string,
  stopLossPrice?: number,
  takeProfitPrice?: number,
): { ok: boolean; state: PaperAccountState; error?: string } {
  const sym = symbol.trim().toUpperCase();
  const pos = accountState.positions.find((p) => p.symbol === sym && p.botId === botId);
  if (!pos) {
    return { ok: false, state: getPaperAccountState(), error: 'Open position not found.' };
  }
  if (stopLossPrice !== undefined && Number.isFinite(stopLossPrice) && stopLossPrice > 0) {
    pos.stopLossPrice = round4(stopLossPrice);
  }
  if (takeProfitPrice !== undefined && Number.isFinite(takeProfitPrice) && takeProfitPrice > 0) {
    pos.takeProfitPrice = round4(takeProfitPrice);
  }
  return { ok: true, state: recomputeEquity() };
}

export function updatePaperFirewall(
  patch: Partial<PaperFirewallConfig>,
): PaperAccountState {
  accountState.firewall = {
    maxOpenPositions:
      patch.maxOpenPositions !== undefined
        ? Math.max(1, Math.min(50, Math.floor(patch.maxOpenPositions)))
        : accountState.firewall.maxOpenPositions,
    maxTotalExposurePct:
      patch.maxTotalExposurePct !== undefined
        ? Math.max(5, Math.min(100, patch.maxTotalExposurePct))
        : accountState.firewall.maxTotalExposurePct,
    cooldownAfterLossSec:
      patch.cooldownAfterLossSec !== undefined
        ? Math.max(0, Math.min(86400, Math.floor(patch.cooldownAfterLossSec)))
        : accountState.firewall.cooldownAfterLossSec,
    maxOrdersPerMinute:
      patch.maxOrdersPerMinute !== undefined
        ? Math.max(1, Math.min(120, Math.floor(patch.maxOrdersPerMinute)))
        : accountState.firewall.maxOrdersPerMinute,
  };
  return recomputeEquity();
}

function closePositionInternal(
  pos: PaperPosition,
  bot: PaperTradingBot | undefined,
  fillPrice: number,
  action: PaperOrderLog['action'],
  reason: string,
  ruleTrace: PaperOrderLog['ruleTrace'],
): void {
  const commissionRate = (bot?.spec.execution.commissionPct ?? 0.05) / 100;
  const comm = round2(Math.abs(fillPrice * pos.quantity) * commissionRate);
  const gross =
    pos.side === 'long'
      ? (fillPrice - pos.avgEntryPrice) * pos.quantity
      : (pos.avgEntryPrice - fillPrice) * pos.quantity;
  const net = round2(gross - comm);
  if (net < 0) {
    lastRealizedLossAtMs = Date.now();
  }

  accountState.cash = round2(
    accountState.cash + pos.avgEntryPrice * pos.quantity + gross - comm,
  );
  accountState.realizedPnl = round2(accountState.realizedPnl + net);
  if (bot) {
    bot.realizedPnl = round2(bot.realizedPnl + net);
    bot.tradesExecuted += 1;
  }

  accountState.positions = accountState.positions.filter((p) => p !== pos);
  appendOrderLog({
    botId: pos.botId,
    botName: bot?.name ?? pos.botId,
    symbol: pos.symbol,
    side: pos.side === 'long' ? 'sell' : 'buy',
    action,
    quantity: pos.quantity,
    price: round4(fillPrice),
    commission: comm,
    realizedPnl: net,
    reason,
    ruleTrace,
  });
}

/**
 * Triggers the global emergency Kill Switch: halts all bots and immediately
 * flattens every open paper position at current mark price.
 */
export function triggerPaperKillSwitch(
  reason = 'Manual Kill Switch triggered by operator',
  latestPrices?: Record<string, number>,
): PaperAccountState {
  accountState.killSwitchActive = true;
  accountState.killSwitchReason = reason;
  for (const bot of accountState.bots) {
    bot.status = 'killed';
  }
  for (const pos of [...accountState.positions]) {
    const bot = accountState.bots.find((b) => b.id === pos.botId);
    const px = latestPrices?.[pos.symbol] ?? pos.currentPrice;
    closePositionInternal(pos, bot, px, 'kill_switch', reason, []);
  }
  return recomputeEquity();
}

/**
 * Evaluates all armed paper bots for `symbol` against live market bars + price.
 * Enforces SL/TP brackets, position sizing limits, daily loss circuit breaker,
 * and stores exact per-condition rule traces on every fill.
 */
export function evaluatePaperBotsForSymbol(input: {
  symbol: string;
  timeframe: Timeframe;
  bars: OHLCVBar[];
  livePrice?: number;
}): PaperAccountState {
  const sym = input.symbol.trim().toUpperCase();
  const lastBar = input.bars[input.bars.length - 1];
  const markPrice = input.livePrice && input.livePrice > 0 ? input.livePrice : lastBar?.close;
  if (!markPrice || !lastBar) {
    return getPaperAccountState();
  }

  // Update mark prices on matching positions
  for (const pos of accountState.positions) {
    if (pos.symbol === sym) {
      pos.currentPrice = round4(markPrice);
    }
  }
  recomputeEquity();

  if (accountState.killSwitchActive) {
    return accountState;
  }

  // Check Global Daily Max-Loss Circuit Breaker
  const dailyLossPct =
    accountState.initialCash > 0
      ? (accountState.dailyPnl / accountState.initialCash) * 100
      : 0;
  if (dailyLossPct <= -Math.abs(accountState.dailyLossLimitPct)) {
    for (const bot of accountState.bots) {
      if (bot.status === 'armed') {
        bot.status = 'halted_daily_loss';
      }
    }
    for (const pos of [...accountState.positions]) {
      const bot = accountState.bots.find((b) => b.id === pos.botId);
      closePositionInternal(
        pos,
        bot,
        pos.symbol === sym ? markPrice : pos.currentPrice,
        'blocked_risk',
        `Daily max-loss circuit breaker hit (${round2(dailyLossPct)}% <= -${accountState.dailyLossLimitPct}%)`,
        [],
      );
    }
    return recomputeEquity();
  }

  const evalIdx = input.bars.length - 1;
  for (const bot of accountState.bots) {
    if (bot.status !== 'armed' || bot.symbol !== sym) continue;

    const existingPos = accountState.positions.find(
      (p) => p.botId === bot.id && p.symbol === sym,
    );

    // 1. Live Stop-Loss & Take-Profit protection
    if (existingPos) {
      if (existingPos.side === 'long') {
        if (existingPos.stopLossPrice && markPrice <= existingPos.stopLossPrice) {
          closePositionInternal(
            existingPos,
            bot,
            markPrice,
            'stop_loss',
            `Stop-Loss hit @ $${round4(markPrice)} <= $${round4(existingPos.stopLossPrice)}`,
            [],
          );
          continue;
        }
        if (existingPos.takeProfitPrice && markPrice >= existingPos.takeProfitPrice) {
          closePositionInternal(
            existingPos,
            bot,
            markPrice,
            'take_profit',
            `Take-Profit hit @ $${round4(markPrice)} >= $${round4(existingPos.takeProfitPrice)}`,
            [],
          );
          continue;
        }
      } else {
        if (existingPos.stopLossPrice && markPrice >= existingPos.stopLossPrice) {
          closePositionInternal(
            existingPos,
            bot,
            markPrice,
            'stop_loss',
            `Short Stop-Loss hit @ $${round4(markPrice)} >= $${round4(existingPos.stopLossPrice)}`,
            [],
          );
          continue;
        }
        if (existingPos.takeProfitPrice && markPrice <= existingPos.takeProfitPrice) {
          closePositionInternal(
            existingPos,
            bot,
            markPrice,
            'take_profit',
            `Short Take-Profit hit @ $${round4(markPrice)} <= $${round4(existingPos.takeProfitPrice)}`,
            [],
          );
          continue;
        }
      }
    }

    // 2. Evaluate signal once per bar timestamp
    if (bot.lastEvaluatedBarTime === lastBar.time) continue;
    bot.lastEvaluatedBarTime = lastBar.time;

    const trace = evaluateBarDecision(input.bars, bot.spec, evalIdx);
    const slippageRate = Math.max(0, bot.spec.execution.slippageBps) / 10_000;
    const commRate = Math.max(0, bot.spec.execution.commissionPct) / 100;

    if (existingPos) {
      if (existingPos.side === 'long' && (trace.exitLongPassed || trace.entryShortPassed)) {
        closePositionInternal(
          existingPos,
          bot,
          markPrice * (1 - slippageRate),
          'close_long',
          trace.reason,
          trace.exitLongChecks.length > 0 ? trace.exitLongChecks : trace.entryShortChecks,
        );
      } else if (existingPos.side === 'short' && (trace.exitShortPassed || trace.entryLongPassed)) {
        closePositionInternal(
          existingPos,
          bot,
          markPrice * (1 + slippageRate),
          'close_short',
          trace.reason,
          trace.exitShortChecks.length > 0 ? trace.exitShortChecks : trace.entryLongChecks,
        );
      }
      continue;
    }

    if (trace.entryLongPassed || trace.entryShortPassed) {
      const side = trace.entryLongPassed ? 'long' : 'short';
      const fillPrice =
        side === 'long' ? markPrice * (1 + slippageRate) : markPrice * (1 - slippageRate);
      const maxPct = Math.min(100, Math.max(1, bot.spec.risk.maxPositionPct)) / 100;
      const slPct = Math.max(0.001, bot.spec.risk.stopLossPct / 100);
      const tpPct = Math.max(0.001, bot.spec.risk.takeProfitPct / 100);
      const riskBudget = accountState.equity * (Math.max(0.1, bot.spec.risk.riskPerTradePct) / 100);
      const targetNotional = Math.min(
        accountState.cash * 0.95,
        accountState.equity * maxPct,
        riskBudget / slPct,
      );
      const fwBlock = checkRiskFirewall(targetNotional);
      if (fwBlock) {
        appendOrderLog({
          botId: bot.id,
          botName: bot.name,
          symbol: sym,
          side: side === 'long' ? 'buy' : 'sell',
          action: 'blocked_risk',
          quantity: 0,
          price: round4(fillPrice),
          commission: 0,
          reason: fwBlock,
          ruleTrace: side === 'long' ? trace.entryLongChecks : trace.entryShortChecks,
        });
        continue;
      }
      const qty = fillPrice > 0 ? round4(targetNotional / fillPrice) : 0;
      if (qty <= 0) {
        appendOrderLog({
          botId: bot.id,
          botName: bot.name,
          symbol: sym,
          side: side === 'long' ? 'buy' : 'sell',
          action: 'blocked_risk',
          quantity: 0,
          price: round4(fillPrice),
          commission: 0,
          reason: 'Insufficient paper cash / position-size guardrail limit reached.',
          ruleTrace: side === 'long' ? trace.entryLongChecks : trace.entryShortChecks,
        });
        continue;
      }

      const comm = round2(qty * fillPrice * commRate);
      accountState.cash = round2(accountState.cash - qty * fillPrice - comm);
      bot.tradesExecuted += 1;
      accountState.positions.push({
        symbol: sym,
        side,
        quantity: qty,
        avgEntryPrice: round4(fillPrice),
        currentPrice: round4(markPrice),
        stopLossPrice: round4(
          side === 'long' ? fillPrice * (1 - slPct) : fillPrice * (1 + slPct),
        ),
        takeProfitPrice: round4(
          side === 'long' ? fillPrice * (1 + tpPct) : fillPrice * (1 - tpPct),
        ),
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        openedAt: new Date().toISOString(),
        botId: bot.id,
      });
      appendOrderLog({
        botId: bot.id,
        botName: bot.name,
        symbol: sym,
        side: side === 'long' ? 'buy' : 'sell',
        action: side === 'long' ? 'open_long' : 'open_short',
        quantity: qty,
        price: round4(fillPrice),
        commission: comm,
        reason: trace.reason,
        ruleTrace: side === 'long' ? trace.entryLongChecks : trace.entryShortChecks,
      });
    }
  }

  return recomputeEquity();
}


/**
 * Continuous server-side background scheduler: evaluates all armed paper bots
 * across every symbol/timeframe even when the user switches charts or minimizes tabs.
 */
export function startPaperBotDaemon(intervalMs = 10_000): void {
  if (daemonTimer) return;
  daemonTimer = setInterval(() => {
    if (daemonTickBusy || accountState.killSwitchActive) return;
    const armedBots = accountState.bots.filter((b) => b.status === 'armed');
    if (armedBots.length === 0) return;

    daemonTickBusy = true;
    accountState.lastDaemonTickAt = new Date().toISOString();
    const seenPairs = new Map<string, { symbol: string; timeframe: Timeframe }>();
    for (const b of armedBots) {
      const key = `${b.symbol}:${b.timeframe}`;
      if (!seenPairs.has(key)) {
        seenPairs.set(key, { symbol: b.symbol, timeframe: b.timeframe });
      }
    }

    void Promise.all(
      Array.from(seenPairs.values()).map(async ({ symbol, timeframe }) => {
        try {
          const res = await getOHLCVBars({ symbol, timeframe, limit: 200 });
          if (res.bars.length >= 10) {
            evaluatePaperBotsForSymbol({
              symbol,
              timeframe,
              bars: res.bars,
              livePrice: res.bars[res.bars.length - 1]?.close,
            });
          }
        } catch {
          // Ignore transient upstream network hiccups during background bot polling
        }
      }),
    ).finally(() => {
      daemonTickBusy = false;
    });
  }, Math.max(2000, intervalMs));
  if (typeof daemonTimer.unref === 'function') {
    daemonTimer.unref();
  }
  accountState.daemonRunning = true;
}

export function stopPaperBotDaemon(): void {
  if (daemonTimer) {
    clearInterval(daemonTimer);
    daemonTimer = null;
  }
  accountState.daemonRunning = false;
}
