# ADR-001: Backend Agent Architecture

**Date:** 2026-04-06
**Status:** Accepted
**Deciders:** Engineering team

## Context

The system requires a backend AI agent service that interprets natural-language admin requests and executes order/product management actions via the existing Express REST API. Key constraints:

- **Framework:** Google ADK for TypeScript (required)
- **LLM:** Ollama with a local model (configurable via `OLLAMA_MODEL` env var)
- **Existing stack:** Express 4.x, TypeScript with CommonJS module output, JSON file storage
- **Time budget:** 4–6 hours total (backend + frontend + tests + docs)
- **ADK-JS limitation:** The TypeScript ADK has no native Ollama/LiteLLM support (only the Python ADK does), requiring `adk-llm-bridge` as a connector

Decisions are needed on agent topology, inter-agent communication protocol, LLM model choice, API integration strategy, ESM/CJS module compatibility, and session management.

---

## Decision

**Multi-agent orchestrator** with a root agent delegating to domain-specific sub-agents (`order_agent`, `product_agent`), using ADK's native `transfer_to_agent` mechanism. Each sub-agent is a self-contained module (`agents/<domain>/`) with its own instructions, tools, and factory function. Configurable Ollama model, HTTP-based API integration, in-memory sessions. ESM-only ADK packages loaded from the CommonJS codebase via a native `import()` wrapper.

---

## Options Considered

### 1. Agent Topology

| Option | Description |
|---|---|
| **A. Single flat agent** | One `LlmAgent` with all tools in a single list |
| **B. Multi-agent orchestrator** ✅ | Root orchestrator delegating to specialised sub-agents (orders, products) via ADK's `transfer_to_agent` |
| **C. Structured single agent** | One `LlmAgent` with tools logically grouped into modules but registered on a single agent |

**Selected: B — Multi-agent Orchestrator**

- **Why not A:** Tool definitions become an unorganised blob; harder to maintain, test, and scale.
- **Why not C:** While sufficient for six tools today, it does not exercise ADK's multi-agent capabilities and would require a larger refactor when the tool count grows.
- **Why B:** Each sub-agent has a focused instruction scoped to its domain, improving tool-call accuracy. Each sub-agent lives in its own module (`agents/<domain>/`) with a co-located factory, prompt, and tool definitions — adding a new domain (e.g., promotions, inventory) means creating a new folder and registering it in the root orchestrator, with zero changes to existing agents. ADK natively supports this via `subAgents` and the auto-injected `transfer_to_agent` tool — no custom routing logic needed. This is intentionally forward-looking: the current scope of six tools does not strictly require multi-agent, but the pattern is trivial to maintain and demonstrates scalability.

### 2. Inter-Agent Communication Protocol

| Option | Description |
|---|---|
| **A. ADK native sub-agents** ✅ | Sub-agents registered via `subAgents` array; ADK handles routing with `transfer_to_agent` tool |
| **B. Model Context Protocol (MCP)** | Sub-agents exposed as MCP tool servers; root agent discovers and calls them via MCP |
| **C. Agent-to-Agent (A2A) protocol** | Sub-agents run as independent A2A-compliant services; root agent communicates via HTTP/JSON-RPC |

**Selected: A — ADK native sub-agents**

- **Why not MCP:** MCP is designed for connecting LLMs to external data sources and tool servers — it solves the problem of tool discovery and invocation across process boundaries. In our case, all agents run in the same process and share the same model. Using MCP would add a network protocol layer (stdio/SSE transport, JSON-RPC framing) between agents that are already in-memory, introducing unnecessary latency and complexity. MCP is the right choice when agents need to discover tools at runtime from external services, which is not our use case.
- **Why not A2A:** A2A (Agent-to-Agent) is designed for inter-organisation or inter-service agent communication — agents running on different hosts, potentially built by different teams, with different capabilities advertised via Agent Cards. Our agents are tightly coupled by design (they share a model, a session, and a codebase). A2A would force each sub-agent into its own HTTP server with JSON-RPC endpoints, adding infrastructure overhead (multiple ports, health checks, service discovery) for zero benefit. A2A makes sense in a federated multi-service architecture, not in a single-process prototype.
- **Why A:** All agents share the same process, model instance, and session state. ADK's `subAgents` array + `transfer_to_agent` tool provides delegation with no additional infrastructure. The orchestrator pattern is explicit in code, easy to test, and easy to explain.

### 3. LLM Model

| Option | Description |
|---|---|
| **A. Small model (< 4B params)** | Fastest inference, lowest quality |
| **B. Medium model (3B–14B)** ✅ | Balanced speed and tool-calling accuracy |
| **C. Large model (> 14B)** | Best quality, slowest inference |

**Selected: B — Medium-sized model, configurable**

The model is set via the `OLLAMA_MODEL` environment variable (default: `llama3.2:latest`). This allows swapping to any Ollama-hosted model without code changes.



---

## Consequences

**Positive:**
- Sub-agents have focused instructions, improving tool-call accuracy per domain.
- Modular file structure (`agents/<domain>/`) keeps each sub-agent's prompt, tools, and factory co-located — easy to navigate, test, and own independently.
- Adding a new domain (promotions, inventory) requires creating a new `agents/<domain>/` folder and one import line in the root orchestrator — no changes to existing agents.
- Model is configurable without code changes.

**Negative:**
- Multi-agent routing adds one extra LLM inference hop (root agent decides which sub-agent to call), increasing latency per request.
- Over-engineered for the current six-tool scope — a single agent would suffice.
- Sessions are lost on server restart.

**Risks:**
- If the local model is too small, it may struggle with reliable `transfer_to_agent` routing, falling back to answering directly instead of delegating. Mitigated by using a model with proven tool-calling capability and clear sub-agent descriptions.
- If Ollama is not running, the agent endpoint returns a 500. Mitigated by clear error messaging and setup documentation.
