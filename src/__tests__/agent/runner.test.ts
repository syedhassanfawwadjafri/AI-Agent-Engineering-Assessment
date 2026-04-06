/**
 * Integration tests for the agent runner — validates session lifecycle,
 * response extraction from ADK events, and error propagation.
 * All ADK and LLM dependencies are fully mocked.
 */

const mockCreateSession = jest.fn();
const mockRunAsync = jest.fn();
const mockCreateAgent = jest.fn();

jest.mock('../../agent/index', () => ({
  createAgent: (...args: any[]) => mockCreateAgent(...args),
}));

jest.mock('../../agent/shared/helpers', () => ({
  ...jest.requireActual('../../agent/shared/helpers'),
  importModule: jest.fn().mockResolvedValue({
    InMemoryRunner: jest.fn().mockImplementation(() => ({
      sessionService: { createSession: mockCreateSession },
      runAsync: mockRunAsync,
    })),
  }),
}));

import { processMessage } from '../../agent/runner';

function makeAsyncIterable(events: any[]) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: () =>
          i < events.length
            ? Promise.resolve({ value: events[i++], done: false })
            : Promise.resolve({ value: undefined, done: true }),
      };
    },
  };
}

beforeEach(() => {
  mockCreateAgent.mockResolvedValue({ name: 'root_agent' });
  mockCreateSession.mockResolvedValue({ id: 'adk-session-1' });
  mockRunAsync.mockReset();
});

describe('processMessage', () => {
  it('should create a new session on first message and return response text', async () => {
    mockRunAsync.mockReturnValue(
      makeAsyncIterable([
        { content: { parts: [{ text: 'Order ORD-1001 is pending.' }] } },
      ])
    );

    const result = await processMessage('client-session-1', 'Check ORD-1001');

    expect(result).toBe('Order ORD-1001 is pending.');
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin' })
    );
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin',
        sessionId: 'adk-session-1',
        newMessage: { role: 'user', parts: [{ text: 'Check ORD-1001' }] },
      })
    );
  });

  it('should reuse existing session on subsequent messages', async () => {
    mockRunAsync.mockReturnValue(
      makeAsyncIterable([{ content: { parts: [{ text: 'First reply' }] } }])
    );

    await processMessage('client-session-1', 'first message');

    mockRunAsync.mockReturnValue(
      makeAsyncIterable([{ content: { parts: [{ text: 'Second reply' }] } }])
    );

    const result = await processMessage('client-session-1', 'second message');

    expect(result).toBe('Second reply');
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('should concatenate text from multiple event parts', async () => {
    mockRunAsync.mockReturnValue(
      makeAsyncIterable([
        { content: { parts: [{ text: 'Part one. ' }] } },
        { content: { parts: [{ text: 'Part two.' }] } },
      ])
    );

    const result = await processMessage('multi-part-session', 'hello');

    expect(result).toBe('Part one. Part two.');
  });

  it('should skip events without content or text parts', async () => {
    mockRunAsync.mockReturnValue(
      makeAsyncIterable([
        { content: null },
        { content: { parts: [] } },
        { content: { parts: [{ functionCall: { name: 'get_order' } }] } },
        { content: { parts: [{ text: 'Final answer.' }] } },
      ])
    );

    const result = await processMessage('skip-events-session', 'test');

    expect(result).toBe('Final answer.');
  });

  it('should return fallback message when no text is produced', async () => {
    mockRunAsync.mockReturnValue(
      makeAsyncIterable([{ content: { parts: [{ functionCall: {} }] } }])
    );

    const result = await processMessage('empty-session', 'test');

    expect(result).toBe('I was unable to process your request. Please try again.');
  });

  it('should return fallback when event stream is empty', async () => {
    mockRunAsync.mockReturnValue(makeAsyncIterable([]));

    const result = await processMessage('no-events-session', 'test');

    expect(result).toBe('I was unable to process your request. Please try again.');
  });
});
