import type { ReactNode } from 'react';
import type {
  PositionHandleKind,
  PositionMetrics,
  PositionOutcome,
  PositionSide,
  PositionTagSet,
  PositionTagLayout,
} from '../../lib/drawingPosition';
import { estimateTagWidth } from '../../lib/drawingPosition';
import type { PositionBoxPixels } from '../../lib/drawingPosition';

export interface PositionShapeProps {
  side: PositionSide;
  metrics: PositionMetrics;
  outcome: PositionOutcome;
  tags: PositionTagSet;
  box: PositionBoxPixels;
  plotWidth: number;
  paneHeight: number;
  lineColor: string;
  lineWidth: number;
  lineDash?: string;
  lineOpacity?: number;
  targetColor: string;
  stopColor: string;
  showFill: boolean;
  fillOpacity: number;
  showBorder: boolean;
  borderColor: string;
  borderWidth: number;
  borderDash?: string;
  borderOpacity?: number;
  fontSize: number;
  showPriceLabels: boolean;
  statsVisible: boolean;
  selected: boolean;
  interactive: boolean;
  locked: boolean;
  priceFormatter: (value: number) => string;
  onHandleDown: (handle: PositionHandleKind, ev: React.PointerEvent<SVGGElement>) => void;
}

const CHIP_HEIGHT = 15;
const CHIP_FONT = 9.5;

function withAlpha(hex: string, alpha: number): string {
  const clean = (hex || '#2962ff').replace('#', '');
  const full =
    clean.length === 3
      ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
      : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toneColor(tone: PositionTagLayout['tone'], targetColor: string, stopColor: string): string {
  if (tone === 'target' || tone === 'profit') return targetColor;
  if (tone === 'stop' || tone === 'loss') return stopColor;
  return '#787b86';
}

/** Greedy collision avoidance for the three right-edge price chips. */
function layoutPriceChips(
  levels: Array<{ key: 'entry' | 'target' | 'stop'; y: number; color: string; text: string }>,
  paneHeight: number,
): Array<{ key: string; y: number; color: string; text: string }> {
  const sorted = [...levels].sort((a, b) => a.y - b.y);
  let cursor = -Infinity;
  return sorted.map((item) => {
    const y = clamp(Math.max(item.y, cursor + CHIP_HEIGHT + 1), CHIP_HEIGHT, paneHeight - 2);
    cursor = y;
    return { ...item, y };
  });
}

function PositionTag({
  x,
  y,
  width,
  lines,
  color,
  fontSize,
  plotWidth,
  paneHeight,
}: {
  x: number;
  y: number;
  width: number;
  lines: string[];
  color: string;
  fontSize: number;
  plotWidth: number;
  paneHeight: number;
}): ReactNode {
  const lineHeight = Math.max(11, fontSize + 2);
  const safeWidth = clamp(width, 40, Math.max(40, plotWidth - 8));
  const safeX = clamp(x, 4, Math.max(4, plotWidth - safeWidth - 4));
  const height = lines.length * lineHeight + 4;
  const safeY = clamp(y, 2, Math.max(2, paneHeight - height - 2));
  return (
    <g pointerEvents="none">
      <rect x={safeX} y={safeY} width={safeWidth} height={height} rx={3} fill={color} opacity={0.94} />
      {lines.map((line, idx) => (
        <text
          key={idx}
          x={safeX + 6}
          y={safeY + 3 + lineHeight * idx + fontSize}
          fill="#ffffff"
          fontSize={fontSize}
          fontWeight={600}
          fontFamily="inherit"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export function PositionShape({
  side,
  metrics,
  outcome,
  tags,
  box,
  plotWidth,
  paneHeight,
  lineColor,
  lineWidth,
  lineDash,
  lineOpacity = 1,
  targetColor,
  stopColor,
  showFill,
  fillOpacity,
  showBorder,
  borderColor,
  borderWidth,
  borderDash,
  borderOpacity = 1,
  fontSize,
  showPriceLabels,
  statsVisible,
  selected,
  interactive,
  locked,
  priceFormatter,
  onHandleDown,
}: PositionShapeProps): ReactNode {
  const left = Math.min(box.leftX, box.rightX);
  const right = Math.max(box.leftX, box.rightX);
  const width = Math.max(1, right - left);
  const entryY = box.entryY;
  const targetY = box.targetY;
  const stopY = box.stopY;
  const targetTop = Math.min(entryY, targetY);
  const targetHeight = Math.max(1, Math.abs(targetY - entryY));
  const stopTop = Math.min(entryY, stopY);
  const stopHeight = Math.max(1, Math.abs(stopY - entryY));

  const entryStroke = withAlpha(lineColor, lineOpacity);
  const targetStroke = withAlpha(targetColor, lineOpacity);
  const stopStroke = withAlpha(stopColor, lineOpacity);
  const border = showBorder && borderWidth > 0;
  const borderStroke = border ? withAlpha(borderColor, borderOpacity) : 'none';
  const borderW = border ? borderWidth : 0;

  const chips = showPriceLabels && metrics.valid
    ? layoutPriceChips(
        [
          { key: 'entry', y: entryY, color: '#787b86', text: priceFormatter(metrics.entry) },
          { key: 'target', y: targetY, color: targetColor, text: priceFormatter(metrics.target) },
          { key: 'stop', y: stopY, color: stopColor, text: priceFormatter(metrics.stop) },
        ],
        paneHeight,
      )
    : [];
  const chipRight = Math.max(30, Math.min(right, plotWidth - 4));
  const maxChipWidth = chips.reduce(
    (max, chip) => Math.max(max, Math.ceil(chip.text.length * CHIP_FONT * 0.55 + 10)),
    0,
  );
  // Keep the wide stats tags clear of the right-edge price chips.
  const tagRight = Math.max(4, chipRight - maxChipWidth - 8);
  const durationHandleY = clamp((targetY + stopY) / 2, 12, paneHeight - 12);
  const handlesVisible = selected && interactive && !locked && metrics.valid;
  const handleSquare = 11;

  const lineHeight = Math.max(11, fontSize + 2);
  const targetTagWidth = estimateTagWidth(tags.target, fontSize);
  const stopTagWidth = estimateTagWidth(tags.stop, fontSize);
  const centerTagWidth = Math.max(
    estimateTagWidth(tags.centerLine1, fontSize),
    estimateTagWidth(tags.centerLine2, fontSize),
  );
  const tagX = (tagWidth: number) => Math.max(4, tagRight - tagWidth);
  const centerColor = toneColor(tags.centerTone, targetColor, stopColor);

  return (
    <>
      {/* Transparent body hit area keeps the entire position easy to grab. */}
      <rect
        x={left}
        y={Math.min(targetTop, stopTop)}
        width={width}
        height={Math.max(targetHeight, stopHeight) + 2}
        fill="rgba(0, 0, 0, 0.001)"
      />

      {/* Profit / loss zones */}
      <rect
        data-testid="position-profit-zone"
        x={left}
        y={targetTop}
        width={width}
        height={targetHeight}
        fill={showFill ? withAlpha(targetColor, fillOpacity) : 'rgba(0, 0, 0, 0.001)'}
        stroke={borderStroke}
        strokeWidth={borderW}
        strokeDasharray={borderDash}
      />
      <rect
        data-testid="position-loss-zone"
        x={left}
        y={stopTop}
        width={width}
        height={stopHeight}
        fill={showFill ? withAlpha(stopColor, fillOpacity) : 'rgba(0, 0, 0, 0.001)'}
        stroke={borderStroke}
        strokeWidth={borderW}
        strokeDasharray={borderDash}
      />

      {/* Entry / target / stop levels */}
      <line
        data-testid="position-entry-line"
        x1={left}
        y1={entryY}
        x2={right}
        y2={entryY}
        stroke={entryStroke}
        strokeWidth={Math.max(1, lineWidth)}
        strokeDasharray={lineDash}
        strokeLinecap="round"
      />
      <line
        data-testid="position-target-line"
        x1={left}
        y1={targetY}
        x2={right}
        y2={targetY}
        stroke={targetStroke}
        strokeWidth={Math.max(1, lineWidth)}
        strokeDasharray={lineDash}
        strokeLinecap="round"
      />
      <line
        data-testid="position-stop-line"
        x1={left}
        y1={stopY}
        x2={right}
        y2={stopY}
        stroke={stopStroke}
        strokeWidth={Math.max(1, lineWidth)}
        strokeDasharray={lineDash}
        strokeLinecap="round"
      />

      {/* Right-edge price tags (inside the plot, TradingView-style) */}
      {chips.map((chip) => {
        const chipWidth = Math.ceil(chip.text.length * CHIP_FONT * 0.55 + 10);
        const x = Math.max(4, chipRight - chipWidth);
        return (
          <g key={chip.key} pointerEvents="none">
            <rect
              x={x}
              y={chip.y - CHIP_HEIGHT / 2}
              width={chipWidth}
              height={CHIP_HEIGHT}
              rx={2}
              fill={chip.color}
              opacity={0.95}
            />
            <text
              x={x + chipWidth - 4}
              y={chip.y + 3.2}
              textAnchor="end"
              fill="#ffffff"
              fontSize={CHIP_FONT}
              fontWeight={700}
              fontFamily="inherit"
            >
              {chip.text}
            </text>
          </g>
        );
      })}

      {/* TradingView-style stats tags */}
      {statsVisible && (
        <>
          <PositionTag
            x={tagX(targetTagWidth)}
            y={targetY - lineHeight - 10}
            width={targetTagWidth}
            lines={[tags.target]}
            color={targetColor}
            fontSize={fontSize}
            plotWidth={plotWidth}
            paneHeight={paneHeight}
          />
          <PositionTag
            x={tagX(stopTagWidth)}
            y={stopY + 10}
            width={stopTagWidth}
            lines={[tags.stop]}
            color={stopColor}
            fontSize={fontSize}
            plotWidth={plotWidth}
            paneHeight={paneHeight}
          />
          <PositionTag
            x={tagX(centerTagWidth)}
            y={entryY - lineHeight * 2 - 11}
            width={centerTagWidth}
            lines={[tags.centerLine1, tags.centerLine2]}
            color={centerColor}
            fontSize={fontSize}
            plotWidth={plotWidth}
            paneHeight={paneHeight}
          />
        </>
      )}

      {!metrics.valid && (
        <text
          x={left + 8}
          y={Math.max(14, Math.min(entryY - 8, paneHeight - 6))}
          fill="#f23645"
          fontSize={Math.max(10, fontSize)}
          fontWeight={600}
        >
          {metrics.reason ?? 'Invalid position'}
        </text>
      )}

      {handlesVisible && (
        <>
          <PositionHandle
            kind="entry"
            x={left}
            y={entryY}
            color="#2962ff"
            cursor="ns-resize"
            size={handleSquare}
            onHandleDown={onHandleDown}
          />
          <PositionHandle
            kind="target"
            x={right}
            y={targetY}
            color={targetColor}
            cursor="ns-resize"
            size={handleSquare}
            onHandleDown={onHandleDown}
          />
          <PositionHandle
            kind="stop"
            x={right}
            y={stopY}
            color={stopColor}
            cursor="ns-resize"
            size={handleSquare}
            onHandleDown={onHandleDown}
          />
          <PositionHandle
            kind="duration"
            x={right}
            y={durationHandleY}
            color="#2962ff"
            cursor="ew-resize"
            size={handleSquare}
            onHandleDown={onHandleDown}
          />
        </>
      )}

      <title>
        {`${side === 'long' ? 'Long' : 'Short'} position — entry ${priceFormatter(
          metrics.entry,
        )}, target ${priceFormatter(metrics.target)}, stop ${priceFormatter(
          metrics.stop,
        )}, risk/reward ${metrics.riskReward.toFixed(2)}, qty ${metrics.qty}`}
      </title>
      <desc>{`Outcome: ${outcome.status}`}</desc>
    </>
  );
}

function PositionHandle({
  kind,
  x,
  y,
  color,
  cursor,
  size,
  onHandleDown,
}: {
  kind: PositionHandleKind;
  x: number;
  y: number;
  color: string;
  cursor: string;
  size: number;
  onHandleDown: (handle: PositionHandleKind, ev: React.PointerEvent<SVGGElement>) => void;
}): ReactNode {
  return (
    <g
      data-testid={`position-handle-${kind}`}
      style={{ cursor }}
      onPointerDown={(ev) => {
        ev.stopPropagation();
        onHandleDown(kind, ev);
      }}
    >
      <title>{`${kind[0].toUpperCase()}${kind.slice(1)} handle`}</title>
      <rect x={x - 11} y={y - 11} width={22} height={22} fill="transparent" />
      <rect
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        rx={1.5}
        fill="#ffffff"
        stroke={kind === 'target' ? color : kind === 'stop' ? color : '#2962ff'}
        strokeWidth={2}
      />
    </g>
  );
}
