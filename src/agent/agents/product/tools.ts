/**
 * Product management tools — lookup, field updates, and price changes.
 */

import { z } from 'zod';
import { apiRequest, isUUID } from '../../shared/helpers';

function formatProductSummary(product: any) {
  const defaultVariant =
    product.variants?.find((v: any) => v.isDefault) || product.variants?.[0];
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    status: product.status,
    price: defaultVariant?.price ?? null,
    variantCount: product.variants?.length || 0,
    vendor: product.vendor,
    brand: product.brand,
    tags: product.tags,
  };
}

export const getProductConfig = {
  name: 'get_product',
  description:
    'Look up a product by UUID or search by name. ' +
    'When searching by name, returns the top matching products with their IDs.',
  parameters: z.object({
    productIdentifier: z
      .string()
      .describe('The product UUID or a search term to find products by name'),
  }),
  execute: async ({ productIdentifier }: { productIdentifier: string }) => {
    if (isUUID(productIdentifier)) {
      const result = await apiRequest('GET', `/api/products/${productIdentifier}`);
      if (!result.success) {
        return { status: 'error', message: result.error?.message || 'Product not found' };
      }
      return { status: 'success', product: formatProductSummary(result.data) };
    }

    const result = await apiRequest(
      'GET',
      `/api/products?search=${encodeURIComponent(productIdentifier)}&limit=5`
    );
    if (!result.success) {
      return { status: 'error', message: result.error?.message || 'Failed to search products' };
    }

    const products = (result.data as any)?.data || [];
    if (products.length === 0) {
      return {
        status: 'success',
        message: `No products found matching '${productIdentifier}'.`,
        products: [],
      };
    }

    return {
      status: 'success',
      message: `Found ${products.length} product(s) matching '${productIdentifier}'.`,
      products: products.map((p: any) => {
        const dv = p.variants?.find((v: any) => v.isDefault) || p.variants?.[0];
        return { id: p.id, name: p.name, status: p.status, price: dv?.price ?? null };
      }),
    };
  },
};

export const updateProductConfig = {
  name: 'update_product',
  description:
    "Update a product's name, description, or status. " +
    'At least one field must be provided. Use the product UUID as identifier.',
  parameters: z.object({
    productId: z.string().describe('The product UUID'),
    name: z.string().optional().describe('New product name'),
    description: z.string().optional().describe('New product description'),
    status: z
      .enum(['active', 'draft', 'archived', 'discontinued'])
      .optional()
      .describe('New product status'),
  }),
  execute: async ({
    productId,
    name,
    description,
    status,
  }: {
    productId: string;
    name?: string;
    description?: string;
    status?: string;
  }) => {
    const updates: Record<string, string> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return {
        status: 'error',
        message: 'At least one field (name, description, or status) must be provided.',
      };
    }

    const lookupResult = await apiRequest('GET', `/api/products/${productId}`);
    if (!lookupResult.success) {
      return { status: 'error', message: lookupResult.error?.message || 'Product not found' };
    }

    const result = await apiRequest('PUT', `/api/products/${productId}`, updates);
    if (!result.success) {
      return { status: 'error', message: result.error?.message || 'Failed to update product' };
    }

    const updated = result.data as any;
    return {
      status: 'success',
      message: `Product '${updated.name}' has been updated.`,
      updatedFields: Object.keys(updates),
      product: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        status: updated.status,
      },
    };
  },
};

export const updateProductPriceConfig = {
  name: 'update_product_price',
  description:
    "Update the price of a product's default variant. Price must be zero or positive.",
  parameters: z.object({
    productId: z.string().describe('The product UUID'),
    price: z.number().describe('The new price (must be >= 0)'),
  }),
  execute: async ({ productId, price }: { productId: string; price: number }) => {
    if (price < 0) {
      return { status: 'error', message: 'Price must be zero or positive.' };
    }

    const lookupResult = await apiRequest('GET', `/api/products/${productId}`);
    if (!lookupResult.success) {
      return { status: 'error', message: lookupResult.error?.message || 'Product not found' };
    }

    const product = lookupResult.data as any;
    const defaultVariant =
      product.variants?.find((v: any) => v.isDefault) || product.variants?.[0];

    if (!defaultVariant) {
      return {
        status: 'error',
        message: `Product '${product.name}' has no variants to update the price for.`,
      };
    }

    const oldPrice = defaultVariant.price;

    const result = await apiRequest(
      'PUT',
      `/api/products/${productId}/variants/${defaultVariant.id}`,
      { price }
    );
    if (!result.success) {
      return { status: 'error', message: result.error?.message || 'Failed to update price' };
    }

    return {
      status: 'success',
      message: `Price for '${product.name}' updated from $${oldPrice.toFixed(2)} to $${price.toFixed(2)}.`,
      product: { id: product.id, name: product.name, oldPrice, newPrice: price, variantId: defaultVariant.id },
    };
  },
};

export const productToolConfigs = [getProductConfig, updateProductConfig, updateProductPriceConfig];
