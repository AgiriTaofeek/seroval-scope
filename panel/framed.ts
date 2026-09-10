// Parser for TanStack Start's binary frame protocol, used for streaming /
// multiplexed server-function responses (Content-Type
// `application/x-tss-framed`). Mirrors the encoder in
// @tanstack/start-server-core's frame-protocol.ts and the reader in
// @tanstack/start-client-core's frame-decoder.ts, verified against both.
//
//   Frame = [type:1][streamId:4 BE][length:4 BE][payload:length]
//   type 0 JSON  — one NDJSON line (a seroval Cross node), streamId always 0
//   type 1 CHUNK — raw byte-stream data for streamId
//   type 2 END   — raw byte-stream EOF
//   type 3 ERROR — raw byte-stream error; payload is a UTF-8 message

export const FRAME_HEADER_SIZE = 9;

export const FrameType = {
	JSON: 0,
	CHUNK: 1,
	END: 2,
	ERROR: 3,
} as const;

export interface RawStreamSummary {
	streamId: number;
	/** Total CHUNK bytes seen for this stream. */
	bytes: number;
	/** True once an END frame arrived. */
	ended: boolean;
	/** Set from an ERROR frame's payload. */
	error?: string;
}

export interface ParsedFrames {
	/** Decoded NDJSON lines in wire order — the first is the root result. */
	jsonLines: string[];
	rawStreams: RawStreamSummary[];
}

/** True for the framed/multiplexed Content-Type, ignoring the `; v=` parameter. */
export function isFramedContentType(contentType: string | null): boolean {
	return !!contentType && contentType.startsWith("application/x-tss-framed");
}

export function base64ToBytes(b64: string): Uint8Array {
	// atob exists in the DevTools panel (a normal DOM window) and in jsdom;
	// the Buffer fallback keeps the Node test environment working.
	if (typeof atob === "function") {
		const binary = atob(b64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	}
	return new Uint8Array(Buffer.from(b64, "base64"));
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] << 24) |
			(bytes[offset + 1] << 16) |
			(bytes[offset + 2] << 8) |
			bytes[offset + 3]) >>>
		0
	);
}

/**
 * Walks every complete frame in `bytes`. Unknown frame types and a trailing
 * partial frame stop the walk without throwing — a debugging tool should show
 * whatever it could recover, not bail on the whole response.
 */
export function parseFrames(bytes: Uint8Array): ParsedFrames {
	const decoder = new TextDecoder();
	const jsonLines: string[] = [];
	const streams = new Map<number, RawStreamSummary>();

	const streamFor = (id: number): RawStreamSummary => {
		let s = streams.get(id);
		if (!s) {
			s = { streamId: id, bytes: 0, ended: false };
			streams.set(id, s);
		}
		return s;
	};

	let offset = 0;
	while (offset + FRAME_HEADER_SIZE <= bytes.length) {
		const type = bytes[offset];
		const streamId = readUint32BE(bytes, offset + 1);
		const length = readUint32BE(bytes, offset + 5);
		const payloadStart = offset + FRAME_HEADER_SIZE;
		const payloadEnd = payloadStart + length;
		if (payloadEnd > bytes.length) break; // trailing partial frame

		const payload = bytes.subarray(payloadStart, payloadEnd);
		switch (type) {
			case FrameType.JSON: {
				jsonLines.push(decoder.decode(payload).trim());
				break;
			}
			case FrameType.CHUNK: {
				streamFor(streamId).bytes += length;
				break;
			}
			case FrameType.END: {
				streamFor(streamId).ended = true;
				break;
			}
			case FrameType.ERROR: {
				streamFor(streamId).error = decoder.decode(payload);
				break;
			}
			default:
				return { jsonLines, rawStreams: [...streams.values()] };
		}
		offset = payloadEnd;
	}

	return { jsonLines, rawStreams: [...streams.values()] };
}
