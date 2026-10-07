import { useCallback, useState } from 'react';
import { BarChart3, Download, FileText, PieChart as PieIcon, Table2, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import PageHeader from '../../../shared/components/ui/PageHeader';
import Select from '../../../shared/components/ui/Select';
import EmptyState from '../../../shared/components/ui/EmptyState';
import { SkeletonCard, SkeletonStats } from '../../../shared/components/ui/Skeleton';
import StatCard from '../../../shared/components/StatCard';
import CategoryPieChart from '../../../shared/components/charts/CategoryPieChart';
import TrendChart from '../../../shared/components/charts/TrendChart';
import ComparisonChart from '../../../shared/components/charts/ComparisonChart';
import useAsync from '../../../shared/hooks/useAsync';
import { useAuth } from '../../auth';
import reportService from '../api/reportsApi';
import { getErrorMessage } from '../../../shared/api/client';
import { MONTH_NAMES, formatChange, formatCalendarDate, formatMoney, cn } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';
import useCategoryLabel from '../../../shared/i18n/useCategoryLabel';

const now = new Date();
const YEARS = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

export default function Reports() {
  const { t } = useT();
  const label = useCategoryLabel();
  const { user, currency } = useAuth();
  const householder = Boolean(user && user.financeMode === 'householder');
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [downloading, setDownloading] = useState('');
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(() => reportService.monthly(period.month, period.year), [period]);
  const { data, loading, error, reload } = useAsync(load, [period]);

  const download = async (format) => {
    setDownloading(format);
    try {
      await reportService.download(format, period.month, period.year);
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDownloading('');
    }
  };

  const totals = data ? data.totals : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('reports.title')}
        subtitle={t(householder ? 'reports.subtitleHouseholder' : 'reports.subtitleStudent')}
      >
        <div className="flex flex-wrap items-end gap-2">
          <Select
            options={MONTH_NAMES.map((name, index) => ({ value: index + 1, label: name }))}
            value={period.month}
            onChange={(event) => setPeriod((current) => ({ ...current, month: Number(event.target.value) }))}
            className="w-full min-w-[9rem] flex-1 sm:w-40 sm:flex-none"
          />
          <Select
            options={YEARS.map((year) => ({ value: year, label: String(year) }))}
            value={period.year}
            onChange={(event) => setPeriod((current) => ({ ...current, year: Number(event.target.value) }))}
            className="w-full min-w-[7rem] flex-1 sm:w-28 sm:flex-none"
          />
          <Button
            variant="outline"
            icon={FileText}
            loading={downloading === 'pdf'}
            onClick={() => download('pdf')}
          >
            PDF
          </Button>
          <Button
            variant="outline"
            icon={Download}
            loading={downloading === 'csv'}
            onClick={() => download('csv')}
          >
            CSV
          </Button>
        </div>
      </PageHeader>

      {loading && !data ? (
        <div className="space-y-5">
          <SkeletonStats />
          <SkeletonCard lines={8} />
        </div>
      ) : error ? (
        <EmptyState icon={BarChart3} title={t('reports.buildFailed')} message={error} actionLabel={t('common.retry')} onAction={reload} />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('reports.income')} value={totals.income} currency={currency} tone="safe" />
            <StatCard
              label={t('reports.spent')}
              value={totals.spent}
              currency={currency}
              tone="danger"
              footnote={
                data.comparison.previousSpent > 0
                  ? t('reports.versusPrevious', {
                      change: formatChange(data.comparison.changePercent),
                      month: data.comparison.previousLabel,
                    })
                  : t('reports.noPrevious')
              }
            />
            <StatCard
              label={t('reports.saved')}
              value={totals.saved}
              currency={currency}
              tone={totals.saved < 0 ? 'danger' : 'brand'}
              footnote={t('reports.savingsRate', { percent: totals.savingsRate })}
            />
            <StatCard
              label={t('reports.transactions')}
              value={totals.transactionCount}
              raw
              tone="neutral"
              footnote={t('reports.dailyAverage', { amount: formatMoney(totals.dailyAverage, currency) })}
            />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('reports.spendingSplit')} subtitle={data.monthLabel} icon={PieIcon} />
              <CategoryPieChart data={data.breakdown} currency={currency} total={totals.spent} />
            </Card>

            <Card>
              <CardHeader title={t('reports.dailySpending')} subtitle={data.monthLabel} icon={TrendingUp} />
              <TrendChart data={data.trend} currency={currency} average={totals.dailyAverage} />
            </Card>
          </section>

          <Card>
            <CardHeader
              title={t('reports.monthVsMonth')}
              subtitle={t('reports.monthAgainst', {
                current: data.monthLabel,
                previous: data.comparison.previousLabel,
              })}
              icon={BarChart3}
              action={
                <Button variant="ghost" size="sm" icon={Table2} onClick={() => setShowTable((open) => !open)}>
                  {showTable ? t('reports.hideTable') : t('reports.tableView')}
                </Button>
              }
            />

            <ComparisonChart
              rows={data.comparison.categories}
              currency={currency}
              currentLabel={data.monthLabel}
              previousLabel={data.comparison.previousLabel}
            />

            {/* The table is the accessible equivalent of the chart above. */}
            {showTable && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th scope="col" className="py-2 pr-3 font-semibold">{t('common.category')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-semibold">{data.comparison.previousLabel}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-semibold">{data.monthLabel}</th>
                      <th scope="col" className="py-2 text-right font-semibold">{t('reports.change')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.comparison.categories.map((row) => (
                      <tr key={row.category}>
                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{label(row.category)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {formatMoney(row.previous, currency)}
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatMoney(row.current, currency)}
                        </td>
                        <td
                          className={cn(
                            'py-2 text-right tabular-nums',
                            row.change > 0 ? 'text-danger' : row.change < 0 ? 'text-safe' : 'text-slate-400'
                          )}
                        >
                          {row.change === 0 ? '-' : formatMoney(row.change, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <section className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('reports.highlights')} />
              <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                <div className="flex justify-between py-2.5 first:pt-0">
                  <dt className="text-slate-600 dark:text-slate-400">{t('reports.biggestCategory')}</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {data.highestCategory
                      ? t('reports.categoryWithAmount', {
                          category: label(data.highestCategory.category),
                          amount: formatMoney(data.highestCategory.amount, currency),
                        })
                      : t('reports.nothingLogged')}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-slate-600 dark:text-slate-400">{t('reports.biggestExpense')}</dt>
                  <dd className="text-right font-semibold text-slate-900 dark:text-slate-100">
                    {data.biggestExpense
                      ? t('reports.amountOnDate', {
                          amount: formatMoney(data.biggestExpense.amount, currency),
                          date: formatCalendarDate(data.biggestExpense.date),
                        })
                      : '-'}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5 last:pb-0">
                  <dt className="text-slate-600 dark:text-slate-400">{t('reports.overBudget')}</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {data.overBudget.length === 0
                      ? t('reports.noneOverBudget')
                      : data.overBudget.map((b) => label(b.category)).join(', ')}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card>
              <CardHeader title={t('reports.incomeSources')} />
              {data.incomeBySource.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t('reports.noIncomeThisMonth')}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  {data.incomeBySource.map((row) => (
                    <li key={row.source} className="flex justify-between py-2.5">
                      <span className="text-slate-600 dark:text-slate-400">{label(row.source, 'income')}</span>
                      <span className="font-semibold tabular-nums text-safe">
                        +{formatMoney(row.amount, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
