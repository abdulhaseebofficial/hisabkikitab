import { CalendarClock, ChevronRight } from 'lucide-react';
import ProgressBar from '../../../shared/components/ui/ProgressBar';
import { KindBadge, StatusBadge } from './DebtBadges';
import { progressPercent } from '../utils/debtDisplay';
import { cn, formatMoney, formatDate } from '../../../shared/utils/format';

/**
 * One record in the list.
 *
 * Laid out so the two things a student scans for - whose money it is and how
 * much is left - are the largest text on the row, on any width. A settled row
 * is dimmed and says so; an overdue one keeps full contrast so it does not
 * recede into the list.
 */
export default function DebtRow({ debt, currency, onOpen }) {
  const settled = debt.status === 'SETTLED';
  const percent = progressPercent(debt);

  return (
    <button
      type="button"
      onClick={() => onOpen(debt)}
      aria-label={`Open the record for ${debt.personName}`}
      className={cn(
        'hw-card w-full p-4 text-left transition hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        settled && 'opacity-70'
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {debt.personName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <KindBadge kind={debt.kind} />
            <StatusBadge debt={debt} />
            {debt.category && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {debt.category}
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto">
          <div className="min-w-0 sm:text-right">
            <p
              className={cn(
                'break-words text-base font-bold tabular-nums',
                settled ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'
              )}
            >
              {formatMoney(debt.remainingAmount, currency)}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {settled ? 'settled' : `of ${formatMoney(debt.originalAmount, currency)}`}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
        </div>
      </div>

      {!settled && debt.paidAmount > 0 && (
        <div className="mt-3">
          <ProgressBar value={percent} tone="brand" />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {formatMoney(debt.paidAmount, currency)} paid ({percent}%)
          </p>
        </div>
      )}

      {debt.dueDate && !settled && (
        <p
          className={cn(
            'mt-2.5 flex items-center gap-1.5 text-[11px] font-medium',
            debt.isOverdue ? 'text-danger' : 'text-slate-500 dark:text-slate-400'
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          {debt.isOverdue ? 'Was due' : 'Due'} {formatDate(debt.dueDate)}
        </p>
      )}
    </button>
  );
}
