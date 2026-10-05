import { describe, expect, it } from 'vitest';
import { toMinor, fromMinor, sumMoney, ratioPercent } from './money';

describe('personal money arithmetic', () => {
  it('adds decimal amounts without floating drift', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(fromMinor(toMinor('0.30') - toMinor('0.10'))).toBe(0.2);
    expect(ratioPercent(0.3, 0.5)).toBe(60);
  });

  it('rejects sub-cent inputs and preserves large display values', () => {
    expect(() => toMinor('0.001')).toThrow();
    expect(fromMinor(100000000000000n)).toBe('1000000000000.00');
  });
});
