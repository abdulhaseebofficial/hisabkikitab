import { useCallback, useState } from 'react';
import { PieChart as PieIcon, Sparkles, Wallet, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import PageHeader from '../../../shared/components/ui/PageHeader';
import Modal from '../../../shared/components/ui/Modal';
import Input from '../../../shared/components/ui/Input';
import Select from '../../../shared/components/ui/Select';
import EmptyState from '../../../shared/components/ui/EmptyState';
import { SkeletonCard } from '../../../shared/components/ui/Skeleton';
import StatCard from '../../../shared/components/StatCard';
import BudgetRow from '../components/BudgetRow';
import useAsync from '../../../shared/hooks/useAsync';
import useMutation from '../../../shared/hooks/useMutation';
import useCategories from '../../../shared/hooks/useCategories';
import { useAuth } from '../../auth';
import budgetService from '../api/budgetsApi';
import { advisorApi as aiService } from '../../advisor';
import { currencySymbol, formatMoney, monthLabel } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';
import { trackEvent } from '../../../shared/analytics/analytics';

const now = new Date();

export default function Budget() {
  const { t } = useT();
  const { currency } = useAuth();
  const { categories } = useCategories();

  const [period] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [editing, setEditing] = useState(null);
  const [limitValue, setLimitValue] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [suggestion, setSuggestion] = useState(null);

  // Two independent in-flight flags: saving a limit must not grey out the
  // "suggest a budget" button, and vice versa.
  const { saving, run } = useMutation();
  const { saving: suggesting, run: runSuggest } = useMutation();

  const load = useCallback(() => budgetService.list(period.month, period.year), [period]);
  const { data, loading, error, reload } = useAsync(load, [period]);

  const saveLimit = () => {
    const eventName = editing ? 'budget_updated' : 'budget_created';
    const limit = Number(limitValue);
    if (Number.isNaN(limit) || limit < 0) return toast.error(t('budget.enterLimit'));

    const category = editing ? editing.category : newCategory;
    if (!category) return toast.error(t('budget.pickCategory'));

    return run(() => budgetService.set({ category, limit, month: period.month, year: period.year }), {
      success: `Budget set for ${category}`,
      onDone: () => {
        trackEvent(eventName);
        setEditing(null);
        setNewCategory('');
        setLimitValue('');
        reload();
      },
    });
  };

  /** Ask Claude for a whole plan; nothing is saved until "apply" is pressed. */
  const askAi = () =>
    runSuggest(() => aiService.suggestBudget(period.month, period.year), { onDone: setSuggestion });

  const applySuggestion = () =>
    run(
      () =>
        budgetService.bulkSet(
          suggestion.categories.map((row) => ({ category: row.category, limit: row.limit })),
          period.month,
          period.year
        ),
      {
        success: t('budget.planApplied'),
        onDone: () => {
          trackEvent('budget_plan_applied');
          setSuggestion(null);
          reload();
        },
      }
    );

  const items = data ? data.items : [];
  const totals = data ? data.totals : null;
  const unbudgeted = categories.filter((category) => !items.some((row) => row.category === category));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('budget.title')}
        subtitle={t('budget.subtitle', { month: monthLabel(period.month, period.year) })}
      >
        <Button icon={Sparkles} variant="secondary" loading={suggesting} onClick={askAi}>
          {t('budget.suggest')}
        </Button>
      </PageHeader>

      {totals && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('budget.income')} value={totals.income} currency={currency} icon={Wallet} tone="safe" />
          <StatCard label={t('budget.totalBudgeted')} value={totals.limit} currency={currency} icon={PieIcon} tone="brand" />
          <StatCard
            label={t('budget.spentSoFar')}
            value={totals.spent}
            currency={currency}
            icon={PieIcon}
            tone={totals.spent > totals.limit ? 'danger' : 'caution'}
            progress={totals.limit ? Math.min(100, (totals.spent / totals.limit) * 100) : 0}
            progressTone={totals.spent > totals.limit ? 'over' : 'warning'}
          />
          <StatCard
            label={t('budget.notAllocated')}
            value={totals.unallocated}
            currency={currency}
            icon={Wallet}
            tone={totals.unallocated < 0 ? 'danger' : 'neutral'}
            footnote={
              totals.unallocated < 0
                ? t('budget.overIncome')
                : t('budget.roomLeft')
            }
          />
        </section>
      )}

      <Card>
        <CardHeader title={t('budget.categoryLimits')} icon={PieIcon} />

        {loading && !data ? (
          <SkeletonCard lines={6} className="border-0 p-0 shadow-none" />
        ) : error ? (
          <EmptyState icon={PieIcon} title={t('budget.loadFailed')} message={error} actionLabel={t('common.retry')} onAction={reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={PieIcon}
            title={t('budget.empty')}
            message={t('budget.emptyMessage')}
            actionLabel={t('budget.suggestForMe')}
            actionIcon={Sparkles}
            onAction={askAi}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((row) => (
              <BudgetRow
                key={row._id}
                row={row}
                currency={currency}
                onEdit={(item) => {
                  setEditing(item);
                  setLimitValue(String(item.limit));
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      {unbudgeted.length > 0 && (
        <Card>
          <CardHeader title={t('budget.addLimit')} subtitle={t('budget.addLimitSubtitle')} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Select
              className="flex-1"
              label={t('common.category')}
              options={unbudgeted}
              placeholder={t('budget.pickCategory')}
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
            />
            <Input
              className="flex-1"
              label={t('budget.monthlyLimit')}
              type="number"
              inputMode="decimal"
              placeholder="0"
              prefix={currencySymbol(currency)}
              value={editing ? '' : limitValue}
              onChange={(event) => setLimitValue(event.target.value)}
            />
            <Button onClick={saveLimit} loading={saving} disabled={!newCategory} className="sm:mb-0.5">
              {t('budget.setLimit')}
            </Button>
          </div>
        </Card>
      )}

      {/* Edit an existing limit */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? t('budget.budgetFor', { category: editing.category }) : ''}
        subtitle={editing ? t('budget.currentlySpent', { amount: formatMoney(editing.spent, currency) }) : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveLimit} loading={saving}>
              {t('budget.saveLimit')}
            </Button>
          </>
        }
      >
        <Input
          label={t('budget.monthlyLimit')}
          type="number"
          inputMode="decimal"
          autoFocus
          prefix={currencySymbol(currency)}
          value={limitValue}
          onChange={(event) => setLimitValue(event.target.value)}
          hint={t('budget.zeroToStop')}
        />
      </Modal>

      {/* AI suggested plan */}
      <Modal
        open={Boolean(suggestion)}
        onClose={() => setSuggestion(null)}
        title={t('budget.suggestedTitle')}
        subtitle={suggestion && !suggestion.aiPowered ? t('budget.builtOffline') : t('budget.draftedFromSpending')}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSuggestion(null)} disabled={saving}>
              {t('budget.notNow')}
            </Button>
            <Button icon={Check} onClick={applySuggestion} loading={saving}>
              {t('budget.applyPlan')}
            </Button>
          </>
        }
      >
        {suggestion && (
          <div className="space-y-4">
            <p className="rounded-xl bg-brand-50 p-3.5 text-sm text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
              {suggestion.summary}
            </p>

            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {suggestion.categories.map((row) => (
                <li key={row.category} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{row.category}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{row.reason}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMoney(row.limit, currency)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between rounded-xl bg-safe/10 px-3.5 py-3 dark:bg-safe/15">
              <span className="text-sm font-semibold text-safe">{t('budget.leftToSave')}</span>
              <span className="text-sm font-bold tabular-nums text-safe">
                {formatMoney(suggestion.savingsTarget, currency)}
              </span>
            </div>

            {suggestion.exceedsIncome && (
              <p className="text-xs font-medium text-danger">
                {t('budget.exceedsIncome')}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
