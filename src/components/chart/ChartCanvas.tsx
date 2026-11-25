import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  type BarData,
  type CandlestickData,
  type IChartApi,
  type IPaneApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineWidth,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { ChevronLeft, ChevronRight, LocateFixed, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { IndicatorConfig, OHLCVBar } from '../../../shared/types';
import { apiClient } from '../../lib/apiClient';
import {
  calcADX,
  calcATR,
  calcBollingerBands,
  calcEMA,
  calcMACD,
  calcOBV,
  calcRSI,
  calcSMA,
  calcStochastic,
  calcSupertrend,
  calcVWAP,
} from '../../lib/indicators';
import {
  useChartAppearanceStore,
  type LineDashStyle,
} from '../../state/chartAppearanceStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { DrawingOverlay } from '../drawings/DrawingOverlay';
import { DrawingOverlayBoundary } from '../drawings/DrawingOverlayBoundary';
import { BarReplayBar } from './BarReplayBar';

const COMPARE_COLORS = ['#f59e0b', '#a855f7', '#06b6d4', '#ec4899'] as const;

interface ManagedIndicator {
  config: IndicatorConfig;
  seriesList: Array<ISeriesApi<SeriesType>>;
  paneApi: IPaneApi<Time> | null;
}

interface CandleAnimState {
  rafId: number | null;
  barTime: number;
  fromClose: number;
  fromHigh: number;
  fromLow: number;
  displayClose: number;
  displayHigh: number;
  displayLow: number;
  targetBar: OHLCVBar;
  startMs: number;
  durationMs: number;
}

interface CandleVisualConfig {
  colorBasedOnPrevClose: boolean;
  bodyVisible: boolean;
  bodyUpColor: string;
  bodyDownColor: string;
  bordersVisible: boolean;
  borderUpColor: string;
  borderDownColor: string;
  wickVisible: boolean;
  wickUpColor: string;
  wickDownColor: string;
}

const CANDLE_SMOOTH_MS = 220;

function toLwcLineStyle(style: LineDashStyle): LineStyle {
  if (style === 'solid') return LineStyle.Solid;
  if (style === 'dotted') return LineStyle.Dotted;
  return LineStyle.Dashed;
}

function toTimeUnixSeconds(time: Time): number | null {
  if (typeof time === 'number') return time;
  if (typeof time === 'string') {
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  if (time && typeof time === 'object' && 'year' in time) {
    return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
  }
  return null;
}

function formatCrosshairTimeInZone(
  time: Time,
  timezone: string,
  showTime: boolean,
): string {
  const sec = toTimeUnixSeconds(time);
  if (sec === null) return '';
  const date = new Date(sec * 1000);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'UTC',
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      ...(showTime
        ? {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }
        : {}),
    }).format(date);
  } catch {
    return date.toUTCString().slice(5, showTime ? 22 : 16);
  }
}

function formatTickMarkInZone(
  time: Time,
  tickMarkType: TickMarkType,
  timezone: string,
): string {
  const sec = toTimeUnixSeconds(time);
  if (sec === null) return '';
  const date = new Date(sec * 1000);
  const tz = timezone || 'UTC';
  try {
    switch (tickMarkType) {
      case TickMarkType.Year:
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          year: 'numeric',
        }).format(date);
      case TickMarkType.Month:
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          month: 'short',
        }).format(date);
      case TickMarkType.DayOfMonth:
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          day: 'numeric',
        }).format(date);
      case TickMarkType.TimeWithSeconds:
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(date);
      case TickMarkType.Time:
      default:
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(date);
    }
  } catch {
    return '';
  }
}

function buildCandleOrBarPoint(
  bar: OHLCVBar,
  style: string,
  visual: CandleVisualConfig,
  prevClose?: number,
): CandlestickData<UTCTimestamp> | BarData<UTCTimestamp> {
  const isUp =
    visual.colorBasedOnPrevClose && prevClose !== undefined
      ? bar.close >= prevClose
      : bar.close >= bar.open;

  if (!visual.colorBasedOnPrevClose) {
    return {
      time: bar.time as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    };
  }

  if (style === 'bars') {
    return {
      time: bar.time as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      color: isUp ? visual.bodyUpColor : visual.bodyDownColor,
    };
  }

  const bodyColor = !visual.bodyVisible
    ? 'transparent'
    : style === 'hollow_candles' && isUp
      ? 'transparent'
      : isUp
        ? visual.bodyUpColor
        : visual.bodyDownColor;
  const borderColor =
    visual.bordersVisible || style === 'hollow_candles'
      ? isUp
        ? visual.borderUpColor
        : visual.borderDownColor
      : 'transparent';
  const wickColor = visual.wickVisible
    ? isUp
      ? visual.wickUpColor
      : visual.wickDownColor
    : 'transparent';

  return {
    time: bar.time as UTCTimestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    color: bodyColor,
    borderColor,
    wickColor,
  };
}

function pushBarUpdate(
  series: ISeriesApi<SeriesType>,
  volSeries: ISeriesApi<'Histogram'>,
  style: string,
  bar: OHLCVBar,
  visual: CandleVisualConfig,
  prevClose?: number,
): void {
  if (style === 'line' || style === 'area') {
    (series as ISeriesApi<'Line' | 'Area'>).update({
      time: bar.time as UTCTimestamp,
      value: bar.close,
    });
  } else {
    (series as ISeriesApi<'Candlestick' | 'Bar'>).update(
      buildCandleOrBarPoint(bar, style, visual, prevClose),
    );
  }
  const isUp =
    visual.colorBasedOnPrevClose && prevClose !== undefined
      ? bar.close >= prevClose
      : bar.close >= bar.open;
  volSeries.update({
    time: bar.time as UTCTimestamp,
    value: bar.volume,
    color: isUp ? 'rgba(8, 153, 129, 0.42)' : 'rgba(242, 54, 69, 0.42)',
  });
}

export function ChartCanvas() {
  const symbol = useWorkspaceStore((s) => s.symbol);
  const symbolInfo = useWorkspaceStore((s) => s.symbolInfo);
  const timeframe = useWorkspaceStore((s) => s.timeframe);
  const chartStyle = useWorkspaceStore((s) => s.chartStyle);
  const scaleMode = useWorkspaceStore((s) => s.scaleMode);
  const autoScale = useWorkspaceStore((s) => s.autoScale);
  const dateRange = useWorkspaceStore((s) => s.dateRange);
  const theme = useWorkspaceStore((s) => s.theme);
  const showGrid = useWorkspaceStore((s) => s.showGrid);
  const magnetMode = useWorkspaceStore((s) => s.magnetMode);
  const rawBars = useWorkspaceStore((s) => s.bars);
  const replayActive = useWorkspaceStore((s) => s.replayActive);
  const replayIndex = useWorkspaceStore((s) => s.replayIndex);
  const bars = useMemo(
    () =>
      replayActive && replayIndex > 0
        ? rawBars.slice(0, Math.min(rawBars.length, replayIndex))
        : rawBars,
    [rawBars, replayActive, replayIndex],
  );
  const seriesRevision = useWorkspaceStore((s) => s.seriesRevision);
  const liveMarketData = useWorkspaceStore((s) => s.liveMarketData);
  const loadingBars = useWorkspaceStore((s) => s.loadingBars);
  const marketError = useWorkspaceStore((s) => s.marketError);
  const indicators = useWorkspaceStore((s) => s.indicators);
  const compareSymbols = useWorkspaceStore((s) => s.compareSymbols);
  const chartOverlay = useWorkspaceStore((s) => s.chartOverlay);
  const overlayVisible = useWorkspaceStore((s) => s.overlayVisible);
  const backtestReport = useWorkspaceStore((s) => s.backtestReport);
  const backtestMarkersVisible = useWorkspaceStore((s) => s.backtestMarkersVisible);
  const paperAccount = useWorkspaceStore((s) => s.paperAccount);
  const alerts = useWorkspaceStore((s) => s.alerts);
  const goToDateTimestamp = useWorkspaceStore((s) => s.goToDateTimestamp);

  const setHoveredBar = useWorkspaceStore((s) => s.setHoveredBar);
  const setGoToDateTimestamp = useWorkspaceStore((s) => s.setGoToDateTimestamp);

  // Live Chart Appearance Store subscriptions
  const colorBasedOnPrevClose = useChartAppearanceStore((s) => s.colorBasedOnPrevClose);
  const bodyVisible = useChartAppearanceStore((s) => s.bodyVisible);
  const bodyUpColor = useChartAppearanceStore((s) => s.bodyUpColor);
  const bodyDownColor = useChartAppearanceStore((s) => s.bodyDownColor);
  const bordersVisible = useChartAppearanceStore((s) => s.bordersVisible);
  const borderUpColor = useChartAppearanceStore((s) => s.borderUpColor);
  const borderDownColor = useChartAppearanceStore((s) => s.borderDownColor);
  const wickVisible = useChartAppearanceStore((s) => s.wickVisible);
  const wickUpColor = useChartAppearanceStore((s) => s.wickUpColor);
  const wickDownColor = useChartAppearanceStore((s) => s.wickDownColor);
  const precisionOverride = useChartAppearanceStore((s) => s.precisionOverride);
  const timezone = useChartAppearanceStore((s) => s.timezone);

  const showLastPriceLabel = useChartAppearanceStore((s) => s.showLastPriceLabel);
  const showLastPriceLine = useChartAppearanceStore((s) => s.showLastPriceLine);
  const lastPriceLineStyle = useChartAppearanceStore((s) => s.lastPriceLineStyle);
  const showHighLowLines = useChartAppearanceStore((s) => s.showHighLowLines);
  const lockPriceToBarRatio = useChartAppearanceStore((s) => s.lockPriceToBarRatio);
  const crosshairColor = useChartAppearanceStore((s) => s.crosshairColor);
  const crosshairStyle = useChartAppearanceStore((s) => s.crosshairStyle);
  const crosshairWidth = useChartAppearanceStore((s) => s.crosshairWidth);

  const backgroundType = useChartAppearanceStore((s) => s.backgroundType);
  const backgroundColor = useChartAppearanceStore((s) => s.backgroundColor);
  const backgroundGradientEnd = useChartAppearanceStore((s) => s.backgroundGradientEnd);
  const gridMode = useChartAppearanceStore((s) => s.gridMode);
  const vertGridColor = useChartAppearanceStore((s) => s.vertGridColor);
  const horzGridColor = useChartAppearanceStore((s) => s.horzGridColor);
  const scalesTextColor = useChartAppearanceStore((s) => s.scalesTextColor);
  const scalesFontSize = useChartAppearanceStore((s) => s.scalesFontSize);
  const scalesLinesColor = useChartAppearanceStore((s) => s.scalesLinesColor);
  const showWatermark = useChartAppearanceStore((s) => s.showWatermark);
  const watermarkColor = useChartAppearanceStore((s) => s.watermarkColor);
  const topMarginPct = useChartAppearanceStore((s) => s.topMarginPct);
  const bottomMarginPct = useChartAppearanceStore((s) => s.bottomMarginPct);

  const showPositionsOnChart = useChartAppearanceStore((s) => s.showPositionsOnChart);
  const showExecutionsOnChart = useChartAppearanceStore((s) => s.showExecutionsOnChart);
  const showBracketsOnChart = useChartAppearanceStore((s) => s.showBracketsOnChart);
  const showAlertLinesOnChart = useChartAppearanceStore((s) => s.showAlertLinesOnChart);
  const alertLineColor = useChartAppearanceStore((s) => s.alertLineColor);
  const showSessionBreaks = useChartAppearanceStore((s) => s.showSessionBreaks);
  const showEconomicEvents = useChartAppearanceStore((s) => s.showEconomicEvents);

  const candleVisual = useMemo<CandleVisualConfig>(
    () => ({
      colorBasedOnPrevClose,
      bodyVisible,
      bodyUpColor,
      bodyDownColor,
      bordersVisible,
      borderUpColor,
      borderDownColor,
      wickVisible,
      wickUpColor,
      wickDownColor,
    }),
    [
      bodyDownColor,
      bodyUpColor,
      bodyVisible,
      borderDownColor,
      borderUpColor,
      bordersVisible,
      colorBasedOnPrevClose,
      wickDownColor,
      wickUpColor,
      wickVisible,
    ],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const mainStyleRef = useRef<string | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const watermarkRef = useRef<ReturnType<typeof createTextWatermark<Time>> | null>(null);

  const managedIndicatorsRef = useRef<Map<string, ManagedIndicator>>(new Map());
  const compareSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const forecastSeriesRef = useRef<{
    median: ISeriesApi<'Line'>;
    upper: ISeriesApi<'Line'>;
    lower: ISeriesApi<'Line'>;
  } | null>(null);

  const barsByTimeRef = useRef<Map<number, OHLCVBar>>(new Map());
  const positionPriceLinesRef = useRef<IPriceLine[]>([]);
  const alertPriceLinesRef = useRef<IPriceLine[]>([]);
  const highLowPriceLinesRef = useRef<IPriceLine[]>([]);
  const appliedSeriesKeyRef = useRef<string | null>(null);
  const prevZoomKeyRef = useRef<string | null>(null);
  const scrollFetchLockRef = useRef(false);
  const candleAnimRef = useRef<CandleAnimState | null>(null);
  const hadOverlayRef = useRef(false);
  const [chartReady, setChartReady] = useState(false);
  const [plotSize, setPlotSize] = useState({ width: 0, height: 0 });
  const [overlayRevision, setOverlayRevision] = useState(0);

  const cancelCandleAnim = () => {
    const cur = candleAnimRef.current;
    if (cur && cur.rafId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(cur.rafId);
      }
      cur.rafId = null;
    }
  };

  useEffect(() => {
    const map = new Map<number, OHLCVBar>();
    for (const b of bars) map.set(b.time, b);
    barsByTimeRef.current = map;
  }, [bars]);

  const crosshairLabelBg = theme === 'dark' ? '#363a45' : '#131722';

  const syncPlotGeometry = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const width = chart.timeScale().width();
    const pane0Height = chart.panes()[0]?.getHeight() ?? 0;
    setPlotSize((prev) =>
      prev.width === width && prev.height === pane0Height
        ? prev
        : { width, height: pane0Height },
    );
    setOverlayRevision((r) => r + 1);
  };

  // 1. Mount Lightweight Chart instance once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const topMargin = Math.min(0.45, Math.max(0, topMarginPct / 100));
    const bottomMargin = Math.min(0.45, Math.max(0, bottomMarginPct / 100));

    const chart = createChart(container, {
      width: Math.max(300, container.clientWidth),
      height: Math.max(200, container.clientHeight),
      layout: {
        background:
          backgroundType === 'gradient'
            ? {
                type: ColorType.VerticalGradient,
                topColor: backgroundColor,
                bottomColor: backgroundGradientEnd,
              }
            : { type: ColorType.Solid, color: backgroundColor },
        textColor: scalesTextColor,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        fontSize: scalesFontSize,
        panes: {
          separatorColor: scalesLinesColor,
          separatorHoverColor: '#2962ff',
          enableResize: true,
        },
      },
      grid: {
        vertLines: {
          color: vertGridColor,
          visible: showGrid && (gridMode === 'both' || gridMode === 'vert'),
        },
        horzLines: {
          color: horzGridColor,
          visible: showGrid && (gridMode === 'both' || gridMode === 'horz'),
        },
      },
      crosshair: {
        mode: magnetMode ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal,
        vertLine: {
          color: crosshairColor,
          width: crosshairWidth as LineWidth,
          style: toLwcLineStyle(crosshairStyle),
          labelBackgroundColor: crosshairLabelBg,
        },
        horzLine: {
          color: crosshairColor,
          width: crosshairWidth as LineWidth,
          style: toLwcLineStyle(crosshairStyle),
          labelBackgroundColor: crosshairLabelBg,
        },
      },
      rightPriceScale: {
        borderColor: scalesLinesColor,
        minimumWidth: 66,
        scaleMargins: { top: topMargin, bottom: bottomMargin },
      },
      timeScale: {
        borderColor: scalesLinesColor,
        timeVisible: timeframe !== '1D' && timeframe !== '1W' && timeframe !== '1M',
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 7,
      },
      handleScroll: true,
      handleScale: true,
    });

    const volSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      },
      0,
    );
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    const wm = createTextWatermark(chart.panes()[0], {
      visible: showWatermark,
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [
        {
          text: `${symbol}, ${timeframe}`,
          color: watermarkColor,
          fontSize: 44,
          fontStyle: 'bold',
        },
      ],
    });

    chartRef.current = chart;
    volumeSeriesRef.current = volSeries;
    watermarkRef.current = wm;
    setChartReady(true);

    const onCrosshairMove = (param: { time?: Time }) => {
      if (typeof param.time === 'number') {
        const hit = barsByTimeRef.current.get(param.time) ?? null;
        setHoveredBar(hit);
      } else {
        setHoveredBar(null);
      }
    };
    const onRangeChange = (logicalRange: { from: number; to: number } | null) => {
      syncPlotGeometry();
      if (
        logicalRange &&
        logicalRange.from < 45 &&
        !scrollFetchLockRef.current &&
        !useWorkspaceStore.getState().replayActive
      ) {
        const st = useWorkspaceStore.getState();
        if (st.hasMoreHistory && !st.loadingMoreHistory && !st.loadingBars && st.bars.length > 0) {
          scrollFetchLockRef.current = true;
          void st
            .loadMoreHistory(4000)
            .then((added) => {
              if (added > 0 && chartRef.current) {
                const curRange = chartRef.current.timeScale().getVisibleLogicalRange();
                if (curRange) {
                  chartRef.current.timeScale().setVisibleLogicalRange({
                    from: curRange.from + added,
                    to: curRange.to + added,
                  });
                }
              }
            })
            .finally(() => {
              window.setTimeout(() => {
                scrollFetchLockRef.current = false;
              }, 250);
            });
        }
      }
    };
    const onChartClick = (param: { time?: Time }) => {
      if (typeof param.time !== 'number') return;
      const st = useWorkspaceStore.getState();
      if (st.activeTool !== 'crosshair') return;
      if (st.chartWhyInspectMode || (st.bottomDrawerOpen && st.activeBottomTab === 'backtester')) {
        const idx = st.bars.findIndex((b) => b.time === param.time);
        if (idx >= 0) {
          st.setInspectedBarIndex(idx);
        }
      }
    };

    chart.subscribeCrosshairMove(onCrosshairMove);
    chart.subscribeClick(onChartClick);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({
            width: Math.floor(width),
            height: Math.floor(height),
          });
          syncPlotGeometry();
        }
      }
    });
    ro.observe(container);

    const managedIndicators = managedIndicatorsRef.current;
    const compareSeries = compareSeriesRef.current;

    return () => {
      cancelCandleAnim();
      candleAnimRef.current = null;
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.unsubscribeClick(onChartClick);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
      managedIndicators.clear();
      compareSeries.clear();
      forecastSeriesRef.current = null;
      markersPluginRef.current = null;
      mainSeriesRef.current = null;
      mainStyleRef.current = null;
      watermarkRef.current = null;
      volumeSeriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasNonPositivePrice = useMemo(
    () => bars.some((b) => b.close <= 0 || b.low <= 0),
    // Re-evaluate on full dataset loads / length changes instead of every intra-bar tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesRevision, bars.length],
  );

  // 2. Apply live Canvas, Scales, Crosshair, Watermark & Timezone options
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const lwcScaleMode =
      scaleMode === 'percent'
        ? PriceScaleMode.Percentage
        : scaleMode === 'log' && !hasNonPositivePrice
          ? PriceScaleMode.Logarithmic
          : PriceScaleMode.Normal;

    const topMargin = Math.min(0.45, Math.max(0, topMarginPct / 100));
    const bottomMargin = Math.min(0.45, Math.max(0, bottomMarginPct / 100));
    const showTimeOnAxis = timeframe !== '1D' && timeframe !== '1W' && timeframe !== '1M';

    chart.applyOptions({
      layout: {
        background:
          backgroundType === 'gradient'
            ? {
                type: ColorType.VerticalGradient,
                topColor: backgroundColor,
                bottomColor: backgroundGradientEnd,
              }
            : { type: ColorType.Solid, color: backgroundColor },
        textColor: scalesTextColor,
        fontSize: scalesFontSize,
        panes: {
          separatorColor: scalesLinesColor,
          separatorHoverColor: '#2962ff',
          enableResize: true,
        },
      },
      grid: {
        vertLines: {
          color: vertGridColor,
          visible: showGrid && (gridMode === 'both' || gridMode === 'vert'),
        },
        horzLines: {
          color: horzGridColor,
          visible: showGrid && (gridMode === 'both' || gridMode === 'horz'),
        },
      },
      crosshair: {
        mode: magnetMode ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal,
        vertLine: {
          color: crosshairColor,
          width: crosshairWidth as LineWidth,
          style: toLwcLineStyle(crosshairStyle),
          labelBackgroundColor: crosshairLabelBg,
        },
        horzLine: {
          color: crosshairColor,
          width: crosshairWidth as LineWidth,
          style: toLwcLineStyle(crosshairStyle),
          labelBackgroundColor: crosshairLabelBg,
        },
      },
      rightPriceScale: {
        borderColor: scalesLinesColor,
        mode: lwcScaleMode,
        autoScale: lockPriceToBarRatio ? false : autoScale,
        scaleMargins: { top: topMargin, bottom: bottomMargin },
      },
      localization: {
        timeFormatter:
          timezone && timezone !== 'UTC'
            ? (t: Time) => formatCrosshairTimeInZone(t, timezone, showTimeOnAxis)
            : null,
      },
      timeScale: {
        borderColor: scalesLinesColor,
        timeVisible: showTimeOnAxis,
        lockVisibleTimeRangeOnResize: lockPriceToBarRatio,
        tickMarkFormatter:
          timezone && timezone !== 'UTC'
            ? (t: Time, tickMarkType: TickMarkType) =>
                formatTickMarkInZone(t, tickMarkType, timezone)
            : undefined,
      },
    });

    watermarkRef.current?.applyOptions({
      visible: showWatermark,
      lines: [
        {
          text: `${symbol}, ${timeframe}`,
          color: watermarkColor,
          fontSize: 44,
          fontStyle: 'bold',
        },
        ...(symbolInfo?.name
          ? [
              {
                text: symbolInfo.name,
                color: watermarkColor,
                fontSize: 16,
              },
            ]
          : []),
      ],
    });
  }, [
    autoScale,
    backgroundColor,
    backgroundGradientEnd,
    backgroundType,
    crosshairColor,
    crosshairLabelBg,
    crosshairStyle,
    crosshairWidth,
    gridMode,
    hasNonPositivePrice,
    horzGridColor,
    lockPriceToBarRatio,
    magnetMode,
    scaleMode,
    scalesFontSize,
    scalesLinesColor,
    scalesTextColor,
    showGrid,
    showWatermark,
    symbol,
    symbolInfo?.name,
    timeframe,
    timezone,
    topMarginPct,
    bottomMarginPct,
    vertGridColor,
    watermarkColor,
  ]);

  // 3. Rebuild main series whenever chartStyle changes, apply live candle/price-line options, and push OHLCV bars
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    let rebuiltStyle = false;
    if (mainStyleRef.current !== chartStyle) {
      rebuiltStyle = true;
      cancelCandleAnim();
      candleAnimRef.current = null;
      if (markersPluginRef.current) {
        markersPluginRef.current.detach();
        markersPluginRef.current = null;
      }
      if (mainSeriesRef.current) {
        chart.removeSeries(mainSeriesRef.current);
        mainSeriesRef.current = null;
      }

      let nextSeries: ISeriesApi<SeriesType>;
      if (chartStyle === 'candles') {
        nextSeries = chart.addSeries(
          CandlestickSeries,
          {
            upColor: bodyVisible ? bodyUpColor : 'transparent',
            downColor: bodyVisible ? bodyDownColor : 'transparent',
            borderVisible: bordersVisible,
            borderUpColor,
            borderDownColor,
            wickVisible,
            wickUpColor,
            wickDownColor,
          },
          0,
        );
      } else if (chartStyle === 'hollow_candles') {
        nextSeries = chart.addSeries(
          CandlestickSeries,
          {
            upColor: 'transparent',
            borderUpColor,
            wickUpColor,
            downColor: bodyVisible ? bodyDownColor : 'transparent',
            borderDownColor,
            wickDownColor,
            borderVisible: true,
            wickVisible,
          },
          0,
        );
      } else if (chartStyle === 'bars') {
        nextSeries = chart.addSeries(
          BarSeries,
          {
            upColor: bodyUpColor,
            downColor: bodyDownColor,
          },
          0,
        );
      } else if (chartStyle === 'line') {
        nextSeries = chart.addSeries(
          LineSeries,
          {
            color: '#2962ff',
            lineWidth: 2,
          },
          0,
        );
      } else {
        nextSeries = chart.addSeries(
          AreaSeries,
          {
            lineColor: '#2962ff',
            topColor: 'rgba(41, 98, 255, 0.28)',
            bottomColor: 'rgba(41, 98, 255, 0.02)',
            lineWidth: 2,
          },
          0,
        );
      }

      mainSeriesRef.current = nextSeries;
      mainStyleRef.current = chartStyle;
      appliedSeriesKeyRef.current = null;
      markersPluginRef.current = createSeriesMarkers(nextSeries, []);
    }

    const series = mainSeriesRef.current;
    const volSeries = volumeSeriesRef.current;
    if (!series || !volSeries) return;

    const symUpper = symbol.toUpperCase();
    const samplePx = bars[bars.length - 1]?.close ?? symbolInfo?.last ?? 100;
    const defaultDecimals =
      symUpper.endsWith('JPY') ||
      symUpper === 'USDINR' ||
      symUpper === 'XAGUSD' ||
      symUpper === 'XAGEUR' ||
      symUpper === 'DXY'
        ? 3
        : symbolInfo?.assetClass === 'forex' || symUpper === 'XCUUSD' || Math.abs(samplePx) < 10
          ? 4
          : 2;
    const priceDecimals =
      precisionOverride !== 'default' ? Number(precisionOverride) : defaultDecimals;
    const minMove =
      priceDecimals === 0 ? 1 : Number((10 ** -priceDecimals).toFixed(priceDecimals));

    if (chartStyle === 'candles') {
      (series as ISeriesApi<'Candlestick'>).applyOptions({
        upColor: bodyVisible ? bodyUpColor : 'transparent',
        downColor: bodyVisible ? bodyDownColor : 'transparent',
        borderVisible: bordersVisible,
        borderUpColor: bordersVisible ? borderUpColor : 'transparent',
        borderDownColor: bordersVisible ? borderDownColor : 'transparent',
        wickVisible,
        wickUpColor,
        wickDownColor,
        lastValueVisible: showLastPriceLabel,
        priceLineVisible: showLastPriceLine,
        priceLineStyle: toLwcLineStyle(lastPriceLineStyle),
        priceFormat: {
          type: 'price',
          precision: priceDecimals,
          minMove,
        },
      });
    } else if (chartStyle === 'hollow_candles') {
      (series as ISeriesApi<'Candlestick'>).applyOptions({
        upColor: 'transparent',
        downColor: bodyVisible ? bodyDownColor : 'transparent',
        borderVisible: true,
        borderUpColor,
        borderDownColor,
        wickVisible,
        wickUpColor,
        wickDownColor,
        lastValueVisible: showLastPriceLabel,
        priceLineVisible: showLastPriceLine,
        priceLineStyle: toLwcLineStyle(lastPriceLineStyle),
        priceFormat: {
          type: 'price',
          precision: priceDecimals,
          minMove,
        },
      });
    } else if (chartStyle === 'bars') {
      (series as ISeriesApi<'Bar'>).applyOptions({
        upColor: bodyUpColor,
        downColor: bodyDownColor,
        lastValueVisible: showLastPriceLabel,
        priceLineVisible: showLastPriceLine,
        priceLineStyle: toLwcLineStyle(lastPriceLineStyle),
        priceFormat: {
          type: 'price',
          precision: priceDecimals,
          minMove,
        },
      });
    } else {
      series.applyOptions({
        lastValueVisible: showLastPriceLabel,
        priceLineVisible: showLastPriceLine,
        priceLineStyle: toLwcLineStyle(lastPriceLineStyle),
        priceFormat: {
          type: 'price',
          precision: priceDecimals,
          minMove,
        },
      });
    }

    const perBarStyleKey = colorBasedOnPrevClose
      ? `prev:${bodyVisible}:${bodyUpColor}:${bodyDownColor}:${bordersVisible}:${borderUpColor}:${borderDownColor}:${wickVisible}:${wickUpColor}:${wickDownColor}`
      : 'std';
    const fullKey = `${symbol}:${timeframe}:${chartStyle}:${seriesRevision}:${perBarStyleKey}`;
    let didFullReload = rebuiltStyle;

    if (bars.length > 0) {
      let updatedInPlace = false;
      const prevCloseForLatest = bars.length >= 2 ? bars[bars.length - 2].close : undefined;

      if (appliedSeriesKeyRef.current === fullKey) {
        const latest = bars[bars.length - 1];
        const prevAnim = candleAnimRef.current;

        if (prevAnim && latest.time >= prevAnim.barTime) {
          try {
            const isNewBar = latest.time > prevAnim.barTime;
            if (isNewBar) {
              cancelCandleAnim();
              // Snap the newly finished previous bar to its exact final OHLCV
              if (bars.length >= 2) {
                const finishedPrev = bars[bars.length - 2];
                const prevPrevClose =
                  bars.length >= 3 ? bars[bars.length - 3].close : undefined;
                if (finishedPrev.time === prevAnim.barTime) {
                  pushBarUpdate(
                    series,
                    volSeries,
                    chartStyle,
                    finishedPrev,
                    candleVisual,
                    prevPrevClose,
                  );
                }
              }
            }

            const unchanged =
              !isNewBar &&
              latest.open === prevAnim.targetBar.open &&
              latest.high === prevAnim.targetBar.high &&
              latest.low === prevAnim.targetBar.low &&
              latest.close === prevAnim.targetBar.close &&
              latest.volume === prevAnim.targetBar.volume;

            if (!unchanged) {
              const startClose = isNewBar ? latest.open : prevAnim.displayClose;
              const startHigh = isNewBar ? latest.open : prevAnim.displayHigh;
              const startLow = isNewBar ? latest.open : prevAnim.displayLow;
              const priceMoved =
                startClose !== latest.close ||
                startHigh !== latest.high ||
                startLow !== latest.low;

              cancelCandleAnim();

              if (!priceMoved || typeof requestAnimationFrame === 'undefined') {
                pushBarUpdate(
                  series,
                  volSeries,
                  chartStyle,
                  latest,
                  candleVisual,
                  prevCloseForLatest,
                );
                candleAnimRef.current = {
                  rafId: null,
                  barTime: latest.time,
                  fromClose: latest.close,
                  fromHigh: latest.high,
                  fromLow: latest.low,
                  displayClose: latest.close,
                  displayHigh: latest.high,
                  displayLow: latest.low,
                  targetBar: latest,
                  startMs: 0,
                  durationMs: 0,
                };
              } else {
                const nowMs =
                  typeof performance !== 'undefined' ? performance.now() : Date.now();
                const nextState: CandleAnimState = {
                  rafId: null,
                  barTime: latest.time,
                  fromClose: startClose,
                  fromHigh: startHigh,
                  fromLow: startLow,
                  displayClose: startClose,
                  displayHigh: startHigh,
                  displayLow: startLow,
                  targetBar: latest,
                  startMs: nowMs,
                  durationMs: CANDLE_SMOOTH_MS,
                };
                candleAnimRef.current = nextState;

                const step = (frameNow: number) => {
                  if (
                    candleAnimRef.current !== nextState ||
                    mainSeriesRef.current !== series ||
                    volumeSeriesRef.current !== volSeries ||
                    !chartRef.current
                  ) {
                    return;
                  }
                  const elapsed = Math.max(0, frameNow - nextState.startMs);
                  const t = Math.min(1, elapsed / nextState.durationMs);
                  const target = nextState.targetBar;

                  if (t >= 1) {
                    nextState.displayClose = target.close;
                    nextState.displayHigh = target.high;
                    nextState.displayLow = target.low;
                    nextState.rafId = null;
                    try {
                      pushBarUpdate(
                        series,
                        volSeries,
                        chartStyle,
                        target,
                        candleVisual,
                        prevCloseForLatest,
                      );
                    } catch {
                      // Ignore if series was replaced during transition
                    }
                    return;
                  }

                  const ease = 1 - (1 - t) ** 3;
                  const curClose =
                    nextState.fromClose + (target.close - nextState.fromClose) * ease;
                  const rawHigh =
                    nextState.fromHigh + (target.high - nextState.fromHigh) * ease;
                  const rawLow =
                    nextState.fromLow + (target.low - nextState.fromLow) * ease;
                  const curHigh = Math.max(target.open, curClose, rawHigh);
                  const curLow = Math.min(target.open, curClose, rawLow);

                  nextState.displayClose = curClose;
                  nextState.displayHigh = curHigh;
                  nextState.displayLow = curLow;

                  try {
                    pushBarUpdate(
                      series,
                      volSeries,
                      chartStyle,
                      {
                        ...target,
                        close: curClose,
                        high: curHigh,
                        low: curLow,
                      },
                      candleVisual,
                      prevCloseForLatest,
                    );
                  } catch {
                    nextState.rafId = null;
                    return;
                  }

                  nextState.rafId = requestAnimationFrame(step);
                };

                nextState.rafId = requestAnimationFrame(step);
              }
            }
            updatedInPlace = true;
          } catch {
            cancelCandleAnim();
            updatedInPlace = false;
          }
        }
      }

      if (!updatedInPlace) {
        cancelCandleAnim();
        if (chartStyle === 'line' || chartStyle === 'area') {
          (series as ISeriesApi<'Line' | 'Area'>).setData(
            bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close })),
          );
        } else {
          (series as ISeriesApi<'Candlestick' | 'Bar'>).setData(
            bars.map((b, idx) =>
              buildCandleOrBarPoint(
                b,
                chartStyle,
                candleVisual,
                idx > 0 ? bars[idx - 1].close : undefined,
              ),
            ),
          );
        }

        volSeries.setData(
          bars.map((b, idx) => {
            const isUp =
              colorBasedOnPrevClose && idx > 0
                ? b.close >= bars[idx - 1].close
                : b.close >= b.open;
            return {
              time: b.time as UTCTimestamp,
              value: b.volume,
              color: isUp ? 'rgba(8, 153, 129, 0.42)' : 'rgba(242, 54, 69, 0.42)',
            };
          }),
        );

        const latest = bars[bars.length - 1];
        candleAnimRef.current = {
          rafId: null,
          barTime: latest.time,
          fromClose: latest.close,
          fromHigh: latest.high,
          fromLow: latest.low,
          displayClose: latest.close,
          displayHigh: latest.high,
          displayLow: latest.low,
          targetBar: latest,
          startMs: 0,
          durationMs: 0,
        };
        appliedSeriesKeyRef.current = fullKey;
        didFullReload = true;
      }
    }

    if (didFullReload) {
      syncPlotGeometry();
    }
  }, [
    bars,
    bodyDownColor,
    bodyUpColor,
    bodyVisible,
    borderDownColor,
    borderUpColor,
    bordersVisible,
    candleVisual,
    chartReady,
    chartStyle,
    colorBasedOnPrevClose,
    lastPriceLineStyle,
    precisionOverride,
    seriesRevision,
    showLastPriceLabel,
    showLastPriceLine,
    symbol,
    symbolInfo?.assetClass,
    symbolInfo?.last,
    timeframe,
    wickDownColor,
    wickUpColor,
    wickVisible,
  ]);

  // 4. Date range presets adjustment (only when symbol, timeframe, or preset changes — never reset on scroll-back!)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) return;

    const zoomKey = `${symbol}:${timeframe}:${dateRange}`;
    if (prevZoomKeyRef.current === zoomKey) {
      return;
    }
    prevZoomKeyRef.current = zoomKey;

    const total = bars.length;
    if (dateRange === 'All') {
      chart.timeScale().fitContent();
      if (total < 15000) {
        void useWorkspaceStore.getState().loadDeepHistory(15000);
      }
      return;
    }

    const tfSecMap: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '4h': 14400,
      '1D': 86400,
      '1W': 604800,
      '1M': 2592000,
    };
    const rangeSecMap: Record<string, number> = {
      '1D': 86400,
      '5D': 5 * 86400,
      '1M': 30 * 86400,
      '3M': 90 * 86400,
      '6M': 180 * 86400,
      YTD: 260 * 86400,
      '1Y': 365 * 86400,
      '5Y': 5 * 365 * 86400,
    };
    const step = tfSecMap[timeframe] ?? 86400;
    const targetSpanSec = rangeSecMap[dateRange] ?? 180 * 86400;
    const computedBars = Math.max(40, Math.min(2500, Math.round(targetSpanSec / step)));
    const count = Math.min(total, computedBars);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, total - count),
      to: total + 4,
    });
  }, [bars.length, dateRange, symbol, timeframe]);

  // 4b. Go-To-Date calendar jump
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || goToDateTimestamp === null || bars.length === 0) return;
    let idx = bars.findIndex((b) => b.time >= goToDateTimestamp);
    if (idx === -1) idx = bars.length - 1;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, idx - 30),
      to: Math.min(bars.length + 4, idx + 30),
    });
    setGoToDateTimestamp(null);
  }, [bars, goToDateTimestamp, setGoToDateTimestamp]);

  // 5. Compare Symbols Overlay
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    let cancelled = false;
    const activeSet = new Set(compareSymbols);

    for (const [sym, series] of compareSeriesRef.current.entries()) {
      if (!activeSet.has(sym)) {
        chart.removeSeries(series);
        compareSeriesRef.current.delete(sym);
      }
    }

    if (compareSymbols.length === 0 || bars.length === 0) return;

    const syncCompare = async () => {
      for (let idx = 0; idx < compareSymbols.length; idx += 1) {
        const sym = compareSymbols[idx];
        try {
          const res = await apiClient.getOHLCV({
            symbol: sym,
            timeframe,
            limit: bars.length,
            live: liveMarketData,
          });
          if (cancelled || res.bars.length === 0) continue;

          let series = compareSeriesRef.current.get(sym);
          if (!series) {
            series = chart.addSeries(
              LineSeries,
              {
                color: COMPARE_COLORS[idx % COMPARE_COLORS.length],
                lineWidth: 2,
                priceScaleId: `compare-${sym}`,
                title: sym,
              },
              0,
            );
            compareSeriesRef.current.set(sym, series);
          }

          series.setData(
            res.bars.map((b) => ({
              time: b.time as UTCTimestamp,
              value: b.close,
            })),
          );
        } catch {
          // Ignore individual compare fetch errors
        }
      }
    };

    void syncCompare();
    return () => {
      cancelled = true;
    };
  }, [bars.length, chartReady, compareSymbols, liveMarketData, timeframe]);

  // 6. Sync Indicators (Pane 0 Overlays + Pane 1..N Oscillators)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    const managed = managedIndicatorsRef.current;
    if (indicators.length === 0 && managed.size === 0) return;

    const activeIds = new Set(indicators.map((i) => i.instanceId));
    let panesChanged = false;

    // Remove deleted indicators and clean up empty sub-panes
    for (const [instanceId, entry] of managed.entries()) {
      if (!activeIds.has(instanceId)) {
        for (const s of entry.seriesList) {
          chart.removeSeries(s);
        }
        if (entry.paneApi) {
          const idx = entry.paneApi.paneIndex();
          if (idx > 0) {
            chart.removePane(idx);
            panesChanged = true;
          }
        }
        managed.delete(instanceId);
      }
    }

    // Add or update existing indicators
    for (const ind of indicators) {
      let entry = managed.get(ind.instanceId);

      if (!entry) {
        const seriesList: Array<ISeriesApi<SeriesType>> = [];
        let paneApi: IPaneApi<Time> | null = null;
        let targetPaneIdx = 0;

        if (ind.pane === 'sub') {
          paneApi = chart.addPane();
          paneApi.setHeight(130);
          targetPaneIdx = paneApi.paneIndex();
          panesChanged = true;
        }

        if (ind.id === 'bb') {
          seriesList.push(
            chart.addSeries(
              LineSeries,
              { color: ind.color, lineWidth: 1, priceLineVisible: false },
              targetPaneIdx,
            ),
            chart.addSeries(
              LineSeries,
              {
                color: ind.secondaryColor ?? '#f59e0b',
                lineWidth: 1,
                priceLineVisible: false,
              },
              targetPaneIdx,
            ),
            chart.addSeries(
              LineSeries,
              {
                color: ind.tertiaryColor ?? ind.color,
                lineWidth: 1,
                priceLineVisible: false,
              },
              targetPaneIdx,
            ),
          );
        } else if (ind.id === 'macd') {
          seriesList.push(
            chart.addSeries(
              LineSeries,
              { color: ind.color, lineWidth: 2, priceLineVisible: false },
              targetPaneIdx,
            ),
            chart.addSeries(
              LineSeries,
              {
                color: ind.secondaryColor ?? '#f59e0b',
                lineWidth: 1,
                priceLineVisible: false,
              },
              targetPaneIdx,
            ),
            chart.addSeries(
              HistogramSeries,
              { priceLineVisible: false },
              targetPaneIdx,
            ),
          );
        } else if (ind.id === 'stoch') {
          const kSeries = chart.addSeries(
            LineSeries,
            { color: ind.color, lineWidth: 2, priceLineVisible: false },
            targetPaneIdx,
          );
          const dSeries = chart.addSeries(
            LineSeries,
            { color: ind.secondaryColor ?? '#f59e0b', lineWidth: 1, priceLineVisible: false },
            targetPaneIdx,
          );
          kSeries.createPriceLine({
            price: 80,
            color: 'rgba(242, 54, 69, 0.45)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
          });
          kSeries.createPriceLine({
            price: 20,
            color: 'rgba(8, 153, 129, 0.45)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
          });
          seriesList.push(kSeries, dSeries);
        } else {
          const lineSeries = chart.addSeries(
            LineSeries,
            {
              color: ind.color,
              lineWidth: 2,
              priceLineVisible: false,
            },
            targetPaneIdx,
          );
          if (ind.id === 'rsi') {
            lineSeries.createPriceLine({
              price: 70,
              color: 'rgba(242, 54, 69, 0.45)',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
            });
            lineSeries.createPriceLine({
              price: 30,
              color: 'rgba(8, 153, 129, 0.45)',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
            });
          } else if (ind.id === 'adx') {
            lineSeries.createPriceLine({
              price: 25,
              color: 'rgba(245, 158, 11, 0.5)',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
            });
          }
          seriesList.push(lineSeries);
        }

        entry = { config: ind, seriesList, paneApi };
        managed.set(ind.instanceId, entry);
      }

      entry.config = ind;
      for (const s of entry.seriesList) {
        s.applyOptions({ visible: ind.visible });
      }

      if (bars.length > 0) {
        if (ind.id === 'sma') {
          const data = calcSMA(bars, ind.params.period ?? 20);
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        } else if (ind.id === 'ema') {
          const data = calcEMA(bars, ind.params.period ?? 20);
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        } else if (ind.id === 'vwap') {
          const data = calcVWAP(bars);
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        } else if (ind.id === 'bb') {
          const bb = calcBollingerBands(
            bars,
            ind.params.period ?? 20,
            ind.params.stdDev ?? 2,
          );
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            bb.upper.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
          (entry.seriesList[1] as ISeriesApi<'Line'>).setData(
            bb.middle.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
          (entry.seriesList[2] as ISeriesApi<'Line'>).setData(
            bb.lower.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        } else if (ind.id === 'rsi') {
          const data = calcRSI(bars, ind.params.period ?? 14);
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        } else if (ind.id === 'macd') {
          const macd = calcMACD(
            bars,
            ind.params.fast ?? 12,
            ind.params.slow ?? 26,
            ind.params.signal ?? 9,
          );
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            macd.macd.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
          (entry.seriesList[1] as ISeriesApi<'Line'>).setData(
            macd.signal.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
          (entry.seriesList[2] as ISeriesApi<'Histogram'>).setData(
            macd.histogram.map((d) => ({
              time: d.time as UTCTimestamp,
              value: d.value,
              color: d.color,
            })),
          );
        } else if (ind.id === 'atr') {
          const data = calcATR(bars, ind.params.period ?? 14);
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        } else if (ind.id === 'supertrend') {
          const data = calcSupertrend(bars, ind.params.period ?? 10, ind.params.multiplier ?? 3);
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        } else if (ind.id === 'stoch') {
          const st = calcStochastic(bars, ind.params.period ?? 14);
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            st.k.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
          (entry.seriesList[1] as ISeriesApi<'Line'>).setData(
            st.d.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        } else if (ind.id === 'adx') {
          const data = calcADX(bars, ind.params.period ?? 14);
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        } else if (ind.id === 'obv') {
          const data = calcOBV(bars);
          (entry.seriesList[0] as ISeriesApi<'Line'>).setData(
            data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        }
      }
    }

    if (panesChanged) {
      syncPlotGeometry();
    }
  }, [bars, chartReady, indicators]);

  // 7. BigQuery AI/ML Forecast, Anomaly Markers & Backtest Trade Markers
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    const forecastPts = chartOverlay?.forecast?.points ?? [];
    const showForecast = overlayVisible && forecastPts.length > 0;
    const anomalies =
      overlayVisible && chartOverlay?.anomalies ? chartOverlay.anomalies : [];
    const btTrades =
      backtestMarkersVisible &&
      showExecutionsOnChart &&
      backtestReport &&
      backtestReport.symbol === symbol
        ? backtestReport.trades
        : [];
    const hasActiveOverlay = showForecast || anomalies.length > 0 || btTrades.length > 0;

    // Fast path: nothing rendered previously and nothing to render now
    if (!hasActiveOverlay && !hadOverlayRef.current && !forecastSeriesRef.current) {
      return;
    }
    hadOverlayRef.current = hasActiveOverlay;

    if (!showForecast) {
      if (forecastSeriesRef.current) {
        chart.removeSeries(forecastSeriesRef.current.median);
        chart.removeSeries(forecastSeriesRef.current.upper);
        chart.removeSeries(forecastSeriesRef.current.lower);
        forecastSeriesRef.current = null;
      }
    } else {
      if (!forecastSeriesRef.current) {
        const median = chart.addSeries(
          LineSeries,
          {
            color: '#2962ff',
            lineWidth: 2,
            title: 'AI.FORECAST',
          },
          0,
        );
        const upper = chart.addSeries(
          LineSeries,
          {
            color: 'rgba(41, 98, 255, 0.7)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            lastValueVisible: false,
            priceLineVisible: false,
          },
          0,
        );
        const lower = chart.addSeries(
          LineSeries,
          {
            color: 'rgba(41, 98, 255, 0.7)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            lastValueVisible: false,
            priceLineVisible: false,
          },
          0,
        );
        forecastSeriesRef.current = { median, upper, lower };
      }

      const lastBar = bars[bars.length - 1];
      const bridgeMedian = lastBar
        ? [{ time: lastBar.time as UTCTimestamp, value: lastBar.close }]
        : [];
      const bridgeUpper = lastBar
        ? [{ time: lastBar.time as UTCTimestamp, value: lastBar.close }]
        : [];
      const bridgeLower = lastBar
        ? [{ time: lastBar.time as UTCTimestamp, value: lastBar.close }]
        : [];

      forecastSeriesRef.current.median.setData([
        ...bridgeMedian,
        ...forecastPts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      ]);
      forecastSeriesRef.current.upper.setData([
        ...bridgeUpper,
        ...forecastPts.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.upperBound,
        })),
      ]);
      forecastSeriesRef.current.lower.setData([
        ...bridgeLower,
        ...forecastPts.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.lowerBound,
        })),
      ]);
    }

    if (markersPluginRef.current) {
      const anomalyMarkers: Array<SeriesMarker<Time>> = anomalies.map((a) => ({
        time: a.time as UTCTimestamp,
        position: a.direction === 'high' ? 'aboveBar' : 'belowBar',
        shape: a.direction === 'high' ? 'arrowDown' : 'arrowUp',
        color: '#f59e0b',
        text: `ANOM ${(a.probability * 100).toFixed(0)}%`,
      }));
      const maxVisibleTrades = btTrades.slice(-28);
      const maxBarTime = bars.length > 0 ? bars[bars.length - 1].time : Infinity;
      const tradeMarkers: Array<SeriesMarker<Time>> = maxVisibleTrades.flatMap((t) => {
        const items: Array<SeriesMarker<Time>> = [];
        if (t.entryTime <= maxBarTime) {
          items.push({
            time: t.entryTime as UTCTimestamp,
            position: t.side === 'long' ? 'belowBar' : 'aboveBar',
            shape: t.side === 'long' ? 'arrowUp' : 'arrowDown',
            color: t.side === 'long' ? '#089981' : '#f23645',
            text: `${t.side === 'long' ? 'L' : 'S'}#${t.tradeNumber}`,
          });
        }
        if (t.exitTime <= maxBarTime) {
          items.push({
            time: t.exitTime as UTCTimestamp,
            position: t.side === 'long' ? 'aboveBar' : 'belowBar',
            shape: t.side === 'long' ? 'arrowDown' : 'arrowUp',
            color: t.netProfit >= 0 ? '#089981' : '#f23645',
            text: `X#${t.tradeNumber} ${t.netProfit >= 0 ? '+' : ''}${t.netProfitPercent.toFixed(1)}%`,
          });
        }
        return items;
      });
      const combined = [...anomalyMarkers, ...tradeMarkers].sort(
        (a, b) => Number(a.time) - Number(b.time),
      );
      markersPluginRef.current.setMarkers(combined);
    }

    syncPlotGeometry();
  }, [
    backtestMarkersVisible,
    backtestReport,
    bars,
    chartOverlay,
    chartReady,
    chartStyle,
    overlayVisible,
    seriesRevision,
    showExecutionsOnChart,
    symbol,
  ]);

  // 8. Live Paper Position Entry / Stop-Loss / Take-Profit Price Lines
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series || !chartReady) return;

    for (const pl of positionPriceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        // Series may have been recreated
      }
    }
    positionPriceLinesRef.current = [];

    if (!showPositionsOnChart) return;

    const symUpper = symbol.toUpperCase();
    const openPositions = (paperAccount?.positions ?? []).filter(
      (p) => p.symbol.toUpperCase() === symUpper,
    );
    for (const pos of openPositions) {
      const pnlStr = `${pos.unrealizedPnl >= 0 ? '+' : ''}$${pos.unrealizedPnl.toFixed(2)}`;
      positionPriceLinesRef.current.push(
        series.createPriceLine({
          price: pos.avgEntryPrice,
          color: '#2962ff',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${pos.side.toUpperCase()} ${pos.quantity} · ${pnlStr}`,
        }),
      );
      if (showBracketsOnChart && pos.stopLossPrice && Number.isFinite(pos.stopLossPrice)) {
        positionPriceLinesRef.current.push(
          series.createPriceLine({
            price: pos.stopLossPrice,
            color: '#f23645',
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `SL ${pos.stopLossPrice.toFixed(2)}`,
          }),
        );
      }
      if (showBracketsOnChart && pos.takeProfitPrice && Number.isFinite(pos.takeProfitPrice)) {
        positionPriceLinesRef.current.push(
          series.createPriceLine({
            price: pos.takeProfitPrice,
            color: '#089981',
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `TP ${pos.takeProfitPrice.toFixed(2)}`,
          }),
        );
      }
    }
  }, [
    chartReady,
    chartStyle,
    paperAccount?.positions,
    showBracketsOnChart,
    showPositionsOnChart,
    symbol,
  ]);

  // 9. Active Price Alert Lines & High/Low Reference Lines
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series || !chartReady) return;

    for (const pl of alertPriceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        // Ignore stale price line handle
      }
    }
    alertPriceLinesRef.current = [];

    if (showAlertLinesOnChart) {
      const symUpper = symbol.toUpperCase();
      for (const alert of alerts) {
        if (alert.symbol.toUpperCase() !== symUpper) continue;
        alertPriceLinesRef.current.push(
          series.createPriceLine({
            price: alert.targetPrice,
            color: alertLineColor,
            lineWidth: 1,
            lineStyle: alert.triggered ? LineStyle.Dotted : LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Alert ${alert.condition === 'above' ? '≥' : '≤'}`,
          }),
        );
      }
    }

    for (const pl of highLowPriceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        // Ignore stale price line handle
      }
    }
    highLowPriceLinesRef.current = [];

    if (showHighLowLines && bars.length > 0) {
      const windowBars = bars.slice(-Math.min(bars.length, 200));
      let hi = -Infinity;
      let lo = Infinity;
      for (const b of windowBars) {
        if (b.high > hi) hi = b.high;
        if (b.low < lo) lo = b.low;
      }
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        highLowPriceLinesRef.current.push(
          series.createPriceLine({
            price: hi,
            color: '#089981',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'High',
          }),
          series.createPriceLine({
            price: lo,
            color: '#f23645',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'Low',
          }),
        );
      }
    }
  }, [
    alertLineColor,
    alerts,
    bars,
    chartReady,
    chartStyle,
    showAlertLinesOnChart,
    showHighLowLines,
    symbol,
  ]);

  // 10. Optional Session Breaks & Macro Economic Event Badges
  const eventOverlayCoords = useMemo(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady || bars.length === 0) {
      return { sessionXs: [] as number[], events: [] as Array<{ x: number; code: string; title: string }> };
    }
    const ts = chart.timeScale();
    const sessionXs: number[] = [];
    if (showSessionBreaks) {
      const recent = bars.slice(-300);
      for (let i = 1; i < recent.length; i += 1) {
        const prevDay = Math.floor(recent[i - 1].time / 86400);
        const curDay = Math.floor(recent[i].time / 86400);
        if (curDay !== prevDay) {
          const x = ts.timeToCoordinate(recent[i].time as UTCTimestamp);
          if (x !== null && x >= 0 && x <= plotSize.width) {
            sessionXs.push(x);
          }
        }
      }
    }

    const events: Array<{ x: number; code: string; title: string }> = [];
    if (showEconomicEvents && bars.length >= 25) {
      const catalog = [
        { offset: 6, code: 'CPI', title: 'US Core CPI Release (High Impact)' },
        { offset: 18, code: 'FOMC', title: 'Federal Reserve Rate Decision' },
        { offset: 34, code: 'NFP', title: 'Non-Farm Payrolls Employment Report' },
        { offset: 52, code: 'PMI', title: 'ISM Manufacturing & Services PMI' },
      ];
      for (const item of catalog) {
        const idx = bars.length - item.offset;
        if (idx >= 0 && idx < bars.length) {
          const x = ts.timeToCoordinate(bars[idx].time as UTCTimestamp);
          if (x !== null && x >= 14 && x <= plotSize.width - 14) {
            events.push({ x, code: item.code, title: item.title });
          }
        }
      }
    }

    return { sessionXs, events };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bars,
    chartReady,
    overlayRevision,
    plotSize.width,
    showEconomicEvents,
    showSessionBreaks,
  ]);

  // Quick hover navigation controls
  const zoomBy = (factor: number) => {
    const ts = chartRef.current?.timeScale();
    const range = ts?.getVisibleLogicalRange();
    if (!ts || !range) return;
    const span = range.to - range.from;
    const nextSpan = Math.max(10, Math.min(bars.length + 30, span * factor));
    const delta = nextSpan - span;
    ts.setVisibleLogicalRange({
      from: range.from - delta,
      to: range.to,
    });
  };

  const panBy = (barsDelta: number) => {
    const ts = chartRef.current?.timeScale();
    const range = ts?.getVisibleLogicalRange();
    if (!ts || !range) return;
    ts.setVisibleLogicalRange({
      from: range.from + barsDelta,
      to: range.to + barsDelta,
    });
  };

  return (
    <div className="group relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {(eventOverlayCoords.sessionXs.length > 0 || eventOverlayCoords.events.length > 0) &&
        plotSize.width > 0 &&
        plotSize.height > 0 && (
          <div
            data-testid="chart-events-overlay"
            style={{ width: plotSize.width, height: plotSize.height }}
            className="pointer-events-none absolute top-0 left-0 z-10 overflow-hidden"
          >
            {eventOverlayCoords.sessionXs.length > 0 && (
              <svg className="w-full h-full">
                {eventOverlayCoords.sessionXs.map((x, idx) => (
                  <line
                    key={idx}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={plotSize.height}
                    stroke="rgba(120, 123, 134, 0.35)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                ))}
              </svg>
            )}
            {eventOverlayCoords.events.map((ev) => (
              <div
                key={ev.code}
                title={ev.title}
                style={{ left: ev.x - 16, pointerEvents: 'auto' }}
                className="absolute bottom-1.5 w-8 h-5 rounded-full border border-[#2962ff]/60 bg-[#1e222d]/90 text-[#d1d4dc] text-[9px] font-bold flex items-center justify-center shadow"
              >
                {ev.code}
              </div>
            ))}
          </div>
        )}

      <DrawingOverlayBoundary>
        <DrawingOverlay
          chart={chartRef.current}
          mainSeries={mainSeriesRef.current}
          bars={bars}
          symbol={symbol}
          timeframe={timeframe}
          chartOverlay={chartOverlay}
          overlayVisible={overlayVisible}
          plotWidth={plotSize.width}
          paneHeight={plotSize.height}
          revision={overlayRevision}
        />
      </DrawingOverlayBoundary>

      <BarReplayBar />

      {loadingBars && bars.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--tv-bg-canvas)]/70 text-[12px] text-[var(--tv-text-muted)]">
          Loading {symbol} ({timeframe})...
        </div>
      )}

      {marketError && (
        <div className="absolute top-12 right-20 z-20 px-3 py-1.5 rounded-[4px] border border-[#f23645]/40 bg-[#f23645]/10 text-[#f23645] text-[12px]">
          {marketError}
        </div>
      )}

      {/* Subtle Floating Bottom-Center Chart Navigation Bar */}
      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 px-1.5 py-1 rounded-[6px] border border-[var(--tv-border)] bg-[var(--tv-bg-elevated)]/90 shadow-lg">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomBy(1.25)}
          className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomBy(0.75)}
          className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Scroll left"
          title="Scroll left"
          onClick={() => panBy(-15)}
          className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Scroll right"
          title="Scroll right"
          onClick={() => panBy(15)}
          className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Reset chart view"
          title="Reset chart view"
          onClick={() => chartRef.current?.timeScale().fitContent()}
          className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Scroll to latest bar"
          title="Scroll to latest bar"
          onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
          className="w-6 h-6 rounded flex items-center justify-center text-[var(--tv-text-secondary)] hover:bg-[var(--tv-bg-hover)] hover:text-[var(--tv-text-primary)] cursor-pointer"
        >
          <LocateFixed className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
