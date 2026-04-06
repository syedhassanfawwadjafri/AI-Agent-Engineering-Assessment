import { isUUID, apiRequest } from '../../agent/shared/helpers';

describe('isUUID', () => {
  it('should accept valid v4 UUIDs', () => {
    expect(isUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    expect(isUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('should accept UUIDs in uppercase', () => {
    expect(isUUID('F47AC10B-58CC-4372-A567-0E02B2C3D479')).toBe(true);
  });

  it('should reject non-UUID strings', () => {
    expect(isUUID('ORD-1001')).toBe(false);
    expect(isUUID('not-a-uuid')).toBe(false);
    expect(isUUID('12345')).toBe(false);
    expect(isUUID('')).toBe(false);
  });

  it('should reject UUIDs with wrong segment lengths', () => {
    expect(isUUID('f47ac10b-58cc-4372-a567-0e02b2c3d47')).toBe(false);
    expect(isUUID('f47ac10b-58c-4372-a567-0e02b2c3d479')).toBe(false);
  });
});

describe('apiRequest', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('should make a GET request and return parsed JSON', async () => {
    const payload = { success: true, data: { id: '123' } };
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve(payload),
    });

    const result = await apiRequest('GET', '/api/test');

    expect(result).toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('should include JSON body for POST requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    await apiRequest('POST', '/api/test', { key: 'value' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      })
    );
  });

  it('should return NETWORK_ERROR when fetch throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

    const result = await apiRequest('GET', '/api/test');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NETWORK_ERROR');
    expect(result.error?.message).toContain('Connection refused');
  });

  it('should not include body for requests without payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    await apiRequest('GET', '/api/test');

    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(callArgs.body).toBeUndefined();
  });
});
