import { Search } from 'lucide-react';
import Select from '../../../shared/components/ui/Select';
import useT from '../../../shared/i18n/I18nProvider';
import { cn, formatMoney } from '../../../shared/utils/format';

// Every list below pairs the value the API expects with the key the reader
// sees. The values never change with the language; only the keys are looked up.

/** Two directions, each with its outstanding total. */
const KINDS = [
  { value: 'LENT', key: 'udhaar.collectSection', total: 'receivable' },
  { value: 'BORROWED', key: 'udhaar.paySection', total: 'payable' },
];

const STATUSES = [
  { value: 'OUTSTANDING', key: 'udhaar.filters.stillOpen' },
  { value: '', key: 'udhaar.filters.anyStatus' },
  { value: 'PENDING', key: 'udhaar.status.active' },
  { value: 'PARTIALLY_PAID', key: 'udhaar.status.partially_paid' },
  { value: 'OVERDUE', key: 'udhaar.status.overdue' },
  { value: 'SETTLED', key: 'udhaar.status.settled' },
  { value: 'CANCELLED', key: 'udhaar.status.cancelled' },
];

const SORTS = [
  { value: 'newest', key: 'udhaar.sort.newest' },
  { value: 'oldest', key: 'udhaar.sort.oldest' },
  { value: 'remaining', key: 'udhaar.sort.remaining' },
  { value: 'amount', key: 'udhaar.sort.amount' },
  { value: 'due', key: 'udhaar.sort.due' },
];

export default function DebtFilters({ filters, onChange, summary, currency, loading = false }) {
  const { t } = useT();
  const set = (patch) => onChange({ ...filters, ...patch, page: 1 });

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label={t('udhaar.filters.direction')}
        className="grid grid-cols-2 gap-2"
      >
        {KINDS.map((option) => (
          <button
            key={option.value || 'all'}
            type="button"
            onClick={() => set({ kind: option.value })}
            aria-pressed={(filters.kind || 'LENT') === option.value}
            className={cn(
              'min-w-0 rounded-2xl border p-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:p-4',
              (filters.kind || 'LENT') === option.value
                ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-500/10 dark:text-brand-300'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
            )}
          >
            <span className="block">{t(option.key)}</span>
            <span className="mt-2 block break-words text-lg font-bold tabular-nums sm:text-xl">
              {loading ? '...' : formatMoney(summary?.[option.total] || 0, currency)}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.search || ''}
            onChange={(event) => set({ search: event.target.value })}
            placeholder={t('udhaar.searchPlaceholder')}
            aria-label={t('udhaar.filters.person')}
            className="hw-input pl-9"
          />
        </div>

        <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">
            {t('udhaar.moreFilters')}{(filters.status !== undefined && filters.status !== 'OUTSTANDING') || (filters.sort && filters.sort !== 'newest') ? ' *' : ''}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Select
          label=""
          aria-label={t('udhaar.filters.status')}
          options={STATUSES.map((o) => ({ value: o.value, label: t(o.key) }))}
          value={filters.status ?? 'OUTSTANDING'}
          onChange={(event) => set({ status: event.target.value })}
        />

        <Select
          label=""
          aria-label={t('udhaar.sortRecords')}
          options={SORTS.map((o) => ({ value: o.value, label: t(o.key) }))}
          value={filters.sort || 'newest'}
          onChange={(event) => set({ sort: event.target.value })}
        />
          </div>
        </details>
      </div>
    </div>
  );
}
