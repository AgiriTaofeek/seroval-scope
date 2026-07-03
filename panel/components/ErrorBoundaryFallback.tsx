import { Component, type ReactNode } from "react";

interface Props {
	children: ReactNode;
}

interface State {
	error: Error | null;
}

// Scoped to just the tree-rendering area of the detail pane — a single bad
// decoded value (unexpected shape the tree component can't handle) must
// never take down the request list or toolbar alongside it.
export class ErrorBoundaryFallback extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error) {
		// The panel page is inspectable via right-click -> Inspect, so this is
		// genuinely visible during dev, not a dead end.
		console.error("SerovalScope: failed to render decoded value", error);
	}

	render() {
		if (this.state.error) {
			return (
				<div style={{ color: "#b00", fontSize: 12 }}>
					Failed to render this value: {this.state.error.message}
				</div>
			);
		}
		return this.props.children;
	}
}
