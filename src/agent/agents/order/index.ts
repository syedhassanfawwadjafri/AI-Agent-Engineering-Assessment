/**
 * Order sub-agent — self-contained module that exports a factory
 * for creating the order management LlmAgent with its tools.
 */

import { orderToolConfigs } from './tools';
import { ORDER_AGENT_PROMPT } from './instructions';
import { importModule } from '../../shared/helpers';

export async function createOrderAgent(model: any) {
  const { LlmAgent, FunctionTool } = await importModule('@google/adk');

  const tools = orderToolConfigs.map((c) => new FunctionTool(c));

  return new LlmAgent({
    name: 'order_agent',
    description:
      'Specialist for order management — lookups by order number or ID, ' +
      'status transitions, and cancellations.',
    model,
    instruction: ORDER_AGENT_PROMPT,
    tools,
  });
}
