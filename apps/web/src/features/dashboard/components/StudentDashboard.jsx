import { ArrowDownRight, ArrowUpRight, CalendarDays, Wallet } from 'lucide-react';
import StatCard from '../../../shared/components/StatCard';
import useT from '../../../shared/i18n/I18nProvider';
import { formatChange, formatMoney } from '../../../shared/utils/format';
import { TipCard } from '../../advisor';
import { DebtWidget } from '../../debts';
import GoalsPreview from './GoalsPreview';
import RecentTransactions from './RecentTransactions';
import CategoryGroups from './CategoryGroups';
import UpcomingBills from './UpcomingBills';
import { BudgetHealth, SpendingCharts } from './DashboardShared';
import { STUDENT_GROUPS, totalsByGroup } from '../dashboardGroups';

/**
 * The month as a student experiences it.
 *
 * The question this screen answers is "how much is left, and how much can I
 * spend today without running out". So the headline is what remains, and the
 * fourth tile is the per-day figure - the number that decides whether tonight
 * is the dhaba or the mess.
 *
 * Fees and the hostel bill appear in the group breakdown rather than leading,
 * because a student pays them once and then lives on what is left. That is the
 * opposite of the householder view, where the fixed costs are the story.
 */
export default function StudentDashboard({ data, currency, onNavigate, onQuickAdd, readOnly = false }) {
  const { t } = useT();
  const { totals, categoryBreakdown, trend, comparison, budgets, goals, recentExpenses, monthLabel, debts, upcomingBills } = data;

  const overspending = totals.income > 0 && totals.remaining < 0;
  const groups = totalsByGroup(STUDENT_GROUPS, categoryBreakdown);

  // With no income recorded there is nothing to divide by, and a "safe to
  // spend" figure derived from zero would be a confident-looking lie.
  const hasIncome = totals.income > 0;

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* The reason the app was opened, so it does not look like the other three. */}
        <StatCard
          hero
          label={t('dashboard.moneyLeft')}
          value={totals.remaining}
          currency={currency}
          decimals={0}
          icon={Wallet}
          tone={overspending ? 'danger' : totals.spentPercent > 80 ? 'caution' : 'safe'}
          progress={Math.min(100, totals.spentPercent)}
          progressTone={overspending ? 'over' : totals.spentPercent > 80 ? 'warning' : 'safe'}
          footnote={
            overspending
              ? t('dashboard.overIncome')
              : t('dashboard.percentUsed', { percent: totals.spentPercent })
          }
          className="col-span-2 lg:col-span-1"
        />

        <StatCard
          label={t('dashboard.totalSpent')}
          value={totals.spent}
          currency={currency}
          icon={ArrowDownRight}
          tone="danger"
          footnote={
            comparison.previousMonthSpent > 0
              ? t('dashboard.versusLastMonth', { change: formatChange(comparison.changePercent) })
              : t('dashboard.firstMonth')
          }
        />

        <StatCard
          label={t('dashboard.income')}
          value={totals.income}
          currency={currency}
          icon={ArrowUpRight}
          tone="safe"
          footnote={
            totals.incomeLogged > 0 ? t('dashboard.fromLogged') : t('dashboard.plannedPocketMoney')
          }
        />

        <StatCard
          label={t('dashboard.safePerDay')}
          value={hasIncome ? totals.safeDailySpend : 0}
          currency={currency}
          decimals={0}
          icon={CalendarDays}
          tone="brand"
          footnote={
            hasIncome
              ? t('dashboard.dailyAverage', {
                  amount: formatMoney(totals.dailyAverage, currency, { decimals: 0 }),
                })
              : t('dashboard.noIncomeYet')
          }
          // Third of three secondary tiles, so it takes the orphan row alone.
          className="max-lg:col-span-2"
        />
      </section>

      <TipCard />

      <SpendingCharts
        breakdown={categoryBreakdown}
        trend={trend}
        totals={totals}
        monthLabel={monthLabel}
        currency={currency}
      />

      <section className="grid gap-5 lg:grid-cols-2">
        <RecentTransactions expenses={recentExpenses} currency={currency} onAdd={onQuickAdd} />

        <div className="space-y-5">
          <CategoryGroups
            title={t('dashboard.whereItGoesStudent')}
            groups={groups}
            currency={currency}
            total={totals.spent}
          />

          <GoalsPreview goals={goals} currency={currency} onCreate={() => onNavigate('/goals')} />

          <DebtWidget debts={debts} currency={currency} />

          {/* A hostel fee behaves like a bill, so this is useful here too - it
              just does not lead the way it does for a household. */}
          <UpcomingBills bills={upcomingBills} currency={currency} readOnly={readOnly} />

          <BudgetHealth budgets={budgets} currency={currency} onCreate={() => onNavigate('/budget')} />
        </div>
      </section>
    </>
  );
}
