jest.mock('../../agent/runner', () => ({
  processMessage: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: () => 'test-session-id',
}));

import request from 'supertest';
import express from 'express';
import agentRouter from '../../agent/route';
import { processMessage } from '../../agent/runner';

const mockProcessMessage = processMessage as jest.MockedFunction<typeof processMessage>;

const app = express();
app.use(express.json());
app.use('/api/agent', agentRouter);

beforeEach(() => {
  mockProcessMessage.mockReset();
});

describe('POST /api/agent/chat', () => {
  it('should return agent response for a valid message', async () => {
    mockProcessMessage.mockResolvedValue('Order ORD-1001 is currently pending.');

    const res = await request(app)
      .post('/api/agent/chat')
      .send({ message: 'What is the status of ORD-1001?' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.response).toBe('Order ORD-1001 is currently pending.');
    expect(res.body.data.sessionId).toBeDefined();
  });

  it('should forward the sessionId when provided', async () => {
    mockProcessMessage.mockResolvedValue('Done.');

    await request(app)
      .post('/api/agent/chat')
      .send({ message: 'hello', sessionId: 'existing-session' });

    expect(mockProcessMessage).toHaveBeenCalledWith('existing-session', 'hello');
  });

  it('should generate a sessionId when none is provided', async () => {
    mockProcessMessage.mockResolvedValue('Hi!');

    const res = await request(app)
      .post('/api/agent/chat')
      .send({ message: 'hello' });

    expect(res.body.data.sessionId).toBe('test-session-id');
    expect(mockProcessMessage).toHaveBeenCalledWith('test-session-id', 'hello');
  });

  it('should reject empty message', async () => {
    const res = await request(app)
      .post('/api/agent/chat')
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject missing message field', async () => {
    const res = await request(app)
      .post('/api/agent/chat')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject non-string message', async () => {
    const res = await request(app)
      .post('/api/agent/chat')
      .send({ message: 42 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject whitespace-only message', async () => {
    const res = await request(app)
      .post('/api/agent/chat')
      .send({ message: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should trim leading/trailing whitespace from message', async () => {
    mockProcessMessage.mockResolvedValue('response');

    await request(app)
      .post('/api/agent/chat')
      .send({ message: '  hello world  ' });

    expect(mockProcessMessage).toHaveBeenCalledWith('test-session-id', 'hello world');
  });

  it('should return 500 when processMessage throws', async () => {
    mockProcessMessage.mockRejectedValue(new Error('LLM timeout'));

    const res = await request(app)
      .post('/api/agent/chat')
      .send({ message: 'test' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AGENT_ERROR');
  });
});
