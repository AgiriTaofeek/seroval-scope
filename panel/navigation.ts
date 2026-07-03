/**
 * Wires chrome.devtools.network.onNavigated so callers can clear captured
 * entries on page navigation, matching the real Network tab's default
 * behavior. Never throws out of the listener, mirroring capture.ts's
 * startCapture. Returns an unsubscribe function.
 */
export function startNavigationClear(onNavigate: () => void): () => void {
	const listener = () => {
		try {
			onNavigate();
		} catch {
			// A misbehaving callback must not break future navigation events.
		}
	};

	chrome.devtools.network.onNavigated.addListener(listener);
	return () => chrome.devtools.network.onNavigated.removeListener(listener);
}
