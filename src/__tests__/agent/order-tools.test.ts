jest.mock('../../agent/shared/helpers', () => ({
  ...jest.requireActual('../../agent/shared/helpers'),
  apiRequest: jest.fn(),
}));

import { apiRequest } from '../../agent/shared/helpers';
import {
  isValidTransition,
  getAllowedTransitions,
  getOrderConfig,
  updateOrderStatusConfig,
  cancelOrderConfig,
} from '../../agent/agents/order/tools';

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const SAMPLE_ORDER = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  orderNumber: 'ORD-1001',
  status: 'pending',
  paymentStatus: 'paid',
  fulfillmentStatus: 'unfulfilled',
  customerEmail: 'test@example.com',
  lineItems: [
    { name: 'Widget', quantity: 2, unitPrice: 25.0, totalPrice: 50.0 },
  ],
  subtotal: 50.0,
  shippingTotal: 5.0,
  taxTotal: 4.0,
  grandTotal: 59.0,
  createdAt: '2025-01-01T00:00:00Z',
};

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('Order status transition validation', () => {
  it('should allow valid transitions from pending', () => {
    expect(isValidTransition('pending', 'confirmed')).toBe(true);
    expect(isValidTransition('pending', 'processing')).toBe(true);
    expect(isValidTransition('pending', 'cancelled')).toBe(true);
  });

  it('should reject invalid transitions', () => {
    expect(isValidTransition('pending', 'shipped')).toBe(false);
    expect(isValidTransition('pending', 'delivered')).toBe(false);
    expect(isValidTransition('pending', 'completed')).toBe(false);
  });

  it('should block all transitions from terminal states', () => {
    expect(isValidTransition('cancelled', 'pending')).toBe(false);
    expect(isValidTransition('refunded', 'pending')).toBe(false);
    expect(isValidTransition('partially_refunded', 'pending')).toBe(false);
  });

  it('should handle unknown statuses gracefully', () => {
    expect(isValidTransition('nonexistent', 'pending')).toBe(false);
  });

  it('should return correct allowed transitions', () => {
    expect(getAllowedTransitions('pending')).toEqual(
      expect.arrayContaining(['confirmed', 'processing', 'cancelled'])
    );
    expect(getAllowedTransitions('cancelled')).toEqual([]);
  });

  it('should return empty array for unknown status', () => {
    expect(getAllowedTransitions('unknown')).toEqual([]);
  });
});

describe('get_order tool', () => {
  it('should return formatted order on success', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: SAMPLE_ORDER });

    const result = await getOrderConfig.execute({ orderIdentifier: 'ORD-1001' }) as any;

    expect(result.status).toBe('success');
    expect(result.order).toBeDefined();
    expect(result.order.orderNumber).toBe('ORD-1001');
    expect(result.order.grandTotal).toBe(59.0);
    expect(mockApiRequest).toHaveBeenCalledWith('GET', '/api/orders/number/ORD-1001');
  });

  it('should use UUID path when given a UUID', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: SAMPLE_ORDER });

    await getOrderConfig.execute({
      orderIdentifier: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/orders/a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
  });

  it('should return error when order is not found', async () => {
    mockApiRequest.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Order not found' },
    });

    const result = await getOrderConfig.execute({ orderIdentifier: 'ORD-9999' });

    expect(result.status).toBe('error');
    expect(result.message).toContain('not found');
  });
});

describe('update_order_status tool', () => {
  it('should update status when transition is valid', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_ORDER })
      .mockResolvedValueOnce({ success: true, data: { ...SAMPLE_ORDER, status: 'confirmed' } });

    const result = await updateOrderStatusConfig.execute({
      orderIdentifier: 'ORD-1001',
      newStatus: 'confirmed',
    }) as any;

    expect(result.status).toBe('success');
    expect(result.message).toContain("'pending' to 'confirmed'");
    expect(result.order.previousStatus).toBe('pending');
    expect(result.order.newStatus).toBe('confirmed');
  });

  it('should reject invalid status transition', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: SAMPLE_ORDER });

    const result = await updateOrderStatusConfig.execute({
      orderIdentifier: 'ORD-1001',
      newStatus: 'delivered',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('Cannot transition');
    expect(result.message).toContain('Valid transitions');
  });

  it('should include reason in API call when provided', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_ORDER })
      .mockResolvedValueOnce({ success: true, data: {} });

    await updateOrderStatusConfig.execute({
      orderIdentifier: 'ORD-1001',
      newStatus: 'confirmed',
      reason: 'Payment verified',
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'POST',
      `/api/orders/${SAMPLE_ORDER.id}/status`,
      { status: 'confirmed', reason: 'Payment verified' }
    );
  });

  it('should return error when order lookup fails', async () => {
    mockApiRequest.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Order not found' },
    });

    const result = await updateOrderStatusConfig.execute({
      orderIdentifier: 'ORD-9999',
      newStatus: 'confirmed',
    });

    expect(result.status).toBe('error');
  });

  it('should report terminal state with no valid transitions', async () => {
    const cancelledOrder = { ...SAMPLE_ORDER, status: 'cancelled' };
    mockApiRequest.mockResolvedValue({ success: true, data: cancelledOrder });

    const result = await updateOrderStatusConfig.execute({
      orderIdentifier: 'ORD-1001',
      newStatus: 'pending',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('terminal state');
  });
});

describe('cancel_order tool', () => {
  it('should cancel a non-terminal order', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_ORDER })
      .mockResolvedValueOnce({ success: true, data: { ...SAMPLE_ORDER, status: 'cancelled' } });

    const result = await cancelOrderConfig.execute({ orderIdentifier: 'ORD-1001' }) as any;

    expect(result.status).toBe('success');
    expect(result.message).toContain('cancelled');
    expect(result.order.previousStatus).toBe('pending');
    expect(result.order.newStatus).toBe('cancelled');
  });

  it('should include reason in cancellation message', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_ORDER })
      .mockResolvedValueOnce({ success: true, data: {} });

    const result = await cancelOrderConfig.execute({
      orderIdentifier: 'ORD-1001',
      reason: 'Customer request',
    });

    expect(result.status).toBe('success');
    expect(result.message).toContain('Customer request');
  });

  it('should refuse to cancel an already cancelled order', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { ...SAMPLE_ORDER, status: 'cancelled' },
    });

    const result = await cancelOrderConfig.execute({ orderIdentifier: 'ORD-1001' });

    expect(result.status).toBe('error');
    expect(result.message).toContain('terminal state');
  });

  it('should refuse to cancel a completed order', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { ...SAMPLE_ORDER, status: 'completed' },
    });

    const result = await cancelOrderConfig.execute({ orderIdentifier: 'ORD-1001' });

    expect(result.status).toBe('error');
    expect(result.message).toContain('terminal state');
  });

  it('should refuse to cancel a refunded order', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { ...SAMPLE_ORDER, status: 'refunded' },
    });

    const result = await cancelOrderConfig.execute({ orderIdentifier: 'ORD-1001' });

    expect(result.status).toBe('error');
    expect(result.message).toContain('terminal state');
  });

  it('should return error when order lookup fails', async () => {
    mockApiRequest.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Order not found' },
    });

    const result = await cancelOrderConfig.execute({ orderIdentifier: 'ORD-9999' });

    expect(result.status).toBe('error');
    expect(result.message).toContain('not found');
  });
});

describe('update_order_status tool — API failure after validation', () => {
  it('should return error when status update API call fails', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_ORDER })
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Database write failed' },
      });

    const result = await updateOrderStatusConfig.execute({
      orderIdentifier: 'ORD-1001',
      newStatus: 'confirmed',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('Database write failed');
  });
});

describe('Order status transition completeness', () => {
  it('should allow shipped → delivered', () => {
    expect(isValidTransition('shipped', 'delivered')).toBe(true);
  });

  it('should allow delivered → completed', () => {
    expect(isValidTransition('delivered', 'completed')).toBe(true);
  });

  it('should allow delivered → refunded', () => {
    expect(isValidTransition('delivered', 'refunded')).toBe(true);
  });

  it('should allow completed → refunded', () => {
    expect(isValidTransition('completed', 'refunded')).toBe(true);
  });

  it('should block shipped → processing (no backwards)', () => {
    expect(isValidTransition('shipped', 'processing')).toBe(false);
  });
});
