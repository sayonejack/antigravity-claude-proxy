# Worktree Change Summary

Date: 2026-03-28
Repository: `~/github/antigravity-claude-proxy`

## What was restored

### Explicit `max_tokens` pass-through

The API now reliably preserves explicitly supplied `max_tokens` values instead of treating falsy values as "not provided".

Updated file:

- `~/github/antigravity-claude-proxy/src/format/request-converter.js`

Behavior:

- `max_tokens` is forwarded to Google/Cloud Code when it is explicitly present.
- The Claude thinking fallback default (`64000`) is only applied when the client omitted `max_tokens`.
- This keeps API callers in control while still protecting Claude thinking requests that provide no token limit at all.

## High-level change themes

1. Added OpenAI-compatible `/v1/chat/completions` support, including streaming.
2. Added temporary Claude-to-Gemini rerouting when Claude capacity is exhausted for a long period.
3. Moved Claude CLI config handling into project-local config with proxy mode as the default.
4. Added a WebUI chat playground with a model selector, send button, and local conversation list.
5. Improved dashboard usage visibility by separating local proxy request counts from inferred official quota/tier metadata.
6. Added a configurable "local API port override" so local OpenAI/Anthropic endpoints can follow the current site port by default.
7. Refactored server logic so OpenAI compatibility and usage summary code live in helper modules instead of expanding `src/server.js` indefinitely.

## How to use this project from OpenClaw

This project can be used as a local model gateway for OpenClaw.

### 1. Start the proxy

Run:

```bash
cd ~/github/antigravity-claude-proxy
./run.sh
```

Default listener:

- `http://127.0.0.1:8787`

Supported local endpoints:

- Anthropic-compatible: `POST /v1/messages`
- OpenAI-compatible: `POST /v1/chat/completions`
- Model listing: `GET /v1/models`

### 2. Point OpenClaw at the local proxy

There are two practical ways to connect OpenClaw:

#### Option A: Anthropic-compatible route

Use the local proxy as an Anthropic-style endpoint:

- Base URL: `http://127.0.0.1:8787`
- Messages endpoint: `http://127.0.0.1:8787/v1/messages`

If OpenClaw asks for an Anthropic API key:

- leave it empty when the proxy API key is disabled, or
- provide the same local API key only if this proxy instance has `apiKey` enabled in config

This route is the closest fit when OpenClaw expects Anthropic Messages API behavior.

#### Option B: OpenAI-compatible route

Use the local proxy as an OpenAI-style endpoint:

- Base URL: `http://127.0.0.1:8787`
- Chat Completions endpoint: `http://127.0.0.1:8787/v1/chat/completions`

This route is useful when OpenClaw or a related adapter expects OpenAI-compatible chat completions.

### 3. Model naming

OpenClaw should send model IDs that this proxy can resolve through Cloud Code / Antigravity, for example:

- `claude-sonnet-4-6`
- `claude-opus-4-6-thinking`
- `gemini-3-flash`
- `gemini-3.1-pro-low`
- `gemini-3.1-pro-high`

Use `GET /v1/models` against the local proxy to confirm the currently available model list.

### 4. Important runtime behavior

- If Claude capacity is exhausted across all local accounts for long enough, the proxy can temporarily reroute Claude requests to Gemini fallbacks for 5 hours.
- OpenAI-compatible streaming is supported.
- Explicit `max_tokens` values are preserved.
- If no `max_tokens` is provided for Claude thinking models, the proxy supplies a safe default (`64000`) to satisfy Cloud Code constraints.
- API key is optional unless this proxy instance explicitly enables one in config.

### 5. Recommended OpenClaw usage pattern

For local development and webchat use:

1. Start this proxy on `8787`
2. Configure OpenClaw to use `http://127.0.0.1:8787`
3. Prefer Anthropic-compatible routing when OpenClaw is speaking Anthropic Messages natively
4. Prefer OpenAI-compatible routing when OpenClaw is speaking Chat Completions or when an OpenAI adapter is already in use
5. Use `/v1/models` to verify model IDs before switching OpenClaw defaults

## File-by-file summary

### Config and startup

- `~/github/antigravity-claude-proxy/config.example.json`
  Added `temporaryClaudeToGeminiSwitch` defaults and explanatory comment.

- `~/github/antigravity-claude-proxy/src/config.js`
  Added `localApiPortOverride`, temporary Claude-to-Gemini switch config, and helpers for effective local API port/base URL.

- `~/github/antigravity-claude-proxy/src/index.js`
  Startup banner now advertises `POST /v1/chat/completions` and shows API key as optional.

- `~/github/antigravity-claude-proxy/run.sh`
  Added a foreground startup script for local use on port `8787` with setup logging and first-run `npm install`.

- `~/github/antigravity-claude-proxy/package-lock.json`
  Updated lockfile from dependency install/update during local setup.

### Core API and routing

- `~/github/antigravity-claude-proxy/src/server.js`
  Added shared request handling for Anthropic and OpenAI routes, added `/v1/chat/completions`, added OpenAI streaming support, unified error helpers, and added `usageSummary` to `/account-limits`.

- `~/github/antigravity-claude-proxy/src/utils/openai-compat.js`
  New helper module containing OpenAI request conversion, OpenAI response conversion, and OpenAI-compatible SSE chunk streaming.

- `~/github/antigravity-claude-proxy/src/utils/usage-summary.js`
  New helper module for aggregating usage history and inferred quota/tier summary data.

### Cloud Code / model behavior

- `~/github/antigravity-claude-proxy/src/cloudcode/message-handler.js`
  Added temporary Claude-to-Gemini reroute activation for non-streaming requests when Claude capacity is exhausted.

- `~/github/antigravity-claude-proxy/src/cloudcode/streaming-handler.js`
  Added the same temporary Claude-to-Gemini reroute logic for streaming requests.

- `~/github/antigravity-claude-proxy/src/cloudcode/model-api.js`
  Expanded subscription tier detection to return tier source, tier signals, project metadata, and inferred official usage limits.

- `~/github/antigravity-claude-proxy/src/temporary-model-switcher.js`
  New in-memory 5-hour switch manager for temporarily routing exhausted Claude models to Gemini fallbacks.

- `~/github/antigravity-claude-proxy/src/format/request-converter.js`
  Adjusted Claude thinking handling so default `max_tokens` is only injected when omitted, kept safe default at `64000`, and restored explicit `max_tokens` pass-through behavior.

- `~/github/antigravity-claude-proxy/src/constants.js`
  Default Claude preset auth token is now empty instead of placeholder text.

### Usage tracking and dashboard

- `~/github/antigravity-claude-proxy/src/modules/usage-stats.js`
  Usage tracking now includes WebUI playground requests via `/api/chat/send`.

- `~/github/antigravity-claude-proxy/public/js/data-store.js`
  Added `usageSummary` and `usageHistoryLoaded` state so the dashboard can distinguish "loaded but empty" from "still loading".

- `~/github/antigravity-claude-proxy/public/js/components/dashboard.js`
  Dashboard now consumes `usageSummary`, handles empty history cleanly, and updates trend UI from loaded state instead of assuming missing data is still syncing.

- `~/github/antigravity-claude-proxy/public/views/dashboard.html`
  Added daily cap, RPM cap, tier-signal, tier-mix, and local-tracking scope display; added a proper empty state when no local proxy request history exists yet.

### WebUI settings and Claude config

- `~/github/antigravity-claude-proxy/src/utils/claude-config.js`
  Claude CLI config now defaults to the project-local `.claude/settings.json`; default proxy config is generated from current server settings.

- `~/github/antigravity-claude-proxy/src/webui/index.js`
  Added runtime config info, optional local API port override handling, default proxy-mode restore logic, and `/api/chat/send` backend for the chat playground.

- `~/github/antigravity-claude-proxy/public/js/components/claude-config.js`
  Claude settings UI now follows the current site port by default, uses project-local config path text, and preserves manually edited base URL/auth token when switching presets.

- `~/github/antigravity-claude-proxy/public/js/components/server-config.js`
  Added UI/controller logic for optional local API port override and displaying the effective local API port.

- `~/github/antigravity-claude-proxy/public/views/settings.html`
  Added local API port override controls; updated Claude proxy placeholders to follow the active port and show that the API key is optional.

### WebUI chat playground

- `~/github/antigravity-claude-proxy/public/app.js`
  Registered the new `chatPlayground` Alpine component.

- `~/github/antigravity-claude-proxy/public/index.html`
  Added a Chat tab and loaded the new chat component script.

- `~/github/antigravity-claude-proxy/public/js/store.js`
  Added `chat` to valid top-level tabs.

- `~/github/antigravity-claude-proxy/public/js/components/chat-playground.js`
  New chat playground component with model normalization, session list, send/clear actions, and rendering for text, thinking, tool_use, and tool_result blocks.

- `~/github/antigravity-claude-proxy/public/views/chat.html`
  New chat UI with conversation list, model selector, request settings, and send button.

- `~/github/antigravity-claude-proxy/public/css/style.css`
  Rebuilt/updated frontend stylesheet to support the new chat and dashboard/settings UI changes.

### Translations

- `~/github/antigravity-claude-proxy/public/js/translations/en.js`
  Added strings for Chat tab, optional API key messaging, local API port override, and usage summary labels.

- `~/github/antigravity-claude-proxy/public/js/translations/zh.js`
  Added the matching Chinese strings for the same UI areas.

### Tests

- `~/github/antigravity-claude-proxy/tests/run-all.cjs`
  Registered the temporary Claude-to-Gemini switch test.

- `~/github/antigravity-claude-proxy/tests/test-temporary-model-switcher.cjs`
  New test coverage for activation, routing, expiry, and ignore behavior of the temporary switcher.

## Notable compatibility fixes already included in this worktree

- OpenAI streaming chunks now reuse a single completion ID per response.
- OpenAI responses now report the actual routed model instead of always echoing the requested model.
- OpenAI streaming now forwards tool-call deltas instead of only finish reasons.
- WebUI chat no longer hides non-text assistant output as an empty response.
- Claude thinking requests without explicit `max_tokens` now default to a valid upper bound (`64000`) instead of failing with Cloud Code `INVALID_ARGUMENT`.

## Current shape of the worktree

Tracked modified files:

- 26 tracked files modified in `git diff`
- 656 insertions, 216 deletions

Untracked additions currently present:

- `~/github/antigravity-claude-proxy/public/js/components/chat-playground.js`
- `~/github/antigravity-claude-proxy/public/views/chat.html`
- `~/github/antigravity-claude-proxy/run.sh`
- `~/github/antigravity-claude-proxy/src/temporary-model-switcher.js`
- `~/github/antigravity-claude-proxy/src/utils/openai-compat.js`
- `~/github/antigravity-claude-proxy/src/utils/usage-summary.js`
- `~/github/antigravity-claude-proxy/tests/test-temporary-model-switcher.cjs`

## Suggested next cleanup steps

1. Extract Anthropic SSE forwarding from `src/server.js` into a helper, matching the OpenAI stream refactor.
2. Add a small integration test for `/v1/chat/completions` stream mode and routed-model reporting.
3. Persist temporary Claude-to-Gemini switch state if process restarts should keep the 5-hour window.
4. Consider persisting chat playground sessions in browser storage if the UI should survive refreshes.
