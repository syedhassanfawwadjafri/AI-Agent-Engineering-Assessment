/**
 * Product sub-agent — self-contained module that exports a factory
 * for creating the product management LlmAgent with its tools.
 */

import { productToolConfigs } from './tools';
import { PRODUCT_AGENT_PROMPT } from './instructions';
import { importModule } from '../../shared/helpers';

export async function createProductAgent(model: any) {
  const { LlmAgent, FunctionTool } = await importModule('@google/adk');

  const tools = productToolConfigs.map((c) => new FunctionTool(c));

  return new LlmAgent({
    name: 'product_agent',
    description:
      'Specialist for product catalog management — lookups by ID or name, ' +
      'field updates (name, description, status), and price changes.',
    model,
    instruction: PRODUCT_AGENT_PROMPT,
    tools,
  });
}
