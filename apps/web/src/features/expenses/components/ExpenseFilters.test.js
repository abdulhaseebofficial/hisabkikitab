import { afterEach, describe, expect, it, vi } from 'vitest';
import { presetRange } from './ExpenseFilters';
import { formatCalendarDate, formatDate, toInputDate } from '../../../shared/utils/format';

const originalTimezone = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = originalTimezone;
});

describe('expense calendar date presets', () => {
  it.each([
    ['Asia/Karachi', '2026-10-04T20:30:00.000Z', { week: '2026-09-29', month: '2026-10-01', today: '2026-10-05' }],
    ['America/Los_Angeles', '2026-10-05T06:30:00.000Z', { week: '2026-09-28', month: '2026-10-01', today: '2026-10-04' }],
    ['Asia/Karachi', '2027-01-01T19:30:00.000Z', { week: '2026-12-27', month: '2027-01-01', today: '2027-01-02' }],
    ['America/Los_Angeles', '2027-01-01T06:30:00.000Z', { week: '2026-12-25', month: '2026-12-01', today: '2026-12-31' }],
    ['Asia/Karachi', '2028-02-29T20:30:00.000Z', { week: '2028-02-24', month: '2028-03-01', today: '2028-03-01' }],
  ])('%s at %s uses the local day', (timezone, instant, dates) => {
    process.env.TZ = timezone;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));

    expect(presetRange('week')).toEqual({ from: dates.week, to: dates.today });
    expect(presetRange('month')).toEqual({ from: dates.month, to: dates.today });
    if (dates.today === '2026-10-05') {
      expect(presetRange('prev')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    }
    expect(presetRange('all')).toEqual({ from: '', to: '' });
  });

  it.each(['Asia/Karachi', 'America/Los_Angeles'])(
    '%s preserves a stored date-only value without changing instant formatting', (timezone) => {
      process.env.TZ = timezone;
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'));
      const chosenDay = '2026-10-05T00:00:00.000Z';
      const instant = '2026-10-05T06:30:00.000Z';
      expect(toInputDate(chosenDay)).toBe('2026-10-05');
      expect(formatCalendarDate(chosenDay)).toBe('5 Oct 2026');
      expect(toInputDate('2028-02-29')).toBe('2028-02-29');
      expect(toInputDate(instant)).toBe(timezone === 'Asia/Karachi' ? '2026-10-05' : '2026-10-04');
      expect(formatCalendarDate(instant)).toBe(formatDate(instant));
    },
  );
});
