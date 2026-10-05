import Card, { CardHeader } from '../../../shared/components/ui/Card';
import useT from '../../../shared/i18n/I18nProvider';
import { formatMoney } from '../../../shared/utils/format';
import { cn } from '../../../shared/utils/format';
import { ratioPercent } from '../../../shared/utils/money';

/**
 * Where the month's money went, in the handful of groups this reader cares about.
 *
 * The groups themselves come from the caller, because that is the whole
 * difference between the two dashboards: a student wants food, transport, fees,
 * hostel and personal; a household wants housing, utilities, groceries,
 * education, healthcare, transport and family. Same component, different
 * question.
 *
 * Every figure is a sum of real logged expenses. A group with nothing in it
 * shows zero and stays on the list rather than vanishing - a category that
 * disappears when it is empty makes a quiet month look like a broken page.
 */
export default function CategoryGroups({ title, groups = [], currency = 'PKR', total = 0 }) {
  const { t } = useT();

  const anySpending = groups.some((group) => group.amount > 0);
  const share = (amount) => ratioPercent(amount, total);

  return (
    <Card>
      <CardHeader title={title} />

      {!anySpending ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('dashboard.groupsEmpty')}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {groups.map((group) => (
            <li key={group.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-slate-600 dark:text-slate-300">
                  {t(group.labelKey)}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    group.amount > 0
                      ? 'text-slate-900 dark:text-slate-100'
                      : 'text-slate-400 dark:text-slate-500'
                  )}
                >
                  {formatMoney(group.amount, currency)}
                </span>
              </div>

              {/* The bar is decoration on top of a number that is already
                  readable, so it carries no meaning of its own and is hidden
                  from screen readers. */}
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width]"
                  style={{ width: `${Math.min(100, share(group.amount))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
