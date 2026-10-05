import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wallet } from 'lucide-react';
import Button from '../../../shared/components/ui/Button';
import PageHeader from '../../../shared/components/ui/PageHeader';
import useQuickAdd from '../../../shared/hooks/useQuickAdd';
import { SkeletonStats, SkeletonCard } from '../../../shared/components/ui/Skeleton';
import EmptyState from '../../../shared/components/ui/EmptyState';
import useAsync from '../../../shared/hooks/useAsync';
import useT from '../../../shared/i18n/I18nProvider';
import { useAuth } from '../../auth';
import dashboardService from '../api/dashboardApi';
import { SharedLivingPage } from '../../sharedLiving';
import StudentDashboard from '../components/StudentDashboard';
import HouseholderDashboard from '../components/HouseholderDashboard';

/**
 * The home screen, in whichever of the two lives the person is keeping books for.
 *
 * This file is deliberately thin. It fetches once, handles the three states
 * every screen has to handle - loading, failed, loaded - and then hands the
 * data to one of two dashboards. Those two are genuinely different screens
 * rather than one screen with relabelled tiles: a student is asked how much is
 * left to spend today, a household is asked how much of the month is already
 * committed. Keeping the choice here means neither has to know the other
 * exists.
 *
 * Switching mode re-fetches through the app's data-changed broadcast, so the
 * figures and the layout change together, without a reload.
 */
export default function Dashboard() {
  const { user } = useAuth();
  return user?.financeMode === 'shared_living' ? <SharedLivingPage key={user._id} userId={user._id} /> : <PersonalDashboard />;
}

function PersonalDashboard() {
  const { user, currency } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();

  // Adding an expense is the shell's dialog, reached through the same opener
  // the N shortcut uses - so this page no longer carries a second copy of it.
  const { open: openQuickAdd, canCreate } = useQuickAdd();

  const load = useCallback(() => {
    const now = new Date();
    return dashboardService.summary(now.getMonth() + 1, now.getFullYear());
  }, []);
  const { data, loading, error, reload } = useAsync(load, []);

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <SkeletonStats />
        <div className="grid gap-5 lg:grid-cols-2">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <EmptyState
        icon={Wallet}
        title={t('dashboard.loadFailed')}
        message={error}
        actionLabel={t('common.retry')}
        onAction={reload}
      />
    );
  }

  const householder = Boolean(user && user.financeMode === 'householder');
  const Body = householder ? HouseholderDashboard : StudentDashboard;

  const firstName = user && user.name ? user.name.split(' ')[0] : '';

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('dashboard.greeting', { name: firstName })}
        subtitle={t('dashboard.periodLine', {
          month: data.monthLabel,
          days: data.totals.daysLeftInMonth,
        })}
      >
        {/* Hidden on phones: the raised button in the tab bar does this job,
            and two buttons for one action just costs a screenful of space. */}
        {canCreate && (
          <Button icon={Plus} shortcut="N" onClick={openQuickAdd} className="hidden sm:inline-flex">
            {t('expenses.add')}
          </Button>
        )}
      </PageHeader>

      <Body data={data} currency={currency} onNavigate={navigate} onQuickAdd={openQuickAdd} />
    </div>
  );
}
