import type { ReactNode } from 'react';
import type { BottomTab, RightTab } from '../../state/workspaceStore';

export interface WorkspaceSlots {
  topBarPills?: ReactNode;
  leftDrawingToolbar?: ReactNode;
  chartCanvas?: ReactNode;
  chartLegend?: ReactNode;
  bottomRangeBar?: ReactNode;
  rightIconRail?: ReactNode;
  rightPanels?: Partial<Record<Exclude<RightTab, null>, ReactNode>>;
  bottomPanels?: Partial<Record<BottomTab, ReactNode>>;
  connectionsModal?: ReactNode;
  symbolSearchModal?: ReactNode;
  indicatorsModal?: ReactNode;
  chartSettingsModal?: ReactNode;
}
