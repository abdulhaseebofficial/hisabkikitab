import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import useT from '../../../shared/i18n/I18nProvider';

const money = (minor) => (Number(minor) / 100).toFixed(2);

export default function SharedExpensesList({ rows, writable, categoryLabel, format, onAdd, onEdit, onRemove }) {
  const { t } = useT();
  return <div className="space-y-3">
    {writable && <Button onClick={onAdd}>{t('shared.add_expenses')}</Button>}
    {!rows.length ? <Card><p className="text-sm text-slate-500">{t('shared.emptyFoodHint')}</p></Card> :
      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-canvas-darkCard">
        {[...rows].reverse().map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3 sm:px-4">
          <div className="min-w-0">
            <p className="font-medium">{categoryLabel(row.category_id)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{row.date}{row.note ? ` · ${row.note}` : ''}</p>
            {row.split_pending && <p className="text-xs text-amber-700 dark:text-amber-300">{t('shared.later')}</p>}
          </div>
          <div className="flex items-center gap-2">
            <strong className="tabular-nums">{format(money(row.amount_minor))}</strong>
            {writable && <><Button variant="secondary" onClick={() => onEdit(row)}>{t('shared.edit')}</Button><Button variant="secondary" onClick={() => onRemove(row)}>{t('shared.remove')}</Button></>}
          </div>
        </div>)}
      </div>}
  </div>;
}
