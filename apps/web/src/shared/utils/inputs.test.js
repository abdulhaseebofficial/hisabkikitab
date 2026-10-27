import { describe, expect, it, vi } from 'vitest';
import { allowOnlyNumbers, sanitizeNumericString, sanitizeDigitsOnly } from './inputs';

describe('Numeric Input Restriction Utilities', () => {
  it('allows digits 0-9 and blocks letters or special characters', () => {
    const preventDefault = vi.fn();

    // Digits must be allowed
    ['0', '1', '5', '9'].forEach((key) => {
      const e = { key, preventDefault, target: { value: '' } };
      allowOnlyNumbers(e);
      expect(preventDefault).not.toHaveBeenCalled();
    });

    // Letters and exponential symbols must be blocked
    ['a', 'Z', 'e', 'E', '+', '$', '#'].forEach((key) => {
      const e = { key, preventDefault, target: { value: '' } };
      allowOnlyNumbers(e);
      expect(preventDefault).toHaveBeenCalled();
      preventDefault.mockClear();
    });
  });

  it('allows decimal point only once when allowDecimal is true', () => {
    const preventDefault = vi.fn();

    // First decimal point allowed
    allowOnlyNumbers({ key: '.', preventDefault, target: { value: '123' } }, { allowDecimal: true });
    expect(preventDefault).not.toHaveBeenCalled();

    // Second decimal point blocked
    allowOnlyNumbers({ key: '.', preventDefault, target: { value: '123.45' } }, { allowDecimal: true });
    expect(preventDefault).toHaveBeenCalled();
    preventDefault.mockClear();

    // Decimal point blocked if allowDecimal is false
    allowOnlyNumbers({ key: '.', preventDefault, target: { value: '123' } }, { allowDecimal: false });
    expect(preventDefault).toHaveBeenCalled();
  });

  it('allows navigation and control keys (Backspace, Delete, Arrow keys, Tab, Enter)', () => {
    const preventDefault = vi.fn();
    ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].forEach((key) => {
      const e = { key, preventDefault, target: { value: '123' } };
      allowOnlyNumbers(e);
      expect(preventDefault).not.toHaveBeenCalled();
    });
  });

  it('sanitizes strings correctly for numeric values', () => {
    expect(sanitizeNumericString('12,345.67')).toBe('12345.67');
    expect(sanitizeNumericString('Rs 50000/-')).toBe('50000');
    expect(sanitizeNumericString('12.34.56')).toBe('12.3456');
    expect(sanitizeNumericString('abc')).toBe('');
  });

  it('sanitizes strings for digits only', () => {
    expect(sanitizeDigitsOnly('0300-1234567')).toBe('03001234567');
    expect(sanitizeDigitsOnly('+92 300 1234567')).toBe('923001234567');
    expect(sanitizeDigitsOnly('abc123xyz')).toBe('123');
  });
});
