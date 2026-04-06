# ADR-002: Frontend Chat Widget Implementation

**Date:** 2026-04-06

## Context

The admin dashboard (`/admin`) needs an embedded chatbot UI for natural-language interaction with the backend agent. The existing frontend is built with:

- Plain HTML (`admin.html`)
- Vanilla JavaScript (`admin.js`)
- Plain CSS (`admin.css`)

The chatbot must integrate into this page without disrupting the existing admin functionality.

---

## Decision

**Vanilla JavaScript chat widget** served as static files (`chat.js`, `chat.css`), communicating with the agent via `POST /api/agent/chat` using the Fetch API, with in-memory session tracking (JavaScript variable).

---

## Options Considered

### 1. UI Implementation Approach

| Option | Description |
|---|---|
| **A. Vercel AI SDK UI (`ai/react`)** | React-based chat components with streaming support |
| **B. Third-party chat library (e.g., Chatbot UI, BotUI)** | Pre-built chat widget with theming |
| **C. Vanilla JS widget** ✅ | Custom-built with plain JS/CSS, no dependencies |

**Selected: C — Vanilla JS widget**

- **Why not A:** Requires React, ReactDOM, and a build pipeline (JSX transpilation, bundling). The existing admin page has zero framework dependencies — introducing React for a single widget adds ~140 kB gzipped, a bundler configuration, and an inconsistent tech stack. The AI SDK's streaming helpers also assume a Vercel-compatible streaming endpoint, which the ADK runner does not natively produce.
- **Why not B:** Third-party chat libraries impose their own DOM structure, styling conventions, and event systems. Customising them to match the existing admin theme requires fighting the library's opinions. Adds a dependency for a component that is straightforward to build (~150 lines of JS).
- **Why C:** Consistent with the existing stack (plain HTML/JS/CSS). Zero added dependencies. Full control over styling to match the admin colour scheme. No build step required — the file is loaded via a `<script>` tag.

### 2. Communication Protocol

| Option | Description |
|---|---|
| **A. WebSocket** | Persistent bidirectional connection for real-time streaming |
| **B. Server-Sent Events (SSE)** | Server-push streaming over HTTP |
| **C. REST POST with JSON** ✅ | Standard request/response per message |

**Selected: C — REST POST**

- **Why not A:** The ADK `InMemoryRunner.runAsync()` collects the full response before returning. WebSocket infrastructure (upgrade handling, reconnection, heartbeats) adds complexity with no streaming benefit for the current backend.
- **Why not B:** Same limitation — the backend does not produce incremental tokens. SSE would send a single event per request, making it functionally identical to REST but with more complex client-side handling and connection management.
- **Why C:** Matches the existing API conventions (`POST` returning `{ success, data }`). Simple to implement, test, and debug. If streaming is added later, migration to SSE requires changing only the fetch call and response parsing.

### 3. Session Persistence (Client-Side)

| Option | Description |
|---|---|
| **A. In-memory variable** ✅ | Session lives in a JS closure; lost on page reload |
| **B. `sessionStorage`** | Session survives reloads within the browser tab |
| **C. `localStorage`** | Session survives across tabs and browser restarts |

**Selected: A — In-memory variable**

- **Why not B:** Adds complexity with no real benefit — if the page is reloaded, the chat message history (DOM-only) is already lost, so preserving only the `sessionId` creates a confusing UX where the backend remembers context but the UI shows a blank chat.
- **Why not C:** Backend sessions are in-memory and lost on server restart. Persisting a stale `sessionId` in `localStorage` would silently create a broken session reference after a server restart, with no obvious error to the user.
- **Why A:** Simplest approach. The `sessionId` is stored in a closure variable inside the chat IIFE. It persists across messages within a single page visit, enabling multi-turn conversations. On reload/navigation, both the UI and the session reference reset cleanly — no stale-state edge cases.

### 4. Widget Layout

| Option | Description |
|---|---|
| **A. Inline panel** | Chat embedded as a section in the admin page flow |
| **B. Floating overlay** ✅ | Toggle button (bottom-right) expanding into a chat panel |

**Selected: B — Floating overlay**

- **Why not A:** Pushes existing admin content (orders table, product list) down or aside, disrupting the primary admin workflow. The admin may want to reference the dashboard while chatting.
- **Why B:** Non-intrusive — the admin can view orders/products and chat simultaneously. The toggle button occupies minimal screen space when collapsed. This is a widely understood UX pattern for support/assistant chat.

---

## Consequences

**Positive:**
- Zero new dependencies — no bundler, no framework, no library.
- Fully consistent with existing frontend conventions.
- Chat widget is self-contained in two files (`chat.js`, `chat.css`), easy to remove or replace.
- In-memory session tracking is the simplest approach and avoids stale-state issues.

**Negative:**
- No streaming — the user sees a loading indicator until the full response arrives.
- No markdown rendering in agent responses (plain text only).

**Risks:**
- Long agent responses (>10 s on slower hardware) may feel unresponsive. Mitigated by a visible typing indicator.
