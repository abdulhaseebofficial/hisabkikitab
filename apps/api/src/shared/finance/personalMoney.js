// Personal money is stored and calculated in hundredths for every supported
// currency. JSON numbers remain the ordinary API shape; large historical
// values use decimal strings so no cent is lost at the response boundary.
const MAX_INPUT_MINOR = 99999999999999n;
const API_NUMBER_MINOR = 99999999999999n;

const minor = (value) => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new RangeError('Invalid minor-unit amount');
};

const decimalToMinor = (value, { allowNegative = false, allowZero = true, enforceInputRange = true } = {}) => {
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new RangeError('Amount must be a finite decimal');
  }
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError('Amount must have at most two decimal places');
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0') || '0');
  const result = match[1] ? -cents : cents;
  if ((!allowNegative && result < 0n) || (!allowZero && result === 0n)) {
    throw new RangeError('Amount is outside the allowed range');
  }
  if (enforceInputRange && (result > MAX_INPUT_MINOR || result < -MAX_INPUT_MINOR)) {
    throw new RangeError('Amount exceeds the supported range');
  }
  return result;
};
const apiToMinor = (value) => decimalToMinor(value, { allowNegative: true, enforceInputRange: false });
const roundDecimalToMinor = (value) => {
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new RangeError('Amount must be a decimal');
  const fractions = match[3] || '';
  let cents = BigInt(match[2]) * 100n + BigInt(fractions.slice(0, 2).padEnd(2, '0') || '0');
  if (fractions.length > 2 && Number(fractions[2]) >= 5) cents += 1n;
  return match[1] ? -cents : cents;
};

const minorToDecimal = (value) => {
  const cents = minor(value);
  const digits = (cents < 0n ? -cents : cents).toString().padStart(3, '0');
  return `${cents < 0n ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
};

const minorToApi = (value) => {
  const cents = minor(value);
  const decimal = minorToDecimal(cents);
  return cents <= API_NUMBER_MINOR && cents >= -API_NUMBER_MINOR ? Number(decimal) : decimal;
};

const sumMinor = (values) => values.reduce((sum, value) => sum + minor(value), 0n);
const roundRatio = (numerator, denominator) => {
  const a = minor(numerator);
  const b = minor(denominator);
  if (b <= 0n) return 0;
  const scaled = a * 100n;
  const positive = scaled >= 0n;
  const quotient = (positive ? scaled : -scaled) * 2n / b;
  return Number((quotient + 1n) / 2n) * (positive ? 1 : -1);
};
const ratioPercent2 = (numerator, denominator) => {
  const a = minor(numerator);
  const b = minor(denominator);
  if (b === 0n) return 0;
  const negative = (a < 0n) !== (b < 0n);
  const absolute = (a < 0n ? -a : a) * 10000n;
  const divisor = b < 0n ? -b : b;
  const hundredths = (absolute * 2n + divisor) / (divisor * 2n);
  return minorToApi(negative ? -hundredths : hundredths);
};
const divideMinor = (value, divisor) => {
  const amount = minor(value);
  const n = BigInt(divisor);
  if (n <= 0n) throw new RangeError('Divisor must be positive');
  return (amount >= 0n ? amount + n / 2n : amount - n / 2n) / n;
};

module.exports = { MAX_INPUT_MINOR, minor, decimalToMinor, apiToMinor, roundDecimalToMinor, minorToDecimal, minorToApi, sumMinor, roundRatio, ratioPercent2, divideMinor };
