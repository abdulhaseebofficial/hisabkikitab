/**
 * Shared input restriction utilities.
 * Ensures numeric inputs only accept digits/numbers and blocks invalid characters (e.g. e, E, +, -, letters).
 * Preserves text/character input for names, descriptions, and details.
 */

export const allowOnlyNumbers = (e, { allowDecimal = true, allowNegative = false } = {}) => {
  // Allow navigation and system control keys
  if (
    [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(e.key) ||
    e.ctrlKey ||
    e.metaKey
  ) {
    return;
  }

  // Allow decimal point if permitted and not already in value
  if (e.key === '.') {
    if (!allowDecimal || (e.target && String(e.target.value || '').includes('.'))) {
      e.preventDefault();
    }
    return;
  }

  // Allow negative sign if permitted, only as first character
  if (e.key === '-') {
    if (
      !allowNegative ||
      (e.target && (e.target.selectionStart !== 0 || String(e.target.value || '').includes('-')))
    ) {
      e.preventDefault();
    }
    return;
  }

  // Explicitly block exponential notation keys and '+'
  if (['e', 'E', '+'].includes(e.key)) {
    e.preventDefault();
    return;
  }

  // Block any non-digit character
  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
  }
};

export const sanitizeNumericString = (val, { allowDecimal = true, allowNegative = false } = {}) => {
  if (val === null || val === undefined) return '';
  let str = String(val);
  const isNegative = allowNegative && str.startsWith('-');
  str = str.replace(/[^0-9.]/g, '');
  if (allowDecimal) {
    const parts = str.split('.');
    str = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : str;
  } else {
    str = str.replace(/\./g, '');
  }
  return isNegative && str ? `-${str}` : str;
};

export const sanitizeDigitsOnly = (val) => {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\D/g, '');
};
