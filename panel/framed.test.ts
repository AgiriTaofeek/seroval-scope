import { describe, expect, test } from "vitest";

import {
	base64ToBytes,
	FRAME_HEADER_SIZE,
	FrameType,
	isFramedContentType,
	parseFrames,
} from "./framed.ts";

// Mirrors @tanstack/start-server-core's encodeFrame — used to build fixtures.
function encodeFrame(type: number, streamId: number, payload: Uint8Array): Uint8Array {
	const f = new Uint8Array(FRAME_HEADER_SIZE + payload.length);
	f[0] = type;
	f[1] = (streamId >>> 24) & 0xff;
	f[2] = (streamId >>> 16) & 0xff;
	f[3] = (streamId >>> 8) & 0xff;
	f[4] = streamId & 0xff;
	f[5] = (payload.length >>> 24) & 0xff;
	f[6] = (payload.length >>> 16) & 0xff;
	f[7] = (payload.length >>> 8) & 0xff;
	f[8] = payload.length & 0xff;
	f.set(payload, FRAME_HEADER_SIZE);
	return f;
}

function concat(...parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

const enc = new TextEncoder();
const json = (obj: unknown) => encodeFrame(FrameType.JSON, 0, enc.encode(`${JSON.stringify(obj)}\n`));

describe("isFramedContentType", () => {
	test("matches the framed type with and without the version parameter", () => {
		expect(isFramedContentType("application/x-tss-framed")).toBe(true);
		expect(isFramedContentType("application/x-tss-framed; v=1")).toBe(true);
	});

	test("rejects plain JSON and null", () => {
		expect(isFramedContentType("application/json")).toBe(false);
		expect(isFramedContentType(null)).toBe(false);
	});
});

describe("base64ToBytes", () => {
	test("round-trips arbitrary bytes", () => {
		const bytes = new Uint8Array([0, 1, 2, 254, 255, 10, 13]);
		const b64 = Buffer.from(bytes).toString("base64");
		expect([...base64ToBytes(b64)]).toEqual([...bytes]);
	});
});

describe("parseFrames", () => {
	test("collects JSON frames in wire order", () => {
		const bytes = concat(json({ t: 10, i: 0 }), json({ t: 23, i: 6 }));
		const { jsonLines, rawStreams } = parseFrames(bytes);
		expect(jsonLines).toEqual(['{"t":10,"i":0}', '{"t":23,"i":6}']);
		expect(rawStreams).toEqual([]);
	});

	test("summarizes raw streams by id: byte count, end, and error", () => {
		const bytes = concat(
			json({ t: 10, i: 0 }),
			encodeFrame(FrameType.CHUNK, 3, new Uint8Array(5)),
			encodeFrame(FrameType.CHUNK, 3, new Uint8Array(7)),
			encodeFrame(FrameType.END, 3, new Uint8Array(0)),
			encodeFrame(FrameType.ERROR, 4, enc.encode("stream blew up")),
		);
		const { rawStreams } = parseFrames(bytes);
		expect(rawStreams).toContainEqual({
			streamId: 3,
			bytes: 12,
			ended: true,
		});
		expect(rawStreams).toContainEqual({
			streamId: 4,
			bytes: 0,
			ended: false,
			error: "stream blew up",
		});
	});

	test("stops cleanly at a trailing partial frame instead of throwing", () => {
		const bytes = concat(json({ ok: 1 }), new Uint8Array([0, 0, 0]));
		const { jsonLines } = parseFrames(bytes);
		expect(jsonLines).toEqual(['{"ok":1}']);
	});

	test("stops at an unknown frame type, keeping what came before", () => {
		const bytes = concat(json({ ok: 1 }), encodeFrame(9, 0, new Uint8Array(2)));
		expect(parseFrames(bytes).jsonLines).toEqual(['{"ok":1}']);
	});

	test("handles an empty buffer", () => {
		expect(parseFrames(new Uint8Array(0))).toEqual({ jsonLines: [], rawStreams: [] });
	});
});
