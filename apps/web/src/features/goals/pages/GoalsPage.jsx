import { useCallback, useState } from 'react';
import { Plus, Target, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../../shared/components/ui/Button';
import PageHeader from '../../../shared/components/ui/PageHeader';
import Modal from '../../../shared/components/ui/Modal';
import ConfirmDialog from '../../../shared/components/ui/ConfirmDialog';
import EmptyState from '../../../shared/components/ui/EmptyState';
import { SkeletonCard } from '../../../shared/components/ui/Skeleton';
import StatCard from '../../../shared/components/StatCard';
import GoalCard from '../components/GoalCard';
import GoalForm from '../components/GoalForm';
import ContributeModal from '../components/ContributeModal';
import useAsync from '../../../shared/hooks/useAsync';
import useMutation from '../../../shared/hooks/useMutation';
import { useAuth } from '../../auth';
import goalService from '../api/goalsApi';
import { cn, formatMoney } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';
import { trackEvent } from '../../../shared/analytics/analytics';

// Keys, so the tab a person is on survives a language change.
const TABS = [
  { key: 'all', labelKey: 'goals.tabAll' },
  { key: 'active', labelKey: 'goals.tabActive' },
  { key: 'completed', labelKey: 'goals.tabCompleted' },
];

export default function Goals() {
  const { t } = useT();
  const { currency } = useAuth();
  const [tab, setTab] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [contributing, setContributing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { saving, run } = useMutation();

  const load = useCallback(() => goalService.list(tab), [tab]);
  const { data, loading, error, reload } = useAsync(load, [tab]);

  const submit = (values) => {
    const eventName = editing ? 'goal_updated' : 'goal_created';
    const payload = { ...values, deadline: values.deadline || null };
    return run(() => (editing ? goalService.update(editing._id, payload) : goalService.create(payload)), {
      success: editing ? 'Goal updated' : 'Goal created. Now go fund it!',
      onDone: () => {
        trackEvent(eventName);
        setFormOpen(false);
        setEditing(null);
        reload();
      },
    });
  };

  // Funding a goal is the one write with a result worth celebrating, so it
  // raises its own toast instead of the standard one.
  const contribute = (amount) =>
    run(() => goalService.contribute(contributing._id, amount), {
      onDone: (result) => {
        if (result.justCompleted) {
          trackEvent('goal_completed');
          toast.success(`Goal complete! You saved the full amount for "${result.goal.title}"`, {
            icon: '\uD83C\uDF89',
            duration: 5000,
          });
        } else {
          toast.success(amount > 0 ? 'Money added to your goal' : 'Money withdrawn');
        }
        setContributing(null);
        reload();
      },
    });

  const confirmDelete = () =>
    run(() => goalService.remove(deleting._id), {
      success: t('goals.deleted'),
      onDone: () => {
        setDeleting(null);
        reload();
      },
    });

  const goals = data ? data.items : [];
  const summary = data ? data.summary : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('goals.title')}
        subtitle={t('goals.subtitle')}
      >
        <Button
          icon={Plus}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t('goals.newGoal')}
        </Button>
      </PageHeader>

      {summary && summary.count > 0 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label={t('goals.totalSaved')} value={summary.totalSaved} currency={currency} icon={Target} tone="safe" />
          <StatCard
            label={t('goals.totalTarget')}
            value={summary.totalTargeted}
            currency={currency}
            icon={Target}
            tone="brand"
            progress={summary.totalTargeted ? (summary.totalSaved / summary.totalTargeted) * 100 : 0}
          />
          <StatCard
            label={t('goals.completedCount')}
            value={t('goals.completedOf', { done: summary.completed, total: summary.count })}
            raw
            icon={Trophy}
            tone="caution"
            className="sm:col-span-2 lg:col-span-1"
          />
        </section>
      )}

      <div className="flex gap-1.5">
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
              tab === option.key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            )}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : error ? (
        <EmptyState icon={Target} title={t('goals.loadFailed')} message={error} actionLabel={t('common.retry')} onAction={reload} />
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title={tab === 'completed' ? t('goals.emptyCompleted') : t('goals.empty')}
          message={
            tab === 'completed'
              ? t('goals.emptyCompletedMessage')
              : t('goals.emptyMessage')
          }
          actionLabel={t('goals.createFirst')}
          actionIcon={Plus}
          onAction={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal._id}
              goal={goal}
              currency={currency}
              onContribute={setContributing}
              onEdit={(item) => {
                setEditing(item);
                setFormOpen(true);
              }}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Edit goal' : 'Create a savings goal'}
        size="md"
      >
        <GoalForm
          goal={editing}
          currency={currency}
          onSubmit={submit}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          submitting={saving}
        />
      </Modal>

      <ContributeModal
        open={Boolean(contributing)}
        goal={contributing}
        currency={currency}
        onClose={() => setContributing(null)}
        onSubmit={contribute}
        submitting={saving}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={saving}
        title={t('goals.deleteTitle')}
        message={
          deleting
            ? t('goals.deleteMessage', {
                title: deleting.title,
                amount: formatMoney(deleting.savedAmount, currency),
              })
            : ''
        }
      />
    </div>
  );
}
