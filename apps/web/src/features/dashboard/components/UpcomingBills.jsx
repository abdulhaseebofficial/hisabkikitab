import { useState } from 'react';
import { CalendarClock, Check, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import EmptyState from '../../../shared/components/ui/EmptyState';
import useT from '../../../shared/i18n/I18nProvider';
import useCategoryLabel from '../../../shared/i18n/useCategoryLabel';
import { notifyDataChanged } from '../../../shared/hooks/useAsync';
import { expensesApi } from '../../expenses';
import { cn, formatDate, formatMoney } from '../../../shared/utils/format';
import { sumMoney } from '../../../shared/utils/money';

/**
 * What is already committed in the next fortnight, and a way to tick it off.
 *
 * These are real recurring expenses with real due dates, not a forecast.
 * Nothing here is estimated from past behaviour: if a person has not marked
 * anything as recurring there is genuinely nothing to show, and the card says
 * so rather than inventing a plausible-looking figure.
 *
 * It leads the householder dashboard because a household's month is largely
 * decided before it starts. A student sees it too, lower down, since a hostel
 * fee behaves the same way.
 *
 * TICKING A BILL OFF
 *
 * The checkbox is not cosmetic. It records the expense and moves the bill's due
 * date on by one cycle, together - a bill that was marked paid but stayed in
 * this list would be worse than no checkbox at all. The due date advances from
 * the date that was SCHEDULED rather than from today, so a household that pays
 * a few days early every month does not watch its billing date drift.
 */
export default function UpcomingBills({ bills = [], currency = 'PKR' }) {
  const { t } = useT();
  const label = useCategoryLabel();

  // Which row is mid-request. Per row, so ticking one off does not freeze the
  // rest of the list.
  const [saving, setSaving] = useState(null);

  const total = sumMoney(bills.map((bill) => bill.amount || 0));
  const now = Date.now();

  const markPaid = async (bill) => {
    setSaving(bill._id);
    try {
      await expensesApi.markPaid(bill._id);
      toast.success(t('dashboard.billPaid'));
      // Every figure on the dashboard just changed - what is spent, what is
      // left, and this list. One broadcast refetches all of them.
      notifyDataChanged();
    } catch {
      toast.error(t('dashboard.billPaidFailed'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('dashboard.upcomingBills')}
        subtitle={
          bills.length
            ? t('dashboard.billsDueSoon', {
                count: bills.length,
                amount: formatMoney(total, currency),
              })
            : t('dashboard.noBillsDue')
        }
        icon={Receipt}
      />

      {bills.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t('dashboard.noBillsDue')}
          message={t('dashboard.noBillsMessage')}
        />
      ) : (
        <ul className="space-y-1.5">
          {bills.map((bill) => {
            const due = bill.nextRunAt ? new Date(bill.nextRunAt) : null;
            const late = due && due.getTime() < now;
            // The description is the person's own words; the category falls
            // back to its translated label.
            const what = bill.description || label(bill.category);
            const busy = saving === bill._id;

            return (
              <li
                key={bill._id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
              >
                <button
                  type="button"
                  onClick={() => markPaid(bill)}
                  disabled={busy}
                  aria-label={t('dashboard.markPaid', { what })}
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition',
                    'border-slate-300 text-transparent hover:border-safe hover:text-safe',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                    'disabled:opacity-50 dark:border-slate-600 dark:hover:border-safe',
                    busy && 'animate-pulse'
                  )}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {what}
                  </p>
                  <p
                    className={cn(
                      'truncate text-[11px]',
                      late ? 'font-semibold text-danger' : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {late
                      ? t('dashboard.overdueBill')
                      : t('dashboard.dueOn', { date: due ? formatDate(due) : '' })}
                  </p>
                </div>

                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatMoney(bill.amount, currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
