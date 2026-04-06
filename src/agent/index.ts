/**
 * Multi-agent orchestrator — root agent delegates to domain-specific sub-agents.
 *
 * Architecture:
 *   rootAgent (orchestrator)
 *     ├── orderAgent  — order lookup, status updates, cancellation
 *     └── productAgent — product lookup, updates, price changes
 */

import { ROOT_AGENT_PROMPT } from './instructions';
import { AGENT_CONFIG } from './config';
import { importModule } from './shared/helpers';
import { createOrderAgent } from './agents/order';
import { createProductAgent } from './agents/product';

let cachedAgent: any = null;

export async function createAgent() {
  if (cachedAgent) return cachedAgent;

  const { LlmAgent } = await importModule('@google/adk');
  const { Custom } = await importModule('adk-llm-bridge');

  const model = Custom(AGENT_CONFIG.ollamaModel, {
    baseURL: AGENT_CONFIG.ollamaBaseUrl,
  });

  const orderAgent = await createOrderAgent(model);
  const productAgent = await createProductAgent(model);

  cachedAgent = new LlmAgent({
    name: 'root_agent',
    description:
      'Orchestrator that routes admin requests to the appropriate specialist agent.',
    model,
    instruction: ROOT_AGENT_PROMPT,
    subAgents: [orderAgent, productAgent],
    tools: [],
  });

  return cachedAgent;
}
