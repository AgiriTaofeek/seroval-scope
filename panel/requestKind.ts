import { decodeDevFunctionId } from "./functionName.ts";

// A captured request is usually a `createServerFn` RPC call, but if the user
// widens the URL pattern the panel also sees TanStack Start's other
// server-round-trips: SSR route-data / loader payloads (same seroval Cross
// format, decoded identically) and unrelated fetches. Labelling them keeps a
// mixed list readable.

export type RequestKind = "server-fn" | "route-data" | "other";

const ROUTE_DATA_MARKERS = [
	"_data=", // legacy / some Start versions
	"__data",
	"?tsr-", // router internal query prefixes
	"/__root",
];

export function classifyRequest(url: string): RequestKind {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return "other";
	}

	const segments = parsed.pathname.split("/").filter(Boolean);
	const last = segments[segments.length - 1];
	if (
		parsed.pathname.includes("/_serverFn/") ||
		(last && decodeDevFunctionId(last) !== null)
	) {
		return "server-fn";
	}

	const haystack = parsed.pathname + parsed.search;
	if (ROUTE_DATA_MARKERS.some((m) => haystack.includes(m))) {
		return "route-data";
	}

	return "other";
}

export function requestKindLabel(kind: RequestKind): string {
	return kind === "server-fn" ? "fn" : kind === "route-data" ? "data" : "—";
}
