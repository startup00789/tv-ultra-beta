# Drawing Engine — REA Breakdown (Long/Short Position)

REA methodology: **Observation → Inference → Unknown → Experiment → Updated model**, with an evidence ledger that separates what was *seen* from what was *assumed*. The REA MCP servers are not registered in this environment, so the workflow was applied manually using the methodology documented in the attached `rea-main` skill (`SKILL.md`) plus browser/reference evidence.

## Evidence ledger

| ID | Class | Evidence | Source |
|----|-------|----------|--------|
| E1 | Observation (primary) | Long Position drawing console/docs page | `https://www.tradingview.com/support/solutions/43000517002-long-position-drawing-tool/` |
| E2 | Observation (primary) | "How to use Long and Short Position drawing tools" | `https://www.tradingview.com/support/solutions/43000475660-how-to-use-long-and-short-position-drawing-tools/` |
| E3 | Observation (image) | Tool visual: gray entry line, green profit rectangle above, red loss rectangle below; axis tags `256.37`, `250.81`, `243.93` | `C:\Users\Asus\AppData\Local\Temp\opencode\tv-ref\tool.png` |
| E4 | Observation (image) | Stats tags (short): `Stop: 0.38 (0.153%) 38, Amount: 750`, `Target: 0.38 (0.153%) 38, Amount: 1250`, `Closed P&L: -0.38`, `Qty: 657`, `Risk/Reward Ratio: 1` | `...\tv-ref\tags.png` |
| E5 | Observation (image) | Inputs: `Account size 1000`, `Lot size 1`, `Risk 25.00 %`, `Entry price 259.56`, `Leverage 10000.0`, `Profit: Ticks 688 / Price 266.44`, `Stop: Ticks 688 / Price 252.68`, `QTY precision Default` | `...\tv-ref\inputs.png` |
| E6 | Observation (image) | Tag semantics: target/stop tags show price **offset**, percent, ticks, account `Amount`, P&L; entry tag shows P&L, Qty, R:R | `...\tv-ref\formula.png` |
| E7 | Observation (primary docs) | `QtyRisk = (Risk / ((Entry − Stop) × PointValue)) / LotSize`; `QtyLvg = (Account × Leverage / Entry) × PointValue / LotSize`; `Qty = min(QtyRisk, QtyLvg)`; PnL offset × qty × point value × lot size | TradingView support solutions above |
| E8 | Observation (repo) | Position renderer only had 2 anchors, stop forced to 50% of target distance, `return null` when TP/SL off-screen, fixed 120 px width, hardcoded colors, 162 px left label, R:R printed `1:${rr}` | `src/components/drawings/DrawingOverlay.tsx` (pre-change ≈ 592–602, 2631–2751) |
| E9 | Observation (repo) | Dragging TP/SL updated only `stopPrice`/`targetPrice`; later body drags mutated points without syncing meta | `DrawingOverlay.tsx` (pre-change ≈ 774–821) |
| E10 | Observation (repo) | No drawing persistence key or server route; all drawings initialized `[]` | `src/state/workspaceStore.ts` (pre-change ≈ 604) |
| E11 | Observation (repo) | Settings had only `$ Risk`, `Stop-Loss Price`, `Take-Profit Price`; no account/lot/risk%/leverage/ticks/precision inputs | `src/components/drawings/DrawingSettingsModal.tsx` (pre-change ≈ 853–904) |
| E12 | Observation (repo) | Existing gap analysis of handle/border/hit-corridor issues | `REA_DRAWING_AND_SETTINGS_SPEC.md` |
| E13 | Observation (library) | `priceToCoordinate` returns `null` only when the series has no data; off-screen prices still produce coordinates | `node_modules/lightweight-charts/dist/lightweight-charts.development.mjs` |

## Model reconstruction

### Geometry model
- **Observed:** TV positions are bounded by an entry line plus a profit zone and a loss zone (E3). Right-edge axis tags show three levels (E3).
- **Inferred:** the durable model needs **three anchors**: entry (left), target (right), stop (right). Time of the right anchors also defines the position's duration/right edge. Store `targetPrice`/`stopPrice` remain as derived metadata for compatibility with existing drawings and templates.
- **Unknown:** whether TV stores a stop anchor or derives it from a risk input internally. We chose an explicit stop anchor because it is the only model that preserves arbitrary R:R and body-drag semantics.

### Sizing math
- **Observed:** E5 inputs and E7 formulas.
- **Inferred:** risk mode can be percent or fixed amount; `RiskSize = risk% × account`. Quantity is floored to whole lots. P&L tags use the **offset**, not the absolute level (E6).
- **Unknown:** TV's exact rounding for fractional lots and crypto point value. We use `pointValue = 1` by default, exposed in Inputs, and floor to lot size with configurable qty precision.

### Interaction model
- **Observed:** the tool screenshot shows handles at the three levels (E3); docs show resizable duration (E2).
- **Inferred:** entry/target/stop are independently draggable; TP/SL are clamped to the correct side of entry with a minimum tick gap; dragging the body translates all three levels together; a duration handle changes the right edge without moving prices.
- **Unknown:** TV's same-candle TP/SL tie-break. We use candle direction as a deterministic tie-breaker and label the result as approximate.

### Stats and outcomes
- **Observed:** target/stop tags: offset, percent, ticks, account Amount, P&L; center tag: Closed/Open P&L, Qty, R:R (E4, E6).
- **Inferred:** replay bars between entry and right edge; once entry is touched, first TP/SL touch closes the position. If neither is touched, show Open P&L at the latest price in range.
- **Unknown:** intrabar path. The simulation is intentionally an approximation and is documented as such in code.

### Persistence
- **Observed:** E10.
- **Inferred:** drawings must be restored across refresh and migrated. A versioned localStorage envelope with per-drawing validation and position migration satisfies this without a server dependency.

## Gap → fix map

| Gap | Fix | Status |
|-----|-----|--------|
| Two-anchor position, forced 1:2 R:R | `buildPositionDrawing` / three anchors, mirrored stop, free R:R | Implemented |
| TP/SL off-screen ⇒ whole position vanishes | No `null` bail on individual off-screen levels; independent `timeToX` / `priceToY` | Implemented |
| Body drag desyncs meta | Store rebuilds `targetPrice`/`stopPrice` from points on every position patch | Implemented |
| Unclamped/inverted zones | `normalizePositionGeometry` enforces side + minimum tick gap | Implemented |
| Hardcoded colors/fill | Separate target/stop colors, `showFill`, `fillOpacity`, independent border | Implemented |
| Fixed-width, left-floating 162 px label | Right-edge price chips + three TV-style stats tags with in-pane clamping | Implemented |
| Wrong R:R format | `formatPositionRatio` shows ratio value, not `1:x` | Implemented |
| Disconnected settings inputs | Inputs tab with account/lot/risk%/leverage/ticks/precision and computed preview | Implemented |
| No persistence | Versioned, validated, debounced localStorage envelope + migration | Implemented |
| Generic anchor dots collide with TP/SL handles | Position renderer owns four purpose-built handles | Implemented |
| Crash in one drawing kills the overlay | Error boundary around `DrawingOverlay` | Implemented |
| Thin-line hit corridors / independent borders on non-position tools | Renderer audit: 16 px transparent corridors found on hline/hray/crossline/vline, trendline/path/ray/extended/arrow, brush/highlighter, rect/circle/triangle/gann_box/measure/callout/text, channel (rails + midline), fib/fib_fan/fib_ext, regression, pitchfork, ABCD/XABCD/Head&Shoulders/Elliott wave, anchored VWAP/VP, price/date range; border colors already independent via `effectiveBorderColor` | Audited — already present |

## Verification results

- Unit tests: **90/90 passing** (9 files), including 22 new pure position-engine tests and 5 store persistence/sync tests.
- Typecheck: passes for web + server.
- Production build: passes (one pre-existing bundle-size warning).
- Browser smoke (Chromium, dev server on 127.0.0.1:5180):
  - Placed a Long Position by drag; got the expected 3 anchors and a symmetric bracket.
  - Dragged the target handle: TP price and `targetPrice` changed together; stop stayed put; R:R updated to 1.43.
  - Dragged the body: entry, target and stop all moved by the same price delta; metadata stayed in sync.
  - Opened Settings → Inputs, changed Account size 10,000 → 5,000; the persisted drawing reflected it.
  - Reloaded the page: the drawing, zones, price chips and 3-anchor state were restored.
  - Visually confirmed green profit zone, red loss zone, gray entry line, right-edge price chips, and TV-style stats tags with no chip/tag overlap.

## Confidence

- High: geometry, formulas, persistence, settings wiring.
- Medium: exact TV same-candle tie-break, point value defaults, compact tag wording.
- Low: TV's internal storage schema (not observable from the browser UI).
