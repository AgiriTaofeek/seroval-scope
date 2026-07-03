# Publishing checklist (not currently planned)

This project is distributed as open source — clone, build, load unpacked
(see the main [README](./README.md)). There's no Chrome Web Store listing
and no current plan for one, mainly because of the $5 one-time developer
registration fee.

The rest of this file is what was already researched and prepared in case
that changes later. It reflects the state of things as of when it was
written — re-verify anything permission/manifest-related against the actual
code before acting on it, since the extension will have moved on by then.

## Already done, still true today

- Custom icon (16/32/48/96/128px) — `public/icon/`, source at `design/icon.svg`
- Version bumped to `1.0.0`
- Real README, MIT LICENSE
- `PRIVACY.md` — hosted privacy policy content, ready to publish as-is
- The repo being public (per the open-source distribution model) already
  covers step 1 below and the support-URL question in step 5

## If you do decide to publish there later

### 1. Host `PRIVACY.md` somewhere with a public URL

Already satisfied once the repo is on GitHub — link the raw file
(`https://github.com/<you>/serovalscope/blob/main/PRIVACY.md`), or use
GitHub Pages if you want something that doesn't look like a raw file link.

### 2. Register as a Chrome Web Store developer

One-time $5 USD fee, at the [Chrome Web Store Developer
Dashboard](https://chrome.google.com/webstore/devconsole/) — an account/
payment action I can't do on your behalf.

### 3. Take a real screenshot

The listing requires at least one, 1280×800 or 640×400. Load the extension
(`pnpm build`, load unpacked), open it against a real TanStack Start app,
capture a request, and screenshot the panel with a real decoded payload
showing — that's the actual value proposition, more convincing than any
description text.

### 4. Fill out the submission form

When you upload the `.output/chrome-mv3` zip (`pnpm zip`), the **Privacy
practices** tab will ask a series of questions. Answers, given what this
extension actually does (verified against the real manifest and code, not
guessed):

| Question | Answer |
|---|---|
| Single purpose description | "Decodes TanStack Start server-function RPC traffic (seroval-encoded request/response bodies) into a readable format in a dedicated DevTools panel." |
| Permission justification: `storage` | "Persists the user's URL filter pattern and a UI toggle locally, so settings survive across DevTools sessions." |
| Permission justification: `devtools_page` | "Registers the extension's custom DevTools panel — the extension's only UI surface." |
| Does it collect user data? | Yes — declare **"Website content"** (it reads network request/response bodies of the inspected tab). Every other category (personally identifiable info, financial info, health info, location, etc.) — No, it doesn't specifically collect those *as a category*; it just displays whatever a given site's own traffic contains, same as DevTools' built-in Network tab already does. |
| Is data sold to third parties? | No |
| Is data used for purposes unrelated to the extension's core function? | No |
| Is data transferred to third parties? | No |
| Privacy policy URL | The hosted `PRIVACY.md` URL from step 1 |

### 5. Decide on a support/homepage URL

Already covered — the repo's GitHub Issues page.

### 6. Submit and wait for review

First-time review can take anywhere from a few days to a few weeks per
Chrome's own docs. Update reviews are typically faster.
