import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import useT from '../../../shared/i18n/I18nProvider';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#f97316', '#6366f1'];

export default function SharedDashboard({ space, month, data, writable, format, categoryLabel, onAddExpense, onAddPayment, onOpenBills, onOpenMembers, onDownload }) {
  const { t } = useT();
  const summary = data.summary;
  const categories = summary.categories
    .map((category) => ({ name: categoryLabel(category.category_id), value: Number(category.amount) }))
    .filter((category) => category.value > 0);
  const metrics = [
    ['spent', summary.spent],
    ['collected', summary.collected],
    ['totalPaid', summary.totalPaid],
    ['settlementOutstanding', summary.settlementOutstanding],
  ];

  return <div className="space-y-4">
    <Card className="!p-4 sm:!p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{space.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{month} · {summary.activeMembers} {t('shared.activeMembers').toLowerCase()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {writable && (summary.activeMembers > 0
            ? <Button onClick={onAddExpense}>{t('shared.add_expenses')}</Button>
            : <Button onClick={onOpenMembers}>{t('shared.addMember')}</Button>)}
          {writable && summary.activeMembers > 0 && <Button variant="secondary" onClick={onAddPayment}>{t('shared.add_payments')}</Button>}
          <Button variant="secondary" onClick={onOpenBills}>{t('shared.bills')}</Button>
        </div>
      </div>
    </Card>

    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {metrics.map(([key, value]) => <Card key={key} className="!p-3 sm:!p-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t(`shared.${key}`)}</p>
        <p className="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl">{format(value)}</p>
      </Card>)}
    </div>

    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <Card className="!p-4 sm:!p-5">
        <h2 className="font-semibold">{t('shared.categoryBreakdown')}</h2>
        {categories.length ? <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row">
          <div className="h-44 w-full max-w-52 shrink-0" role="img" aria-label={t('shared.categoryBreakdown')}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={categories} dataKey="value" nameKey="name" innerRadius={47} outerRadius={72} strokeWidth={2}>
                {categories.map((category, index) => <Cell key={category.name} fill={COLORS[index % COLORS.length]} />)}
              </Pie><Tooltip formatter={(value) => format(value)} /></PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full space-y-1.5 text-sm">
            {categories.map((category, index) => <li key={category.name} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{category.name}</span>
              <span className="shrink-0 font-medium tabular-nums">{format(category.value)}</span>
            </li>)}
          </ul>
        </div> : <p className="mt-3 text-sm text-slate-500">{t('shared.empty')}</p>}
      </Card>
      <Card className="!p-4 sm:!p-5">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{t('shared.monthAtGlance')}</h2><Button variant="secondary" onClick={onDownload}>{t('shared.downloadReport')}</Button></div>
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex justify-between gap-3"><span>{t('shared.spent')}</span><strong>{format(summary.spent)}</strong></p>
          <p className="flex justify-between gap-3"><span>{t('shared.totalPaid')}</span><strong>{format(summary.totalPaid)}</strong></p>
          <p className="flex justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700"><span>{t('shared.settlementOutstanding')}</span><strong>{format(summary.settlementOutstanding)}</strong></p>
        </div>
        {Number(summary.unallocated) > 0 && <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-300">{t('shared.pendingSplitAmount')}: {format(summary.unallocated)}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onOpenMembers}>{t('shared.members')}</Button>
          <Button variant="secondary" onClick={onOpenBills}>{t('shared.bills')}</Button>
        </div>
      </Card>
    </div>
  </div>;
}
