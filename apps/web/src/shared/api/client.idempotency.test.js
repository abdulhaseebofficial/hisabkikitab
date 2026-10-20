import { describe, expect, it } from 'vitest';
import api from './client';

describe('financial request keys', () => {
  it('reuses a key after an uncertain failure and releases it after a successful response', async () => {
    const body = { amount: 10, category: 'test', description: crypto.randomUUID() };
    const keys = [];
    const failing = async (config) => {
      keys.push(config.headers['Idempotency-Key']);
      throw Object.assign(new Error('Network Error'), { config });
    };
    const succeeding = async (config) => {
      keys.push(config.headers['Idempotency-Key']);
      return { config, status: 201, statusText: 'Created', headers: {}, data: { success: true } };
    };

    await expect(api.post('/expenses', body, { adapter: failing })).rejects.toThrow('Network Error');
    await api.post('/expenses', body, { adapter: succeeding });
    await api.post('/expenses', body, { adapter: succeeding });
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('attaches a valid UUID Idempotency-Key for business creation and business financial routes', async () => {
    let capturedBusinessKey = null;
    let capturedSalesKey = null;

    await api.post(
      '/business',
      { name: 'Ranghaat Store' },
      {
        adapter: async (config) => {
          capturedBusinessKey = config.headers['Idempotency-Key'];
          return { config, status: 201, statusText: 'Created', headers: {}, data: { success: true } };
        },
      }
    );

    await api.post(
      '/business/b1-uuid/sales',
      { total_amount_minor: 50000 },
      {
        adapter: async (config) => {
          capturedSalesKey = config.headers['Idempotency-Key'];
          return { config, status: 201, statusText: 'Created', headers: {}, data: { success: true } };
        },
      }
    );

    expect(capturedBusinessKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(capturedSalesKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
