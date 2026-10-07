import { Pencil, Trash2, Repeat } from 'lucide-react';
import { useTheme } from '../../../app/providers/ThemeProvider';
import { categoryColor, categoryEmoji } from '../../../shared/utils/constants';
import { formatCalendarDate, formatMoney } from '../../../shared/utils/format';

/** One row in the expense list. */
export default function ExpenseItem({ expense, currency = 'INR', onEdit, onDelete }) {
  const { isDark } = useTheme();
  const color = categoryColor(expense.category, isDark);

  return (
    <li className="hw-card flex items-start gap-3 p-4 transition hover:shadow-lift">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{ backgroundColor: `${color}1f` }}
        aria-hidden="true"
      >
        {categoryEmoji(expense.category)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
          {expense.description || expense.category}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
            {expense.category}
          </span>
          <span aria-hidden="true">&middot;</span>
          <span>{formatCalendarDate(expense.date)}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{expense.paymentMethod}</span>
          {expense.isRecurring && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <Repeat className="h-3 w-3" />
              recurring
            </span>
          )}
        </p>
      </div>

      <span className="shrink-0 whitespace-nowrap pt-0.5 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {formatMoney(expense.amount, currency)}
      </span>

      <div className="flex shrink-0 gap-0.5">
        <button
          type="button"
          onClick={() => onEdit(expense)}
          aria-label={`Edit ${expense.description || expense.category}`}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800 dark:hover:text-brand-400"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(expense)}
          aria-label={`Delete ${expense.description || expense.category}`}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-danger/10 hover:text-danger dark:hover:bg-danger/15"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
