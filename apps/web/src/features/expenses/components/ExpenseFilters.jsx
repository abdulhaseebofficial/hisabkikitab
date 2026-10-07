import { useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import Button from '../../../shared/components/ui/Button';
import Select from '../../../shared/components/ui/Select';
import Input from '../../../shared/components/ui/Input';
import { PAYMENT_METHODS } from '../../../shared/utils/constants';
import { cn, toInputDate } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';

// Keys, not labels: the preset a person picked must survive a language
// change, and only the word on the pill is allowed to move.
const PRESETS = [
  { key: 'all', labelKey: 'filters.allTime' },
  { key: 'week', labelKey: 'filters.last7Days' },
  { key: 'month', labelKey: 'filters.thisMonth' },
  { key: 'prev', labelKey: 'filters.lastMonth' },
];

/** Turns a preset key into a from/to pair. */
export const presetRange = (key) => {
  const now = new Date();

  if (key === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from: toInputDate(from), to: toInputDate(now) };
  }
  if (key === 'month') {
    return { from: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toInputDate(now) };
  }
  if (key === 'prev') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toInputDate(start), to: toInputDate(end) };
  }
  return { from: '', to: '' };
};

/**
 * Search plus the date presets in one row, with the finer controls behind a
 * toggle so the common case stays a single tap.
 *
 * Anything currently narrowing the list is also summarised as a removable chip
 * ABOVE that toggle. Filters that only exist inside a collapsed panel are
 * filters a student cannot see and cannot undo - they just conclude their
 * expenses have gone missing.
 */
export default function ExpenseFilters({ filters, onChange, onReset, categories = [], resultCount }) {
  const { t } = useT();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const set = (patch) => onChange({ ...filters, ...patch, page: 1 });

  // One entry per narrowing filter, each able to clear just itself.
  const activeChips = [
    filters.search && { key: 'search', label: t('filters.chipSearch', { value: filters.search }), clear: { search: '' } },
    filters.category && { key: 'category', label: filters.category, clear: { category: '' } },
    filters.paymentMethod && {
      key: 'paymentMethod',
      label: t('filters.chipPaidWith', { value: filters.paymentMethod }),
      clear: { paymentMethod: '' },
    },
    filters.minAmount && { key: 'minAmount', label: t('filters.chipMin', { value: filters.minAmount }), clear: { minAmount: '' } },
    filters.maxAmount && { key: 'maxAmount', label: t('filters.chipMax', { value: filters.maxAmount }), clear: { maxAmount: '' } },
    filters.preset === 'custom' &&
      (filters.from || filters.to) && {
        key: 'range',
        label: t('filters.chipRange', {
          from: filters.from || t('filters.rangeStart'),
          to: filters.to || t('filters.rangeToday'),
        }),
        clear: { preset: 'month', ...presetRange('month') },
      },
  ].filter(Boolean);

  // The date preset is always set to something, so it does not count as a chip
  // unless it has been moved off the default.
  const hasFilters = activeChips.length > 0 || filters.preset !== 'month';

  // Everything the collapsed panel is hiding, so the toggle can carry a count.
  const advancedCount = activeChips.filter((chip) => chip.key !== 'search').length;

  return (
    <div className="hw-card space-y-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => set({ search: event.target.value })}
            placeholder={t('expenses.searchPlaceholder')}
            aria-label={t('expenses.searchLabel')}
            className={cn('hw-input pl-10', filters.search && 'pr-10')}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => set({ search: '' })}
              aria-label={t('expenses.clearSearch')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button
          variant={advancedOpen ? 'secondary' : 'outline'}
          icon={SlidersHorizontal}
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="shrink-0"
        >
          Filters
          {advancedCount > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
              {advancedCount}
            </span>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            aria-pressed={filters.preset === preset.key}
            onClick={() => set({ preset: preset.key, ...presetRange(preset.key) })}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition',
              filters.preset === preset.key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            )}
          >
            {t(preset.labelKey)}
          </button>
        ))}

        {resultCount !== undefined && (
          <span
            aria-live="polite"
            className="ml-auto self-center text-xs text-slate-500 dark:text-slate-400"
          >
            {t('filters.resultCount', { count: resultCount })}
          </span>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">{t('expenses.filteredBy')}</span>
          {activeChips.map((chip) => (
            <span key={chip.key} className="hw-chip">
              <span className="max-w-40 truncate">{chip.label}</span>
              <button
                type="button"
                onClick={() => set(chip.clear)}
                aria-label={t('filters.removeFilter', { label: chip.label })}
                className="hw-chip-remove"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="ml-1 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-400"
          >
            {t('filters.clearAll')}
          </button>
        </div>
      )}

      {advancedOpen && (
        <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
          <Select
            label={t('common.category')}
            options={categories}
            placeholder={t('expenses.anyCategory')}
            value={filters.category}
            onChange={(event) => set({ category: event.target.value })}
          />
          <Select
            label={t('expenses.paymentMethod')}
            options={PAYMENT_METHODS}
            placeholder={t('expenses.anyMethod')}
            value={filters.paymentMethod}
            onChange={(event) => set({ paymentMethod: event.target.value })}
          />
          <Input
            label={t('expenses.minAmount')}
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={filters.minAmount}
            onChange={(event) => set({ minAmount: event.target.value })}
          />
          <Input
            label={t('expenses.maxAmount')}
            type="number"
            inputMode="decimal"
            placeholder="Any"
            value={filters.maxAmount}
            onChange={(event) => set({ maxAmount: event.target.value })}
          />

          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Input
              label={t('common.from')}
              type="date"
              value={filters.from}
              onChange={(event) => set({ from: event.target.value, preset: 'custom' })}
            />
            <Input
              label={t('common.to')}
              type="date"
              value={filters.to}
              onChange={(event) => set({ to: event.target.value, preset: 'custom' })}
            />
          </div>

          {hasFilters && (
            <div className="flex items-end lg:col-span-2">
              <Button variant="ghost" icon={X} onClick={onReset}>
                {t('filters.clearAllFilters')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
