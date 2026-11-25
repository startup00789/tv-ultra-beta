import type {
  AIChartAction,
  AIToolCallBadge,
  OHLCVBar,
  SymbolInfo,
  Timeframe,
} from '../../shared/types';
import { computeOperandSeries } from '../../shared/strategyEngine';
import {
  computeClusteredSupportResistance,
  computeSessionAndLiquidityLevels,
  computeSmartMoneyConcepts,
  computeVolumeProfile,
} from './technicalOverlays';

export interface LocalCopilotContext {
  symbol: string;
  timeframe: Timeframe;
  bars: OHLCVBar[];
  watchlist: SymbolInfo[];
}

export interface LocalCopilotResult {
  handledLocally: boolean;
  text: string;
  chartActions: AIChartAction[];
  toolCalls: AIToolCallBadge[];
  strategyDraftPrompt?: string;
}

/**
 * Sub-50ms Instant Hybrid Copilot Router:
 * Executes TradingView `tvapi_*`-class chart inspection, drawing, overlay, scanner,
 * replay, and strategy tools instantaneously for `/slash` commands without LLM latency,
 * while passing open-ended natural-language queries through to OpenCode / Gemini.
 */
export function runLocalCopilotCommand(
  rawInput: string,
  ctx: LocalCopilotContext,
): LocalCopilotResult | null {
  const trimmed = rawInput.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const t0 = performance.now();
  const spaceIdx = trimmed.indexOf(' ');
  const cmd = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

  const finish = (
    tool: string,
    label: string,
    text: string,
    chartActions: AIChartAction[] = [],
    strategyDraftPrompt?: string,
  ): LocalCopilotResult => ({
    handledLocally: true,
    text,
    chartActions,
    toolCalls: [
      {
        tool,
        label,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        status: 'ok',
      },
    ],
    strategyDraftPrompt,
  });

  if (cmd === 'help' || cmd === 'tools') {
    return finish(
      'tvapi_help',
      'List Instant Copilot Tools',
      [
        `⚡ Instant Hybrid Copilot Tools (${ctx.symbol} · ${ctx.timeframe}):`,
        `• /sr — Clustered Fractal Support & Resistance Zones`,
        `• /smc — Toggle Smart Money Concepts (BOS, CHoCH, FVG, Order Blocks)`,
        `• /vp — Toggle Visible-Range Volume Profile (POC, VAH, VAL)`,
        `• /sessions — Toggle Session Killzones (Asia/London/NY) & PDH/PDL/PWH/PWL`,
        `• /fib — Auto Swing Fibonacci Retracement (with OTE 0.705)`,
        `• /regime — Instant ADX / ATR / VWAP / RSI Quant Regime Report`,
        `• /scan — Rank Watchlist Setups by Momentum & Change %`,
        `• /strategy <rules> — Open Strict Master Prompt Strategy Compiler`,
        `• /forward — Launch Live Demo Forward-Test Workstation`,
        `• /replay — Launch Interactive Bar Replay Mode`,
        `• /clear — Remove All Chart Drawings`,
      ].join('\n'),
    );
  }

  if (cmd === 'sr' || cmd === 'levels') {
    const zones = computeClusteredSupportResistance(ctx.bars, 2);
    const actions: AIChartAction[] = zones.map((z) => ({
      type: 'draw_hline',
      label: `${z.kind === 'resistance' ? 'Res' : 'Sup'} ${z.price} (${z.touches}x)`,
      payload: {
        price: z.price,
        color: z.kind === 'resistance' ? '#f23645' : '#089981',
        label: `${z.strength.toUpperCase()} ${z.kind === 'resistance' ? 'RES' : 'SUP'} ${z.price} (${z.touches}x)`,
      },
    }));
    const summary = zones
      .map((z) => `• ${z.kind.toUpperCase()} @ ${z.price} (${z.touches} touches · ${z.strength})`)
      .join('\n');
    return finish(
      'tvapi_draw_levels',
      `Clustered S/R (${zones.length} levels)`,
      `Plotted ${zones.length} ATR-clustered fractal Support/Resistance levels on ${ctx.symbol} (${ctx.timeframe}):\n${summary}`,
      actions,
    );
  }

  if (cmd === 'smc') {
    const smc = computeSmartMoneyConcepts(ctx.bars);
    return finish(
      'tvapi_toggle_smc',
      'Smart Money Concepts',
      `Toggled Smart Money Concepts overlay on ${ctx.symbol} (${ctx.timeframe}): ${smc.structures.length} structure breaks (BOS/CHoCH) and ${smc.zones.length} active FVG / Order Block zones.`,
      [{ type: 'toggle_smc', label: 'Toggle SMC Overlay', payload: {} }],
    );
  }

  if (cmd === 'vp' || cmd === 'vpvr') {
    const vp = computeVolumeProfile(ctx.bars, 24);
    const info = vp
      ? `POC: ${vp.pocPrice.toFixed(2)} | VAH: ${vp.vahPrice.toFixed(2)} | VAL: ${vp.valPrice.toFixed(2)}`
      : 'Insufficient volume bars';
    return finish(
      'tvapi_volume_profile',
      'Visible Range Volume Profile',
      `Toggled Visible-Range Volume Profile (70% Value Area) on ${ctx.symbol}: ${info}`,
      [{ type: 'toggle_vp', label: 'Toggle Volume Profile', payload: {} }],
    );
  }

  if (cmd === 'sessions' || cmd === 'killzones' || cmd === 'pdh') {
    const sess = computeSessionAndLiquidityLevels(ctx.bars, ctx.timeframe);
    const lvlSummary = sess.levels.map((l) => `${l.label}: ${l.price.toFixed(2)}`).join(' · ');
    return finish(
      'tvapi_toggle_sessions',
      'Sessions & Key Liquidity',
      `Toggled Session Killzones & Key Liquidity Draws on ${ctx.symbol} (${ctx.timeframe}): ${lvlSummary || 'No prior day/week boundary in view'} (${sess.sessions.length} session boxes).`,
      [{ type: 'toggle_sessions', label: 'Toggle Sessions & PDH/PDL', payload: {} }],
    );
  }

  if (cmd === 'fib') {
    const win = ctx.bars.slice(-90);
    if (win.length < 5) {
      return finish('tvapi_create_fib', 'Auto Fib', 'Load at least 5 bars first.');
    }
    let minBar = win[0];
    let maxBar = win[0];
    for (const b of win) {
      if (b.low < minBar.low) minBar = b;
      if (b.high > maxBar.high) maxBar = b;
    }
    const upSwing = minBar.time <= maxBar.time;
    const action: AIChartAction = {
      type: 'draw_fib',
      label: `Auto Fib ${ctx.symbol}`,
      payload: upSwing
        ? { t1: minBar.time, p1: minBar.low, t2: maxBar.time, p2: maxBar.high, color: '#f59e0b' }
        : { t1: maxBar.time, p1: maxBar.high, t2: minBar.time, p2: minBar.low, color: '#f59e0b' },
    };
    return finish(
      'tvapi_create_fib',
      'Auto Swing Fibonacci',
      `Drew ${upSwing ? 'Bullish' : 'Bearish'} Swing Fibonacci Retracement on ${ctx.symbol}: ${minBar.low.toFixed(2)} ↔ ${maxBar.high.toFixed(2)}.`,
      [action],
    );
  }

  if (cmd === 'regime') {
    if (ctx.bars.length < 30) {
      return finish('tvapi_regime', 'Regime Audit', 'Need at least 30 bars for regime metrics.');
    }
    const lastIdx = ctx.bars.length - 1;
    const close = ctx.bars[lastIdx].close;
    const ema20 = computeOperandSeries(ctx.bars, { kind: 'indicator', indicator: 'ema', period: 20 })[lastIdx];
    const sma50 = computeOperandSeries(ctx.bars, { kind: 'indicator', indicator: 'sma', period: 50 })[lastIdx];
    const rsi14 = computeOperandSeries(ctx.bars, { kind: 'indicator', indicator: 'rsi', period: 14 })[lastIdx];
    const adx14 = computeOperandSeries(ctx.bars, { kind: 'indicator', indicator: 'adx', period: 14 })[lastIdx];
    const atr14 = computeOperandSeries(ctx.bars, { kind: 'indicator', indicator: 'atr', period: 14 })[lastIdx];
    const vwap = computeOperandSeries(ctx.bars, { kind: 'indicator', indicator: 'vwap' })[lastIdx];

    const regime =
      adx14 !== null && adx14 >= 25
        ? sma50 !== null && close >= sma50
          ? 'STRONG BULL TREND'
          : 'STRONG BEAR TREND'
        : 'MEAN-REVERTING / RANGE CHOP';

    return finish(
      'tvapi_get_study_values',
      'Quant Regime Diagnostics',
      [
        `📊 Quant Regime Diagnostics — ${ctx.symbol} (${ctx.timeframe})`,
        `• Regime: ${regime}`,
        `• Price: ${close.toFixed(2)} | EMA(20): ${ema20?.toFixed(2) ?? '—'} | SMA(50): ${sma50?.toFixed(2) ?? '—'} | VWAP: ${vwap?.toFixed(2) ?? '—'}`,
        `• Momentum & Trend: RSI(14) = ${rsi14?.toFixed(1) ?? '—'} | ADX(14) = ${adx14?.toFixed(1) ?? '—'}`,
        `• Volatility: ATR(14) = ${atr14?.toFixed(2) ?? '—'} (${atr14 ? ((atr14 / close) * 100).toFixed(2) : '—'}% per bar)`,
      ].join('\n'),
    );
  }

  if (cmd === 'scan') {
    const items = [...ctx.watchlist];
    if (items.length === 0) {
      return finish('tvapi_scan_watchlist', 'Watchlist Scanner', 'Watchlist is empty.');
    }
    const sorted = items.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    const lines = sorted.slice(0, 6).map((item) => {
      const bias =
        item.changePercent >= 1.5
          ? '🟢 Momentum Breakout'
          : item.changePercent <= -1.5
            ? '🔴 High-Vol Pullback'
            : '⚪ Consolidation';
      return `• ${item.symbol.padEnd(8)} ${item.last.toFixed(2)} (${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%) — ${bias}`;
    });
    const topMover = sorted[0];
    return finish(
      'tvapi_scan_watchlist',
      `Scanned ${items.length} Watchlist Symbols`,
      `🔍 Instant Watchlist Quant Scan (${items.length} symbols):\n${lines.join('\n')}`,
      topMover
        ? [
            {
              type: 'switch_symbol',
              label: `Focus ${topMover.symbol}`,
              payload: { symbol: topMover.symbol },
            },
          ]
        : [],
    );
  }

  if (cmd === 'strategy' || cmd === 'backtest') {
    return finish(
      'tvapi_open_backtester',
      'Open Strategy Compiler',
      arg
        ? `Opened Strategy Tester with prompt: "${arg}". Review & approve the Master Prompt to execute.`
        : 'Opened AI Strategy Compiler & Backtester.',
      [{ type: 'open_backtester', label: 'Open Strategy Tester', payload: { prompt: arg } }],
      arg || undefined,
    );
  }

  if (cmd === 'replay') {
    return finish(
      'tvapi_start_replay',
      'Launch Bar Replay',
      `Started zero-lookahead Bar Replay on ${ctx.symbol} (${ctx.timeframe}). Use Step / Play controls on the chart.`,
      [{ type: 'start_replay', label: 'Start Bar Replay', payload: {} }],
    );
  }

  if (cmd === 'forward' || cmd === 'demo' || cmd === 'bot' || cmd === 'autotrade') {
    return finish(
      'tvapi_start_forward_test',
      'Live Demo Forward Test',
      arg
        ? `Launching Live Demo Forward Test with rules: "${arg}".`
        : 'Opened Live Demo Forward-Test Workstation ($100k Virtual Account).',
      [
        {
          type: 'start_forward_test',
          label: 'Start Live Demo Forward Test',
          payload: arg ? { prompt: arg } : {},
        },
      ],
    );
  }

  if (cmd === 'clear') {
    return finish(
      'tvapi_remove_all_drawings',
      'Clear Drawings',
      `Cleared all drawings on ${ctx.symbol}.`,
      [{ type: 'clear_drawings', label: 'Remove All Drawings', payload: {} }],
    );
  }

  return finish(
    'tvapi_unknown_cmd',
    `Unknown /${cmd}`,
    `Unknown slash command "/${cmd}". Type /help to see instant tools (/sr, /smc, /vp, /fib, /regime, /scan, /strategy, /replay, /bot, /clear).`,
  );
}
