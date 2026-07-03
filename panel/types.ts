export interface DecodeSuccess {
	ok: true;
	value: unknown;
	/** The parsed-but-not-fromJSON/fromCrossJSON'd structure, for the Raw view. */
	rawParsed: unknown;
}

export interface DecodeFailure {
	ok: false;
	error: string;
	/** The raw string that failed to decode, shown verbatim in the Raw view. */
	rawText: string;
}

export type DecodeResult = DecodeSuccess | DecodeFailure;

export interface CapturedEntry {
	id: string;
	url: string;
	method: string;
	status: number;
	time: number;
	/** Raw ?payload= (GET) or POST body text, before any decoding. Null if absent. */
	requestRaw: string | null;
	/** Raw response body text, before any decoding. */
	responseRaw: string;
	/** Whether the response carried the x-tss-serialized: true header. */
	isSerialized: boolean;
	/** True for multipart/form-data or x-www-form-urlencoded requests, which aren't decoded in v1. */
	isFormData: boolean;
}
