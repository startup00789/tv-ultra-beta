import { useMemo } from 'react';
import { AIAssistantPanel } from './components/ai/AIAssistantPanel';
import { AIConsoleDrawer } from './components/ai/AIConsoleDrawer';
import { PineScriptEditorDrawer } from './components/backtester/PineScriptEditorDrawer';
import { StrategyBacktesterDrawer } from './components/backtester/StrategyBacktesterDrawer';
import { ForwardTestDemoDrawer } from './components/trading/ForwardTestDemoDrawer';
import { ChartCanvas } from './components/chart/ChartCanvas';
import { ChartLegend } from './components/chart/ChartLegend';
import { ChartSettingsModal } from './components/chart/ChartSettingsModal';
import { IndicatorsModal } from './components/chart/IndicatorsModal';
import { SymbolSearchModal } from './components/chart/SymbolSearchModal';
import { ConnectionsModal } from './components/connections/ConnectionsModal';
import { TopBarConnectionPills } from './components/connections/TopBarConnectionPills';
import { DrawingSettingsModal } from './components/drawings/DrawingSettingsModal';
import { LeftDrawingToolbar } from './components/drawings/LeftDrawingToolbar';
import { ShellWorkspace } from './components/shell/ShellWorkspace';
import type { WorkspaceSlots } from './components/shell/slots';
import { AlertsPanel } from './components/watchlist/AlertsPanel';
import { ObjectTreePanel } from './components/watchlist/ObjectTreePanel';
import { StrategyAlertsLogDrawer } from './components/watchlist/StrategyAlertsLogDrawer';
import { WatchlistPanel } from './components/watchlist/WatchlistPanel';

export interface AppProps {
  slots?: WorkspaceSlots;
}

export function App({ slots }: AppProps) {
  const defaultSlots = useMemo<WorkspaceSlots>(
    () => ({
      topBarPills: <TopBarConnectionPills />,
      leftDrawingToolbar: <LeftDrawingToolbar />,
      chartCanvas: <ChartCanvas />,
      chartLegend: <ChartLegend />,
      rightPanels: {
        watchlist: <WatchlistPanel />,
        ai: <AIAssistantPanel />,
        objects: <ObjectTreePanel />,
        alerts: <AlertsPanel />,
      },
      bottomPanels: {
        backtester: <StrategyBacktesterDrawer />,
        forward_test: <ForwardTestDemoDrawer />,
        autotrade: <ForwardTestDemoDrawer />,
        ai: <AIConsoleDrawer />,
        alerts: <StrategyAlertsLogDrawer />,
        script: <PineScriptEditorDrawer />,
      },
      connectionsModal: <ConnectionsModal />,
      symbolSearchModal: <SymbolSearchModal />,
      indicatorsModal: <IndicatorsModal />,
      chartSettingsModal: <ChartSettingsModal />,
      ...slots,
    }),
    [slots],
  );

  return (
    <>
      <ShellWorkspace slots={defaultSlots} />
      <DrawingSettingsModal />
    </>
  );
}

export default App;
