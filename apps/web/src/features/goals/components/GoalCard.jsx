import { CalendarClock, Check, Pencil, PiggyBank, Trash2, TrendingUp } from 'lucide-react';
import ProgressBar from '../../../shared/components/ui/ProgressBar';
import Badge from '../../../shared/components/ui/Badge';
import Button from '../../../shared/components/ui/Button';
import { formatDate, formatMoney, cn } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';

/**
 * A single savings goal: progress, what is left, and the pace needed to hit
 * the deadline. Completed goals switch to a celebration state.
 */
export default function GoalCard({ goal, currency = 'INR', onContribute, onEdit, onDelete }) {
  const { t } = useT();
  const { isCompleted, progress, remaining, daysLeft, perDay, perWeek, isOverdue } = goal;

  return (
    <article
      className={cn(
        'hw-card flex flex-col gap-4 p-5 transition',
        isCompleted && 'border-safe/40 bg-safe/[0.06] dark:border-safe/30 dark:bg-safe/10'
      )}
    >
      <header className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl',
            isCompleted ? 'bg-safe/15 dark:bg-safe/20' : 'bg-brand-50 dark:bg-brand-500/10'
          )}
          aria-hidden="true"
        >
          {goal.icon}
        </span>

        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">{goal.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatMoney(goal.savedAmount, currency)} of {formatMoney(goal.targetAmount, currency)}
          </p>
        </div>

        {(onEdit || onDelete) && <div className="flex shrink-0 gap-0.5">
          {onEdit &&
          <button
            type="button"
            onClick={() => onEdit(goal)}
            aria-label={`Edit ${goal.title}`}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
          >
            <Pencil className="h-4 w-4" />
          </button>}
          {onDelete &&
          <button
            type="button"
            onClick={() => onDelete(goal)}
            aria-label={`Delete ${goal.title}`}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-danger/10 hover:text-danger dark:hover:bg-danger/15"
          >
            <Trash2 className="h-4 w-4" />
          </button>}
        </div>}
      </header>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{progress}% saved</span>
          {!isCompleted && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {formatMoney(remaining, currency)} to go
            </span>
          )}
        </div>
        <ProgressBar value={progress} tone={isCompleted ? 'safe' : 'brand'} size="lg" label={`${goal.title} progress`} />
      </div>

      {isCompleted ? (
        <div className="flex items-center gap-2 rounded-xl bg-safe/10 px-3 py-2.5 dark:bg-safe/15">
          <Check className="h-4 w-4 shrink-0 text-safe" />
          <p className="text-xs font-medium text-safe">
            Goal reached! You saved the full {formatMoney(goal.targetAmount, currency)}.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {goal.deadline && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {isOverdue ? (
                <span className="font-medium text-danger">
                  Deadline passed on {formatDate(goal.deadline)}
                </span>
              ) : (
                <span>
                  Due {formatDate(goal.deadline)} &middot; {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                </span>
              )}
            </p>
          )}

          {perDay > 0 && !isOverdue && (
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <TrendingUp
                className="mr-1.5 inline h-3.5 w-3.5 align-[-2px] text-brand-600 dark:text-brand-400"
                aria-hidden="true"
              />
              Save{' '}
              <strong className="whitespace-nowrap font-semibold">
                {formatMoney(perDay, currency, { decimals: 0 })} a day
              </strong>{' '}
              <span className="text-slate-400">or</span>{' '}
              <strong className="whitespace-nowrap font-semibold">
                {formatMoney(perWeek, currency, { decimals: 0 })} a week
              </strong>
            </p>
          )}

          {!goal.deadline && (
            <Badge tone="neutral">{t('goals.noDeadline')}</Badge>
          )}
        </div>
      )}

      {onContribute && <Button
        variant={isCompleted ? 'outline' : 'primary'}
        icon={PiggyBank}
        onClick={() => onContribute(goal)}
        className="mt-auto w-full"
      >
        {isCompleted ? 'Add or withdraw' : 'Add money'}
      </Button>}
    </article>
  );
}
