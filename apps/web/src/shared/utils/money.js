export const toMinor = (value) => {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new RangeError('Enter an amount with at most two decimal places');
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0') || '0');
  return match[1] ? -cents : cents;
};

export const fromMinor = (value) => {
  const cents = BigInt(value);
  const digits = (cents < 0n ? -cents : cents).toString().padStart(3, '0');
  const decimal = `${cents < 0n ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
  return cents <= 99999999999999n && cents >= -99999999999999n ? Number(decimal) : decimal;
};

export const sumMoney = (values) => fromMinor(values.reduce((sum, value) => sum + toMinor(value), 0n));

export const ratioPercent = (part, whole) => {
  const numerator = toMinor(part);
  const denominator = toMinor(whole);
  return denominator > 0n ? Number((numerator * 100n + denominator / 2n) / denominator) : 0;
};

export const isSupportedMoney = (value, { minimumMinor = 0n } = {}) => {
  try {
    const cents = toMinor(value);
    return cents >= minimumMinor && cents <= 99999999999999n;
  } catch { return false; }
};
