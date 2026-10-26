import { Link } from 'react-router-dom';
import { ArrowRight, Target } from 'lucide-react';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import EmptyState from '../../../shared/components/ui/EmptyState';
import ProgressBar from '../../../shared/components/ui/ProgressBar';
import { formatMoney } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';

export default function GoalsPreview({ goals = [], currency = 'INR', onCreate }) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader
        title={t('dashboard.savingsGoals')}
        icon={Target}
        action={
          goals.length > 0 && (
            <Link
              to="/goals"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              Manage
              <ArrowRight className="h-3 w-3" />
            </Link>
          )
        }
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title={t('dashboard.noGoalsYet')}
          message={t('dashboard.noGoalsMessage')}
          actionLabel={t('dashboard.createGoal')}
          onAction={onCreate}
        />
      ) : (
        <ul className="space-y-4">
          {goals.map((goal) => (
            <li key={goal._id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">{goal.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {formatMoney(goal.savedAmount, currency, { compact: true })} /{' '}
                  {formatMoney(goal.targetAmount, currency, { compact: true })}
                </span>
              </div>
              <ProgressBar
                value={goal.progress}
                tone={goal.progress >= 100 ? 'safe' : 'brand'}
                label={`${goal.title} progress`}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
