jest.mock('../../agent/shared/helpers', () => ({
  ...jest.requireActual('../../agent/shared/helpers'),
  apiRequest: jest.fn(),
}));

import { apiRequest } from '../../agent/shared/helpers';
import {
  getProductConfig,
  updateProductConfig,
  updateProductPriceConfig,
} from '../../agent/agents/product/tools';

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const SAMPLE_PRODUCT = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  name: 'Premium Widget',
  description: 'A high-quality widget',
  status: 'active',
  vendor: 'WidgetCo',
  brand: 'ProWidgets',
  tags: ['electronics', 'sale'],
  variants: [
    { id: 'var-001', isDefault: true, price: 29.99 },
    { id: 'var-002', isDefault: false, price: 39.99 },
  ],
};

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('get_product tool', () => {
  it('should look up by UUID and return formatted product', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: SAMPLE_PRODUCT });

    const result = await getProductConfig.execute({
      productIdentifier: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    }) as any;

    expect(result.status).toBe('success');
    expect(result.product).toBeDefined();
    expect(result.product.name).toBe('Premium Widget');
    expect(result.product.price).toBe(29.99);
    expect(result.product.variantCount).toBe(2);
    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/products/f47ac10b-58cc-4372-a567-0e02b2c3d479'
    );
  });

  it('should search by name when identifier is not a UUID', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { data: [SAMPLE_PRODUCT] },
    });

    const result = await getProductConfig.execute({ productIdentifier: 'Widget' });

    expect(result.status).toBe('success');
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Premium Widget');
    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/products?search=Widget&limit=5'
    );
  });

  it('should handle no search results', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [] } });

    const result = await getProductConfig.execute({ productIdentifier: 'Nonexistent' });

    expect(result.status).toBe('success');
    expect(result.message).toContain('No products found');
    expect(result.products).toEqual([]);
  });

  it('should return error when UUID lookup fails', async () => {
    mockApiRequest.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found' },
    });

    const result = await getProductConfig.execute({
      productIdentifier: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('not found');
  });
});

describe('update_product tool', () => {
  it('should update product fields successfully', async () => {
    const updatedProduct = { ...SAMPLE_PRODUCT, name: 'Super Widget' };
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_PRODUCT })
      .mockResolvedValueOnce({ success: true, data: updatedProduct });

    const result = await updateProductConfig.execute({
      productId: SAMPLE_PRODUCT.id,
      name: 'Super Widget',
    });

    expect(result.status).toBe('success');
    expect(result.message).toContain('Super Widget');
    expect(result.updatedFields).toContain('name');
  });

  it('should update multiple fields at once', async () => {
    const updatedProduct = {
      ...SAMPLE_PRODUCT,
      name: 'New Name',
      description: 'New Desc',
      status: 'draft',
    };
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_PRODUCT })
      .mockResolvedValueOnce({ success: true, data: updatedProduct });

    const result = await updateProductConfig.execute({
      productId: SAMPLE_PRODUCT.id,
      name: 'New Name',
      description: 'New Desc',
      status: 'draft',
    });

    expect(result.status).toBe('success');
    expect(result.updatedFields).toEqual(
      expect.arrayContaining(['name', 'description', 'status'])
    );
  });

  it('should reject when no fields are provided', async () => {
    const result = await updateProductConfig.execute({
      productId: SAMPLE_PRODUCT.id,
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('At least one field');
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('should return error when product is not found', async () => {
    mockApiRequest.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found' },
    });

    const result = await updateProductConfig.execute({
      productId: 'nonexistent-id',
      name: 'New Name',
    });

    expect(result.status).toBe('error');
  });
});

describe('update_product_price tool', () => {
  it('should update the default variant price', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_PRODUCT })
      .mockResolvedValueOnce({ success: true, data: { price: 19.99 } });

    const result = await updateProductPriceConfig.execute({
      productId: SAMPLE_PRODUCT.id,
      price: 19.99,
    });

    expect(result.status).toBe('success');
    expect(result.message).toContain('$29.99');
    expect(result.message).toContain('$19.99');
    expect((result as any).product.oldPrice).toBe(29.99);
    expect((result as any).product.newPrice).toBe(19.99);
    expect(mockApiRequest).toHaveBeenLastCalledWith(
      'PUT',
      `/api/products/${SAMPLE_PRODUCT.id}/variants/var-001`,
      { price: 19.99 }
    );
  });

  it('should allow setting price to zero', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_PRODUCT })
      .mockResolvedValueOnce({ success: true, data: { price: 0 } });

    const result = await updateProductPriceConfig.execute({
      productId: SAMPLE_PRODUCT.id,
      price: 0,
    });

    expect(result.status).toBe('success');
  });

  it('should reject negative price', async () => {
    const result = await updateProductPriceConfig.execute({
      productId: SAMPLE_PRODUCT.id,
      price: -5,
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('zero or positive');
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('should handle product with no variants', async () => {
    const noVariantsProduct = { ...SAMPLE_PRODUCT, variants: [] };
    mockApiRequest.mockResolvedValue({ success: true, data: noVariantsProduct });

    const result = await updateProductPriceConfig.execute({
      productId: SAMPLE_PRODUCT.id,
      price: 10.0,
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('no variants');
  });

  it('should fall back to first variant when no default exists', async () => {
    const noDefaultProduct = {
      ...SAMPLE_PRODUCT,
      variants: [{ id: 'var-x', isDefault: false, price: 15.0 }],
    };
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: noDefaultProduct })
      .mockResolvedValueOnce({ success: true, data: { price: 20.0 } });

    const result = await updateProductPriceConfig.execute({
      productId: SAMPLE_PRODUCT.id,
      price: 20.0,
    });

    expect(result.status).toBe('success');
    expect(mockApiRequest).toHaveBeenLastCalledWith(
      'PUT',
      `/api/products/${SAMPLE_PRODUCT.id}/variants/var-x`,
      { price: 20.0 }
    );
  });

  it('should return error when price update API call fails', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: SAMPLE_PRODUCT })
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Database error' },
      });

    const result = await updateProductPriceConfig.execute({
      productId: SAMPLE_PRODUCT.id,
      price: 19.99,
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('Database error');
  });

  it('should return error when product lookup fails', async () => {
    mockApiRequest.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found' },
    });

    const result = await updateProductPriceConfig.execute({
      productId: 'nonexistent',
      price: 10,
    });

    expect(result.status).toBe('error');
  });
});

describe('get_product tool — search encoding', () => {
  it('should URL-encode special characters in search term', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [] } });

    await getProductConfig.execute({ productIdentifier: 'widget & gear' });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/products?search=widget%20%26%20gear&limit=5'
    );
  });
});
