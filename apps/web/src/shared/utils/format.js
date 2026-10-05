import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns';
import { CURRENCIES } from './constants';

export const currencySymbol = (code = 'PKR') => {
  const found = CURRENCIES.find((c) => c.code === code);
  return found ? found.symbol : code;
};

/**
 * Money formatter. Indian grouping (1,00,000) for INR, western grouping
 * elsewhere. Decimals are dropped for whole amounts because student budgets
 * are almost always round numbers.
 */
// Only INR groups as 1,25,000; PKR and the rest read as 125,000.
const localeFor = (code) => (code === 'INR' ? 'en-IN' : code === 'PKR' ? 'en-PK' : 'en-US');

export const formatMoney = (value, code = 'PKR', { compact = false, decimals } = {}) => {
  const amount = Number(value) || 0;
  const locale = localeFor(code);

  // Pakistan reads 1.2L the same way India does, so lakh shorthand stays.
  // A one-character symbol hugs the number, but a word-like symbol needs a
  // space or it reads as one token: "Rs9,000" vs "Rs 9,000".
  const symbol = currencySymbol(code);
  const gap = symbol.length > 1 ? ' ' : '';

  // An exceptional historical BIGINT amount arrives as a decimal string.
  // Group its integer digits without converting the cents through Number.
  if (typeof value === 'string' && /^-?\d+\.\d{2}$/.test(value) && !compact &&
      (value.length > 16 || !Number.isSafeInteger(Number(value.replace('.', ''))))) {
    const negative = value.startsWith('-');
    const [whole, fraction] = (negative ? value.slice(1) : value).split('.');
    const digits = decimals !== undefined ? decimals : fraction === '00' ? 0 : 2;
    return `${symbol}${gap}${negative ? '-' : ''}${BigInt(whole).toLocaleString(locale)}${digits ? `.${fraction.slice(0, digits).padEnd(digits, '0')}` : ''}`;
  }

  if (compact && Math.abs(amount) >= 100000) {
    return `${symbol}${gap}${(amount / 100000).toFixed(1)}L`;
  }
  if (compact && Math.abs(amount) >= 1000) {
    return `${symbol}${gap}${(amount / 1000).toFixed(1)}k`;
  }

  const fractionDigits = decimals !== undefined ? decimals : Number.isInteger(amount) ? 0 : 2;

  return `${symbol}${gap}${amount.toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
};

/** Bare number, no symbol - for chart axes. */
export const formatNumber = (value, code = 'PKR') =>
  (Number(value) || 0).toLocaleString(localeFor(code));

const toDate = (value) => (typeof value === 'string' ? parseISO(value) : new Date(value));

/** "Today", "Yesterday", or "12 Aug 2026". */
export const formatDate = (value) => {
  if (!value) return '';
  const date = toDate(value);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'd MMM yyyy');
};

export const formatDateTime = (value) => (value ? format(toDate(value), "d MMM yyyy, h:mm a") : '');

/** Value for an <input type="date">. */
// Date-input values are calendar days. The API stores an explicitly chosen day
// as UTC midnight in a timestamptz column; converting that sentinel into the
// viewer's timezone would turn it into yesterday west of UTC. Other instants
// (including creation/payment timestamps) retain ordinary local formatting.
const storedCalendarDay = (value) => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T00:00:00(?:\.0+)?Z$)/.exec(value);
  return match ? match[1] : null;
};

export const toInputDate = (value) => (value
  ? storedCalendarDay(value) || format(toDate(value), 'yyyy-MM-dd') : '');

/** Display a financial calendar day without shifting a stored UTC-midnight value. */
export const formatCalendarDate = (value) => {
  const day = storedCalendarDay(value);
  return day ? formatDate(day) : formatDate(value);
};

export const formatRelative = (value) => (value ? `${formatDistanceToNowStrict(toDate(value))} ago` : '');

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const monthLabel = (month, year) => `${MONTH_NAMES[month - 1]} ${year}`;

/** Signed percentage with an arrow, for month-on-month comparisons. */
export const formatChange = (percent) => {
  const value = Number(percent) || 0;
  if (value === 0) return 'no change';
  const arrow = value > 0 ? '\u2191' : '\u2193';
  return `${arrow} ${Math.abs(value).toFixed(1)}%`;
};

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'S';

/** Tailwind classes join helper - skips falsy values. */
export const cn = (...classes) => classes.filter(Boolean).join(' ');
