import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A malformed drawing must never take down the whole chart. This boundary is
 * intentionally narrow: only the drawing overlay is isolated, so panning,
 * indicators, and live data keep working while the bad drawing is reported.
 */
export class DrawingOverlayBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a diagnostic in the console for support, without leaking a stack
    // trace into the UI.
    console.error('[DrawingOverlay] render failed', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div
        data-testid="drawing-overlay-error-boundary"
        className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 max-w-[460px] rounded-[6px] border border-[#f23645]/50 bg-[#1e222d]/95 px-3 py-2 text-[11.5px] text-[#f23645] shadow-lg"
      >
        <div className="font-semibold">Drawing overlay could not render</div>
        <div className="mt-0.5 text-[var(--tv-text-muted)]">
          The chart is still live. Remove the last drawing or reload to recover.
        </div>
        <button
          type="button"
          onClick={this.handleReset}
          className="pointer-events-auto mt-1.5 h-[24px] rounded border border-[#f23645]/50 px-2 text-[10.5px] font-semibold text-[#f23645] cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }
}
