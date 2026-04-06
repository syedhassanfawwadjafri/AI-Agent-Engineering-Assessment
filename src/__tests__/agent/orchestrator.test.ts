/**
 * Tests for the multi-agent orchestrator — verifies that the root agent,
 * sub-agents, and their tools are wired together correctly.
 * All ADK classes are mocked; these tests validate configuration, not LLM behavior.
 */

class MockFunctionTool {
  config: any;
  constructor(config: any) {
    this.config = config;
  }
}

class MockLlmAgent {
  opts: any;
  constructor(opts: any) {
    this.opts = opts;
  }
}

jest.mock('../../agent/shared/helpers', () => ({
  ...jest.requireActual('../../agent/shared/helpers'),
  importModule: jest.fn().mockImplementation((mod: string) => {
    if (mod === '@google/adk') {
      return Promise.resolve({
        LlmAgent: MockLlmAgent,
        FunctionTool: MockFunctionTool,
      });
    }
    if (mod === 'adk-llm-bridge') {
      return Promise.resolve({
        Custom: jest.fn().mockReturnValue({ id: 'mock-model' }),
      });
    }
    return Promise.resolve({});
  }),
}));

import { createOrderAgent } from '../../agent/agents/order';
import { createProductAgent } from '../../agent/agents/product';
import { ROOT_AGENT_PROMPT } from '../../agent/instructions';
import { ORDER_AGENT_PROMPT } from '../../agent/agents/order/instructions';
import { PRODUCT_AGENT_PROMPT } from '../../agent/agents/product/instructions';
import { orderToolConfigs } from '../../agent/agents/order/tools';
import { productToolConfigs } from '../../agent/agents/product/tools';

const mockModel = { id: 'test-model' };

describe('Order sub-agent configuration', () => {
  it('should be named order_agent', async () => {
    const agent = (await createOrderAgent(mockModel)) as any;
    expect(agent.opts.name).toBe('order_agent');
  });

  it('should use the ORDER_AGENT_PROMPT as instruction', async () => {
    const agent = (await createOrderAgent(mockModel)) as any;
    expect(agent.opts.instruction).toBe(ORDER_AGENT_PROMPT);
  });

  it('should register all three order tools', async () => {
    const agent = (await createOrderAgent(mockModel)) as any;
    const toolNames = agent.opts.tools.map((t: any) => t.config.name);

    expect(toolNames).toContain('get_order');
    expect(toolNames).toContain('update_order_status');
    expect(toolNames).toContain('cancel_order');
    expect(agent.opts.tools).toHaveLength(orderToolConfigs.length);
  });

  it('should pass the model to the agent', async () => {
    const agent = (await createOrderAgent(mockModel)) as any;
    expect(agent.opts.model).toBe(mockModel);
  });
});

describe('Product sub-agent configuration', () => {
  it('should be named product_agent', async () => {
    const agent = (await createProductAgent(mockModel)) as any;
    expect(agent.opts.name).toBe('product_agent');
  });

  it('should use the PRODUCT_AGENT_PROMPT as instruction', async () => {
    const agent = (await createProductAgent(mockModel)) as any;
    expect(agent.opts.instruction).toBe(PRODUCT_AGENT_PROMPT);
  });

  it('should register all three product tools', async () => {
    const agent = (await createProductAgent(mockModel)) as any;
    const toolNames = agent.opts.tools.map((t: any) => t.config.name);

    expect(toolNames).toContain('get_product');
    expect(toolNames).toContain('update_product');
    expect(toolNames).toContain('update_product_price');
    expect(agent.opts.tools).toHaveLength(productToolConfigs.length);
  });

  it('should pass the model to the agent', async () => {
    const agent = (await createProductAgent(mockModel)) as any;
    expect(agent.opts.model).toBe(mockModel);
  });
});

describe('Root orchestrator configuration', () => {
  let resetAgentCache: () => void;

  beforeEach(async () => {
    const mod = await import('../../agent/index');
    resetAgentCache = () => {
      (mod as any).createAgent.__cachedAgent = null;
    };
  });

  it('should reference routing rules in the root prompt', () => {
    expect(ROOT_AGENT_PROMPT).toContain('order_agent');
    expect(ROOT_AGENT_PROMPT).toContain('product_agent');
    expect(ROOT_AGENT_PROMPT).toContain('transfer to order_agent');
  });

  it('should instruct the root agent to ask for clarification on ambiguous requests', () => {
    expect(ROOT_AGENT_PROMPT).toContain('ambiguous');
    expect(ROOT_AGENT_PROMPT).toContain('clarify');
  });

  it('should instruct the root agent to handle greetings directly', () => {
    expect(ROOT_AGENT_PROMPT).toContain('greetings');
    expect(ROOT_AGENT_PROMPT).toContain('respond directly');
  });

  it('should have no tools on the root agent (delegation only)', async () => {
    const { createAgent } = await import('../../agent/index');
    const agent = (await createAgent()) as any;

    expect(agent.opts.tools).toEqual([]);
  });

  it('should register both sub-agents on the root', async () => {
    const { createAgent } = await import('../../agent/index');
    const agent = (await createAgent()) as any;
    const subNames = agent.opts.subAgents.map((s: any) => s.opts.name);

    expect(subNames).toContain('order_agent');
    expect(subNames).toContain('product_agent');
    expect(agent.opts.subAgents).toHaveLength(2);
  });

  it('should name the root agent root_agent', async () => {
    const { createAgent } = await import('../../agent/index');
    const agent = (await createAgent()) as any;

    expect(agent.opts.name).toBe('root_agent');
  });
});
