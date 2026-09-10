// The DevTools panel renders inside whatever theme the user set for DevTools
// itself. `chrome.devtools.panels.themeName` is "default" (light) or "dark";
// it's fixed for the life of the panel window. We fall back to the OS
// preference when the API isn't present (tests, a stray load outside DevTools).

export type ThemeName = "light" | "dark";

export interface ThemeTokens {
	name: ThemeName;
	bg: string;
	surface: string;
	fg: string;
	muted: string;
	border: string;
	borderSubtle: string;
	rowSelected: string;
	accent: string;
	link: string;
	rawBg: string;
	toastBg: string;
	toastFg: string;
	ok: string;
	error: string;
	warn: string;
	redirect: string;
}

export const LIGHT: ThemeTokens = {
	name: "light",
	bg: "#ffffff",
	surface: "#f6f6f6",
	fg: "#202124",
	muted: "#5f6368",
	border: "#d0d0d0",
	borderSubtle: "#e8e8e8",
	rowSelected: "#e8f0fe",
	accent: "#1a73e8",
	link: "#1a0dab",
	rawBg: "#f5f5f5",
	toastBg: "#333333",
	toastFg: "#ffffff",
	ok: "#188038",
	error: "#c5221f",
	warn: "#b06000",
	redirect: "#8430ce",
};

export const DARK: ThemeTokens = {
	name: "dark",
	bg: "#1f1f1f",
	surface: "#282828",
	fg: "#e8eaed",
	muted: "#9aa0a6",
	border: "#3c4043",
	borderSubtle: "#2d2d2d",
	rowSelected: "#28384e",
	accent: "#8ab4f8",
	link: "#8ab4f8",
	rawBg: "#2a2a2a",
	toastBg: "#e8eaed",
	toastFg: "#202124",
	ok: "#81c995",
	error: "#f28b82",
	warn: "#fdd663",
	redirect: "#d7aefb",
};

export function tokensFor(name: ThemeName): ThemeTokens {
	return name === "dark" ? DARK : LIGHT;
}

/** Resolves the effective theme from the DevTools API, else the OS preference. */
export function resolveThemeName(
	panelThemeName?: string,
	prefersDark = false,
): ThemeName {
	if (panelThemeName === "dark") return "dark";
	if (panelThemeName === "default" || panelThemeName === "light") return "light";
	return prefersDark ? "dark" : "light";
}

export function detectTheme(): ThemeTokens {
	let panelThemeName: string | undefined;
	let prefersDark = false;
	try {
		panelThemeName = (
			globalThis as { chrome?: { devtools?: { panels?: { themeName?: string } } } }
		).chrome?.devtools?.panels?.themeName;
	} catch {
		// not in a DevTools context
	}
	try {
		prefersDark =
			typeof matchMedia === "function" &&
			matchMedia("(prefers-color-scheme: dark)").matches;
	} catch {
		// matchMedia unavailable
	}
	return tokensFor(resolveThemeName(panelThemeName, prefersDark));
}
