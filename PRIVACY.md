# Privacy Policy — SerovalScope

_Last updated: 2026-07-03_

SerovalScope is a Chrome DevTools extension that decodes TanStack Start
server-function RPC traffic for debugging purposes. This document describes,
completely, what data it accesses and what it does with it.

## What it accesses

While its DevTools panel is open, SerovalScope reads the URL, method, status
code, headers, and request/response body content of network requests made by
the **currently inspected browser tab** — and only requests whose URL
matches the filter pattern you configure (`_serverFn/` by default). This is
provided by Chrome's `devtools.network` API, scoped to the tab DevTools is
attached to.

If the page you're inspecting sends real data through a matching request —
customer records, account details, anything — that data is what gets
decoded and displayed in the panel. This is unavoidable and is the entire
point of the tool: it's a debugging aid for developers inspecting their own
application's traffic.

## What it stores

Two small settings, via Chrome's local extension storage (`chrome.storage`,
the `storage` permission), stored **only on your device**:

- the URL filter pattern (text you type into the panel's filter box)
- the "clear on navigate" toggle state

Neither ever leaves your machine.

## What it does NOT do

- **No network requests of its own.** SerovalScope makes zero requests to
  any server, anywhere — no analytics, no telemetry, no crash reporting, no
  update-check pings beyond what Chrome itself does for the extension
  package.
- **No `host_permissions`.** The manifest requests no broad access to any
  website — only the two Chrome-provided extension surfaces above.
- **No data leaves your browser.** Captured requests, decoded values, and
  settings are held in the panel's own in-memory state and local storage.
  Nothing is synced, uploaded, sold, or shared with any third party,
  including the developer of this extension.
- **No user tracking, profiling, or advertising use of any kind.**

## Source

The full source is available for inspection — every claim above is directly
verifiable by reading the code, not just this document.

## Changes to this policy

If this policy changes, the date above will be updated and the change will
be described in the project's changelog/commit history.

## Contact

Questions about this policy or the extension's data handling can be raised
via the project's issue tracker.
