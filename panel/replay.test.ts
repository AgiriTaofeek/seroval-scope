import { describe, expect, test } from "vitest";

import { buildReplayExpression, replayUrl, runReplay } from "./replay.ts";

describe("replayUrl", () => {
	test("replaces an existing payload param", () => {
		expect(
			replayUrl("http://x/_serverFn/a?payload=old&z=1", "new"),
		).toBe("http://x/_serverFn/a?payload=new&z=1");
	});

	test("adds the param when absent, and removes it for a null payload", () => {
		expect(replayUrl("http://x/_serverFn/a", "p")).toBe(
			"http://x/_serverFn/a?payload=p",
		);
		expect(replayUrl("http://x/_serverFn/a?payload=p", null)).toBe(
			"http://x/_serverFn/a",
		);
	});
});

describe("buildReplayExpression", () => {
	test("GET: payload rides in the query string, no body", () => {
		const expr = buildReplayExpression({
			entry: {
				url: "http://x/_serverFn/a?payload=orig",
				method: "GET",
				requestContentType: null,
			},
			rawPayload: '{"t":0}',
		});
		expect(expr).toContain('payload=%7B%22t%22%3A0%7D');
		expect(expr).toContain('method: "GET"');
		expect(expr).toContain("body: undefined");
		expect(expr).toContain("x-tsr-serverFn");
	});

	test("POST: raw payload becomes the body with a content type", () => {
		const expr = buildReplayExpression({
			entry: {
				url: "http://x/_serverFn/a",
				method: "POST",
				requestContentType: "application/json",
			},
			rawPayload: '{"t":10}',
		});
		expect(expr).toContain('body: "{\\"t\\":10}"');
		expect(expr).toContain('"content-type":"application/json"');
	});

	test("is a self-contained async IIFE returning status/headers/body", () => {
		const expr = buildReplayExpression({
			entry: { url: "http://x/_serverFn/a", method: "POST", requestContentType: null },
			rawPayload: null,
		});
		expect(expr.startsWith("(async () => {")).toBe(true);
		expect(expr.trimEnd().endsWith("})()")).toBe(true);
		expect(expr).toContain("status: res.status");
	});
});

describe("runReplay", () => {
	test("resolves with a helpful error when the eval API is missing", async () => {
		const outcome = await runReplay({
			entry: { url: "http://x/_serverFn/a", method: "POST", requestContentType: null },
			rawPayload: null,
		});
		expect(outcome.ok).toBe(false);
		expect(outcome.error).toMatch(/inspectedWindow\.eval is unavailable/);
	});
});
