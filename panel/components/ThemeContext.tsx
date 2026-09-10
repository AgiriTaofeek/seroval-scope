import { createContext, useContext, type ReactNode } from "react";

import { LIGHT, type ThemeTokens } from "../theme.ts";

const ThemeContext = createContext<ThemeTokens>(LIGHT);

export function ThemeProvider({
	tokens,
	children,
}: {
	tokens: ThemeTokens;
	children: ReactNode;
}) {
	return (
		<ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeTokens {
	return useContext(ThemeContext);
}
