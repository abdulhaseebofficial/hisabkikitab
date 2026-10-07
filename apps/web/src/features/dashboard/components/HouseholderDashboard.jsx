import { ArrowDownRight, ArrowUpRight, Receipt, Wallet } from 'lucide-react';
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
import { HOUSEHOLDER_GROUPS, totalsByGroup } from '../dashboardGroups';
import { sumMoney } from '../../../shared/utils/money';

/**
 * The month as a household experiences it.
 *
 * The question here is not "how much can I spend today" - it is "how much of
 * this month is already committed, and what is left after it". A household's
 * month arrives with obligations attached: rent, the bijli bill in a hot
 * month, school fees, an installment. So the fourth headline tile is what is
 * still owed in the next fortnight, not a per-day allowance, and the bills
 * card sits at the top of the column rather than the bottom.
 *
 * Everything here is a sum of real logged rows. Nothing is projected from past
 * months, because a household that has not recorded a bill yet needs to see
 * that plainly rather than read a confident estimate of it.
 */
export default function HouseholderDashboard({ data, currency, onNavigate, onQuickAdd }) {
  const { t } = useT();
  const { totals, categoryBreakdown, trend, comparison, budgets, goals, recentExpenses, monthLabel, debts, upcomingBills } = data;

  const overspending = totals.income > 0 && totals.remaining < 0;
  const groups = totalsByGroup(HOUSEHOLDER_GROUPS, categoryBreakdown);

  const billsTotal = sumMoney((upcomingBills || []).map((bill) => bill.amount || 0));

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          hero
          label={t('dashboard.householdLeft')}
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
          label={t('dashboard.householdIncome')}
          value={totals.income}
          currency={currency}
          icon={ArrowUpRight}
          tone="safe"
          footnote={
            totals.incomeLogged > 0
              ? t('dashboard.fromLogged')
              : t('dashboard.expectedHouseholdIncome')
          }
        />

        <StatCard
          label={t('dashboard.householdSpending')}
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

        {/* Where the student dashboard puts a per-day allowance. A household
            does not spend evenly across the month - it pays things on dates -
            so what is still due is the more useful fourth figure. */}
        <StatCard
          label={t('dashboard.upcomingBills')}
          value={billsTotal}
          currency={currency}
          decimals={0}
          icon={Receipt}
          tone={billsTotal > 0 ? 'caution' : 'neutral'}
          footnote={
            upcomingBills && upcomingBills.length
              ? t('dashboard.billsDueSoon', {
                  count: upcomingBills.length,
                  amount: formatMoney(billsTotal, currency, { decimals: 0 }),
                })
              : t('dashboard.noBillsDue')
          }
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
          {/* First in the column, unlike the student view: this is the part of
              the month a household cannot choose. */}
          <UpcomingBills bills={upcomingBills} currency={currency} />

          <CategoryGroups
            title={t('dashboard.whereItGoesHouseholder')}
            groups={groups}
            currency={currency}
            total={totals.spent}
          />

          <BudgetHealth budgets={budgets} currency={currency} onCreate={() => onNavigate('/budget')} />

          <DebtWidget debts={debts} currency={currency} />

          {/* Goals are shared across both modes by design - the same savings
              goal, whichever way the person is keeping their books. */}
          <GoalsPreview goals={goals} currency={currency} onCreate={() => onNavigate('/goals')} />
        </div>
      </section>
    </>
  );
}
