# ADR-003: Agent Testing Strategy

**Date:** 2026-04-06

## Context

The agent system comprises multiple layers — a root orchestrator, domain-specific sub-agents (order, product) with their tools, a session-managing runner, shared helpers, and an HTTP route handler. Each layer has different external dependencies (REST API, ADK runtime, LLM provider). The testing strategy must:

- Validate core logic (validation rules, state transitions, orchestrator wiring) without requiring a running LLM or backend server
- Cover error paths and edge cases at every layer
- Keep tests fast, deterministic, and independent of external services
- Prioritise meaningful behavior coverage over exhaustive line coverage

---

## Decision

**Layered test strategy** with three tiers, all external dependencies mocked at the appropriate boundary. Tests live in `src/__tests__/agent/` and run via the existing Jest + ts-jest setup.

---

## Options Considered

### 1. What to Mock

| Option | Description |
|---|---|
| **A. Mock at `fetch` level** | Replace `global.fetch`; tools run against fake HTTP responses |
| **B. Mock at `apiRequest` level** ✅ | Replace the `apiRequest` helper; tools never touch `fetch` |
| **C. Run against live server** | Start the Express server in tests; tools call real endpoints |

**Selected: B — Mock at `apiRequest` level** (with A for `apiRequest`'s own tests)

- **Why not A for tool tests:** Tools call `apiRequest`, not `fetch` directly. Mocking `fetch` for tool tests would be testing through an unnecessary layer and coupling tests to `apiRequest` internals (URL construction, headers, JSON parsing).
- **Why not C:** Requires a running server, database seeding, and port management. Slower, flaky, and violates "mock external dependencies." Appropriate for true E2E tests but not for unit/integration tests of agent logic.
- **Why B:** `apiRequest` is the clean boundary between agent logic and the backend API. Mocking it allows testing tool behavior (validation, state transitions, response formatting, error handling) in isolation. The `apiRequest` function itself is separately tested with a mocked `global.fetch`.

### 2. How to Test the Runner

| Option | Description |
|---|---|
| **A. Skip runner tests** | Only test tools and route; runner is thin glue code |
| **B. Mock ADK at module level** ✅ | Replace `importModule` and `createAgent`; test session lifecycle and response extraction |
| **C. Use real ADK with a stub LLM** | Instantiate real `InMemoryRunner` with a no-op model |

**Selected: B — Mock ADK at module level**

- **Why not A:** The runner contains meaningful logic — session creation/reuse, multi-event text concatenation, fallback responses, error propagation. Skipping it leaves a critical integration gap.
- **Why not C:** Requires the `@google/adk` ESM module to load in Jest's CommonJS environment, which conflicts with the project's module system. Also couples tests to ADK internals that may change across versions.
- **Why B:** Tests the runner's actual logic (session map management, async iterator consumption, text assembly) without depending on ADK's runtime. Mock boundaries are clearly defined: `importModule` returns a fake `InMemoryRunner`, `createAgent` returns a stub agent.

### 3. Test Organization

| Option | Description |
|---|---|
| **A. Single test file** | All agent tests in one `agent.test.ts` |
| **B. Per-layer files** ✅ | Separate files for helpers, order tools, product tools, runner, route |

**Selected: B — Per-layer files**

- **Why not A:** A single file with 60+ tests becomes hard to navigate, and different layers require different mock setups. Isolating mocks per file prevents leakage between test suites.
- **Why B:** Each file has its own `jest.mock()` declarations and fixtures tailored to its layer. Easy to run a subset (`--testPathPattern=order-tools`). Mirrors the modular source structure.

---

## Test Coverage Summary

| Suite | File | Tests | Layer | What's Tested |
|---|---|---|---|---|
| Helpers | `helpers.test.ts` | 8 | Unit | `isUUID` validation, `apiRequest` fetch wrapping and error handling |
| Order tools | `order-tools.test.ts` | 26 | Unit | Status transition matrix, `get_order` (UUID vs order number routing), `update_order_status` (valid/invalid transitions, terminal states, API failures), `cancel_order` (terminal rejection, reason passthrough) |
| Product tools | `product-tools.test.ts` | 17 | Unit | `get_product` (UUID lookup, name search, URL encoding), `update_product` (multi-field, no-field validation), `update_product_price` (negative price, no variants, default fallback, API failures) |
| Orchestrator | `orchestrator.test.ts` | 15 | Unit | Root agent wiring (name, sub-agents, no direct tools, prompt routing rules), order sub-agent config (name, prompt, 3 tools), product sub-agent config (name, prompt, 3 tools) |
| Runner | `runner.test.ts` | 6 | Integration | Session creation/reuse, multi-event text concatenation, non-text event filtering, empty stream fallback |
| Route | `route.test.ts` | 9 | Integration | Input validation (empty, missing, non-string, whitespace), session ID generation/forwarding, error propagation (500 on runner failure) |

**Total: 81 tests across 6 suites**

---

## Consequences

**Positive:**
- All external dependencies (LLM, REST API, ADK runtime) are mocked — tests run in < 4 seconds with no network, no server, no Ollama.
- Layered mocking strategy makes each test suite focused and independent.
- Tests cover the critical paths: validation logic, state transitions, error propagation, session lifecycle, and API contract.

**Negative:**
- No end-to-end tests that verify the full LLM → agent → tool → API → response pipeline. This is intentional — E2E tests with a real LLM are non-deterministic and slow.
- Mock fidelity risk: if `apiRequest` or ADK signatures change, mocks may silently diverge. Mitigated by testing `apiRequest` itself against `global.fetch` and by keeping mocks minimal.

**Trade-off:**
- Favored meaningful behavior coverage (validation rules, error paths, session lifecycle) over exhaustive line coverage, per the assessment guidance.
