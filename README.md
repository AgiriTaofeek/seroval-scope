# SerovalScope

A Chrome DevTools panel that decodes [TanStack Start](https://tanstack.com/start) server-function RPC traffic.

TanStack Start's `createServerFn` calls travel over `/_serverFn/*` requests, with
both the request payload and response body encoded in [seroval](https://github.com/lxsmnsyc/seroval)'s
wire format — a compact, tag-based structure that's unreadable in the Network
tab as-is:

```json
{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[...]}}
```

SerovalScope adds a **SerovalScope** tab to DevTools that captures matching
requests live, decodes them with the real `seroval` package, and shows the
actual value — pretty-printed, searchable, and toggleable back to the raw
wire format when you need it.

This is a free, open-source developer tool — not published to the Chrome Web
Store. Clone it, build it, load it unpacked. See [Install](#install) below.

## Why not just look at the Network tab?

Chrome doesn't expose an API to inject UI into the native Network panel's
per-request inspector — only a handful of specific panels (Elements, Sources)
support that. A separate DevTools panel is the closest real equivalent, and
it does more than the Network tab could anyway: searching *decoded* content
(not just URLs), and telling GET-call query-string payloads and POST bodies
apart automatically.

## Install

There's no Chrome Web Store listing — this is meant to be built from source
and loaded as an unpacked extension:

1. `git clone <this repo>` and `cd` into it
2. `pnpm install`
3. `pnpm build`
4. Open `chrome://extensions`, enable **Developer mode** (top right), click **Load unpacked**, and select the `.output/chrome-mv3` directory that step 3 created.
5. Open DevTools on a TanStack Start app, **before** navigating to a page that fires server functions (the capture API only sees requests started after the Network panel has been opened in that session — reload once DevTools is open if you missed some).
6. Open the **SerovalScope** tab.

Chrome will show a warning on unpacked extensions and disable them on
browser restart unless Developer mode stays on — that's expected for a
locally-loaded, unpublished extension, not a sign anything's wrong.

**Updating:** `git pull`, `pnpm build` again, then click the refresh icon on
the extension's card at `chrome://extensions` (no need to remove and
re-add it).

For active development instead of a one-off build, use `pnpm dev` — WXT
launches a dedicated Chrome profile with the extension pre-loaded and
hot-reloads the panel on save.

## Using it

- **URL pattern** (top left) filters which requests get captured. Defaults to
  `_serverFn/`, matching TanStack Start's RPC route prefix — edit it if a
  project uses something different. Persisted across sessions.
- **Search** filters the list by *decoded* content, not just the URL —
  useful for finding a specific value buried in a response without opening
  every row.
- **Method / Status filters** narrow the list further.
- Click a row to see its **Request** and **Response** sections, each with a
  **Decoded / Raw** toggle and a **Copy** button (copies the decoded JS
  value, not the wire-format text).
- **Pause** stops capturing without losing what's already there; **Clear**
  empties the list. **Clear on navigate** (checkbox) auto-clears whenever the
  inspected page navigates, useful for isolating one page load's traffic.
- If a payload can't be fully decoded (an unrecognized custom seroval
  plugin type, or a response that isn't seroval-encoded at all — e.g. a
  `notFound()` response, or a raw pass-through `Response`), the panel falls
  back to showing the raw parsed JSON with an explanation, instead of
  erroring out.

## How it works, briefly

- Response bodies are seroval's "Cross" mode (`toCrossJSONStream` /
  `toCrossJSONAsync` server-side) — decoded here with `fromCrossJSON`.
- Request payloads (`?payload=` on GET, or the POST body) are seroval's
  "tree/JSON" mode — decoded with `fromJSON`. These are genuinely different
  envelope shapes; mixing them up silently produces garbage.
- Whether a response actually went through seroval is read from the real
  `x-tss-serialized: true` response header TanStack Start sets, not guessed
  from content.
- Everything happens locally, synchronously, in the panel page — no
  background script, no message passing. The panel persists for the life of
  the DevTools window, so capture state just lives in its own React state.

See `panel/deserialize.ts` for the exact decode logic and its test fixtures
for real captured payloads.

## Development

```bash
pnpm install
pnpm test       # vitest, all pure logic — no browser needed
pnpm compile    # tsc --noEmit
pnpm dev        # WXT dev mode, auto-launches Chrome with the extension loaded
pnpm build      # production build -> .output/chrome-mv3
```

## Privacy

Everything is processed locally in your browser. Nothing is transmitted
anywhere — no analytics, no telemetry, no external requests of any kind. See
[PRIVACY.md](./PRIVACY.md) for the full policy.

## Scope

Chrome-only for now (built with [WXT](https://wxt.dev), which keeps a
Firefox port cheap if it's ever needed — see `pnpm dev:firefox` /
`pnpm build:firefox`, untested). Streaming/multiplexed server-function
responses aren't decoded yet — only ordinary JSON-returning calls, which
covers the overwhelming majority of real traffic.

Not on the Chrome Web Store, and no current plan to publish there — see
[PUBLISHING.md](./PUBLISHING.md) if that ever changes; it's a from-scratch
checklist, not something kept up to date in the meantime.

## Contributing

Issues and PRs welcome — it's a small enough codebase that
`panel/deserialize.ts` and its tests are the right place to start reading.

## License

MIT — see [LICENSE](./LICENSE).
