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
wire format when you need it. It also classifies each call's real outcome
(success / thrown error / `redirect()` / `notFound()`), decodes streaming and
form-data calls, times each request, and can replay one with an edited
payload. See [Using it](#using-it).

This is a free, open-source developer tool — not published to the Chrome Web
Store. Clone it, build it, load it unpacked. See [Install](#install) below.

## Why not just look at the Network tab?

Chrome doesn't expose an API to inject UI into the native Network panel's
per-request inspector — only a handful of specific panels (Elements, Sources)
support that. A separate DevTools panel is the closest real equivalent, and
it does more than the Network tab could anyway: searching *decoded* content
(not just URLs), showing the *real* outcome when the HTTP status hides it
(a 200 carrying a thrown error or a redirect), resolving streamed responses,
grouping repeated calls, diffing two responses, and replaying a call.

One thing no browser tool can do: show the request your server function makes
to your backend API. That happens on the server and never reaches the
browser. SerovalScope can display it — full request/response bodies and
headers, not just timing — only if the server reports it on a response
header; there's a drop-in middleware for that in
[`examples/`](./examples/serovalscope-middleware.ts), which works against a
deployed app, not just `pnpm dev`. Read that file's top comment before
wiring it up: it's always on by design (so it works in production), which
means the report header it sets is visible to anyone who can see a response
from the app at all — not just this extension.

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

### The request list

- **URL pattern** (top left) filters which requests get captured. Defaults to
  `_serverFn/`, matching TanStack Start's RPC route prefix — edit it if a
  project uses something different. Persisted across sessions.
- **Search** filters the list by *decoded* content, not just the URL. Three
  modes (dropdown next to the box): **Text** (substring), **Regex** (a JS
  regexp against decoded content — a bad pattern is flagged, not thrown), and
  **Key path** (`user.email=ada` matches rows where that key's value contains
  `ada`; arrays are traversed element-wise).
- **Method / Status filters** narrow the list further.
- **Result** column shows the real outcome — `OK` / `ERROR` / `REDIRECT` /
  `NOT FOUND` / `RAW` — decoded from the body, not just the HTTP status. A
  `⚠` on the badge means the status was 2xx but the payload says otherwise
  (TanStack Start routinely returns 200 with an error or redirect inside).
- **Time** column is the request's total wall time, from the HAR timing.
- A `fn` / `data` tag next to the method marks non-`_serverFn` captures — SSR
  route-data / loader round-trips vs. server-function RPC — when you widen the
  URL pattern to catch them (they decode the same way).
- The list is virtualized past ~150 rows, so a long capture session stays
  responsive.
- **Follow** auto-selects the newest row; **Group** collapses repeated calls
  to the same server function into one row with a count and aggregate
  size/time.
- **Pause** stops capturing without losing what's already there; **Clear**
  empties the list. **Clear on navigate** auto-clears on navigation.
- Arrow keys move the selection when the list has focus.

### The detail pane

- **Request** and **Response** sections, each with a **Decoded / Raw** toggle
  and **Copy** (copies the decoded value, envelope-unwrapped — for a normal
  call that's the actual return value, not the `{ result, error, context }`
  wrapper).
- An **outcome banner** for anything that isn't a plain success — the error
  message, the redirect target, the `notFound()` payload. TanStack Start only
  transports an error's `message` (no stack, no custom fields), and the
  banner says so rather than showing a misleading local stack.
- **Streaming / multiplexed responses** (`application/x-tss-framed`) are
  decoded: the binary frame protocol is unwrapped, every seroval chunk is
  applied, and deferred values resolve to their final form in the tree
  (marked *streamed*). Raw byte-streams are summarized, not inlined.
- **Form-data** requests (`multipart/form-data`, `x-www-form-urlencoded`) are
  parsed into a field table, and the reserved `__TSS_CONTEXT` field is
  decoded as its own seroval payload.
- **Backend calls** — the server-to-backend request a server function makes
  is *not visible to DevTools*. This section shows it only if the server
  reports it, via an `x-serovalscope-upstream` header (see
  [`examples/serovalscope-middleware.ts`](./examples/serovalscope-middleware.ts))
  or a standard `Server-Timing` header (metadata only — no bodies). The
  method and full absolute URL are always shown up front; when the report
  included them, click a call to expand its request/response headers
  (secret-shaped ones arrive pre-redacted as `[redacted]`) and bodies
  (pretty-printed when they're JSON). A `⚠ truncated` badge means the
  server's report had to shorten or drop something to stay under the
  header's size budget.
- **Timing** — a per-phase breakdown (waiting/TTFB, download, …).
- **Copy as** — the call as `myServerFn({ … })`, a `curl` of the raw RPC
  request, or a TypeScript type inferred from the decoded request/response.
- **Replay…** — re-issue the call from the inspected page (with its cookies),
  optionally editing the raw wire payload first. Or copy the `fetch(...)`
  expression to run in the console.
- **Diff vs. another call** — structural diff of this response against
  another capture of the same function.
- **Open source** (dev only) — jump to the server function's definition in
  the Sources panel.

### Settings

- **Theme** — follows the DevTools theme by default; can be forced.
- **Export / Import session** — save every captured row to a JSON file and
  load it back later (or hand it to someone else); decoding happens on their
  side from the same bytes.
- **Production function-id manifest** — production RPC ids are a one-way
  `sha256(file--export)` hash, so the panel can't name them on its own. Paste
  a `{ "<hash>": { "file": "...", "exportName": "..." } }` map (built at deploy
  time) and prod calls get named like dev ones.
- **Custom serialization-adapter labels** — a payload that uses one of your
  app's own `serializationAdapters` decodes automatically to the adapter's
  *serializable form* (the plain data it round-trips through), wrapped in a
  `{ __serovalscopeAdapter, value }` marker — no more falling back to raw JSON
  for the whole response. This box just lets you give each adapter key a
  friendlier label.

If a payload still can't be decoded (a body that isn't seroval at all), the
panel falls back to the raw parsed JSON with an explanation instead of
erroring out.

## How it works, briefly

- Response bodies are seroval's "Cross" mode (`toCrossJSONAsync` for a normal
  call; `toCrossJSONStream` wrapped in a binary frame protocol for a
  streaming one) — decoded here with `fromCrossJSON`, one call per frame with
  a shared refs map, exactly as `@tanstack/start-client-core` does.
- Request payloads (`?payload=` on GET, or the POST body) are seroval's
  "tree/JSON" mode — decoded with `fromJSON`. These are genuinely different
  envelope shapes; mixing them up silently produces garbage.
- Whether a response went through seroval is read from the real
  `x-tss-serialized: true` header; framed vs. plain from the `Content-Type`;
  raw pass-throughs from `x-tss-raw`. Nothing is guessed from content.
- The outcome classifier (`panel/responseOutcome.ts`) reads both the status
  and the decoded `{ result, error, context }` envelope to tell success,
  thrown error, `notFound()` and `redirect()` apart.
- Custom `serializationAdapters` appear on the wire as `$TSR/t/<key>` plugin
  nodes. The panel discovers those tags in a payload and registers a tolerant
  deserialize-only plugin per tag (`panel/customAdapters.ts`) that stops at
  `ctx.deserialize(node.v)` — the serializable form — instead of running the
  app's `fromSerializable`, which it can't.
- Everything happens locally in the panel page — no background script, no
  message passing, no network of its own. Streamed responses' deferred values
  are the one async step, resolved in the detail pane after the sync decode.

The wire-format details above were read straight from
`@tanstack/start-server-core` / `-client-core`; the test fixtures are real
captured payloads (and, for the framed case, output from TanStack Start's own
encoder). `panel/deserialize.ts`, `panel/framed.ts`, and
`panel/responseOutcome.ts` are the core.

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
`pnpm build:firefox`, untested).

Known gaps: a value behind a still-pending streamed promise isn't included in
search-text (the detail pane resolves it, the filter doesn't); a custom
serialization adapter decodes to its serializable form, not the app's own
class instance (which is what you want for inspection anyway); `Replay… →
Send` needs DevTools to await the page's returned promise — if your Chrome
doesn't, use *Copy fetch expression* and run it in the console.

Not on the Chrome Web Store, and no current plan to publish there — see
[PUBLISHING.md](./PUBLISHING.md) if that ever changes; it's a from-scratch
checklist, not something kept up to date in the meantime.

## Contributing

Issues and PRs welcome. Nearly all the logic is pure and lives in `panel/*.ts`
with a co-located `*.test.ts`; `panel/deserialize.ts`, `panel/framed.ts` and
`panel/responseOutcome.ts` are the right place to start reading. The React in
`entrypoints/panel/` and `panel/components/` is a thin shell over those.

## License

MIT — see [LICENSE](./LICENSE).
