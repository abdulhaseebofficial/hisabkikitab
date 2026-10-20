import { describe, it, expect, vi, afterEach } from 'vitest';
import generateUuidV4, { isValidUuid, UUID_V4_PATTERN } from './uuid';

describe('UUID v4 Generator & Validator', () => {
  it('generates valid RFC 4122 v4 UUIDs using native crypto.randomUUID', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateUuidV4();
      expect(isValidUuid(id)).toBe(true);
      expect(UUID_V4_PATTERN.test(id)).toBe(true);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  it('generates valid RFC 4122 v4 UUIDs using crypto.getRandomValues fallback', () => {
    const originalRandomUUID = crypto.randomUUID;
    try {
      crypto.randomUUID = undefined;
      for (let i = 0; i < 20; i++) {
        const id = generateUuidV4();
        expect(isValidUuid(id)).toBe(true);
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      }
    } finally {
      crypto.randomUUID = originalRandomUUID;
    }
  });

  it('generates valid RFC 4122 v4 UUIDs using Math.random fallback', () => {
    const originalRandomUUID = crypto.randomUUID;
    const originalGetRandomValues = crypto.getRandomValues;
    try {
      crypto.randomUUID = undefined;
      crypto.getRandomValues = undefined;
      for (let i = 0; i < 20; i++) {
        const id = generateUuidV4();
        expect(isValidUuid(id)).toBe(true);
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      }
    } finally {
      crypto.randomUUID = originalRandomUUID;
      crypto.getRandomValues = originalGetRandomValues;
    }
  });

  it('rejects malformed or invalid UUIDs', () => {
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('12345678-1234-1234-1234-123456789abcde')).toBe(false);
    expect(isValidUuid('12345678-1234-9234-8234-123456789abc')).toBe(false); // 9 is invalid version in backend regex
  });
});
