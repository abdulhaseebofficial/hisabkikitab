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
});
