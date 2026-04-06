/**
 * Order management tools — lookup, status updates, and cancellation.
 */

import { z } from 'zod';
import { apiRequest, isUUID } from '../../shared/helpers';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'processing', 'on_hold', 'cancelled'],
  confirmed: ['processing', 'on_hold', 'cancelled'],
  processing: ['shipped', 'partially_shipped', 'on_hold', 'cancelled'],
  on_hold: ['pending', 'confirmed', 'processing', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  partially_shipped: ['shipped', 'delivered', 'cancelled'],
  delivered: ['completed', 'refunded', 'partially_refunded'],
  completed: ['refunded', 'partially_refunded'],
  cancelled: [],
  refunded: [],
  partially_refunded: [],
};

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function getAllowedTransitions(from: string): string[] {
  return VALID_TRANSITIONS[from] || [];
}

function buildOrderLookupPath(orderIdentifier: string): string {
  return isUUID(orderIdentifier)
    ? `/api/orders/${orderIdentifier}`
    : `/api/orders/number/${orderIdentifier}`;
}

function formatOrderSummary(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    customerEmail: order.customerEmail,
    items: order.lineItems?.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    })),
    subtotal: order.subtotal,
    shippingTotal: order.shippingTotal,
    taxTotal: order.taxTotal,
    grandTotal: order.grandTotal,
    createdAt: order.createdAt,
  };
}

export const getOrderConfig = {
  name: 'get_order',
  description:
    'Look up an order by its order number (e.g. ORD-1001) or UUID. ' +
    'Returns order details including status, customer info, line items, and totals.',
  parameters: z.object({
    orderIdentifier: z
      .string()
      .describe('The order number (e.g. ORD-1001) or UUID'),
  }),
  execute: async ({ orderIdentifier }: { orderIdentifier: string }) => {
    const result = await apiRequest('GET', buildOrderLookupPath(orderIdentifier));
    if (!result.success) {
      return { status: 'error', message: result.error?.message || 'Order not found' };
    }
    return { status: 'success', order: formatOrderSummary(result.data) };
  },
};

export const updateOrderStatusConfig = {
  name: 'update_order_status',
  description:
    'Update the status of an order. The agent validates that the transition ' +
    'is allowed before calling the API. Provide the order identifier and the desired new status.',
  parameters: z.object({
    orderIdentifier: z
      .string()
      .describe('The order number (e.g. ORD-1001) or UUID'),
    newStatus: z
      .string()
      .describe('The new status to set (e.g. confirmed, shipped, cancelled)'),
    reason: z
      .string()
      .optional()
      .describe('Optional reason for the status change'),
  }),
  execute: async ({
    orderIdentifier,
    newStatus,
    reason,
  }: {
    orderIdentifier: string;
    newStatus: string;
    reason?: string;
  }) => {
    const lookupResult = await apiRequest('GET', buildOrderLookupPath(orderIdentifier));
    if (!lookupResult.success) {
      return { status: 'error', message: lookupResult.error?.message || 'Order not found' };
    }

    const order = lookupResult.data as any;
    const currentStatus: string = order.status;

    if (!isValidTransition(currentStatus, newStatus)) {
      const allowed = getAllowedTransitions(currentStatus);
      return {
        status: 'error',
        message:
          `Cannot transition from '${currentStatus}' to '${newStatus}'. ` +
          (allowed.length > 0
            ? `Valid transitions: ${allowed.join(', ')}`
            : `'${currentStatus}' is a terminal state with no further transitions.`),
      };
    }

    const body: Record<string, string> = { status: newStatus };
    if (reason) body.reason = reason;

    const result = await apiRequest('POST', `/api/orders/${order.id}/status`, body);
    if (!result.success) {
      return { status: 'error', message: result.error?.message || 'Failed to update order status' };
    }

    return {
      status: 'success',
      message: `Order ${order.orderNumber} status updated from '${currentStatus}' to '${newStatus}'.`,
      order: { orderNumber: order.orderNumber, previousStatus: currentStatus, newStatus },
    };
  },
};

export const cancelOrderConfig = {
  name: 'cancel_order',
  description:
    'Cancel an order. Cannot cancel orders that are already in a terminal state ' +
    '(completed, cancelled, or refunded).',
  parameters: z.object({
    orderIdentifier: z
      .string()
      .describe('The order number (e.g. ORD-1001) or UUID'),
    reason: z
      .string()
      .optional()
      .describe('Optional reason for the cancellation'),
  }),
  execute: async ({
    orderIdentifier,
    reason,
  }: {
    orderIdentifier: string;
    reason?: string;
  }) => {
    const lookupResult = await apiRequest('GET', buildOrderLookupPath(orderIdentifier));
    if (!lookupResult.success) {
      return { status: 'error', message: lookupResult.error?.message || 'Order not found' };
    }

    const order = lookupResult.data as any;
    const terminalStatuses = ['cancelled', 'completed', 'refunded'];

    if (terminalStatuses.includes(order.status)) {
      return {
        status: 'error',
        message:
          `Cannot cancel order ${order.orderNumber}. ` +
          `Current status '${order.status}' is a terminal state.`,
      };
    }

    const body: Record<string, string> = {};
    if (reason) body.reason = reason;

    const result = await apiRequest('POST', `/api/orders/${order.id}/cancel`, body);
    if (!result.success) {
      return { status: 'error', message: result.error?.message || 'Failed to cancel order' };
    }

    return {
      status: 'success',
      message:
        `Order ${order.orderNumber} has been cancelled.` +
        (reason ? ` Reason: ${reason}` : ''),
      order: { orderNumber: order.orderNumber, previousStatus: order.status, newStatus: 'cancelled' },
    };
  },
};

export const orderToolConfigs = [getOrderConfig, updateOrderStatusConfig, cancelOrderConfig];
