import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Wallet } from 'lucide-react';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import PageHeader from '../../../shared/components/ui/PageHeader';
import Modal from '../../../shared/components/ui/Modal';
import Input from '../../../shared/components/ui/Input';
import Select from '../../../shared/components/ui/Select';
import EmptyState from '../../../shared/components/ui/EmptyState';
import ConfirmDialog from '../../../shared/components/ui/ConfirmDialog';
import { SkeletonRows } from '../../../shared/components/ui/Skeleton';
import StatCard from '../../../shared/components/StatCard';
import useAsync from '../../../shared/hooks/useAsync';
import useMutation from '../../../shared/hooks/useMutation';
import { useAuth } from '../../auth';
import incomeService from '../api/incomeApi';
// Default import: contracts is CommonJS and Rollup cannot see named exports on it.
import catalogue from '@hisabkikitab/contracts/catalogue';
import { currencySymbol, formatCalendarDate, formatMoney, toInputDate } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';
import { isSupportedMoney } from '../../../shared/utils/money';

const schema = z.object({
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount' }).positive('Amount must be more than 0')
    .refine((value) => isSupportedMoney(value, { minimumMinor: 1n }), 'Use at most two decimal places'),
  // Validated against the catalogue on the server for the person's mode; here
  // it only has to be one of the ids the form offered.
  source: z.string().min(1),
  note: z.string().max(200).optional(),
  date: z.string().min(1, 'Pick a date'),
});

export default function Income() {
  const { t, language } = useT();
  const { user, currency } = useAuth();
  const mode = user && user.financeMode === 'householder' ? 'householder' : 'student';
  const sources = catalogue.categoryIdsFor('income', mode);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const { saving, run } = useMutation();

  const load = useCallback(() => incomeService.list(), []);
  const { data, loading, error, reload } = useAsync(load, []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { amount: '', source: sources[0], note: '', date: toInputDate(new Date()) },
  });

  const submit = (values) =>
    run(() => incomeService.create(values), {
      success: t('income.added'),
      onDone: () => {
        setFormOpen(false);
        reset({ amount: '', source: 'Pocket Money', note: '', date: toInputDate(new Date()) });
        reload();
      },
    });

  const confirmDelete = () =>
    run(() => incomeService.remove(deleting._id), {
      success: t('income.removed'),
      onDone: () => {
        setDeleting(null);
        reload();
      },
    });

  const items = data ? data.items : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('income.title')}
        subtitle={t(mode === 'householder' ? 'income.subtitleHouseholder' : 'income.subtitleStudent')}
      >
        <Button icon={Plus} onClick={() => setFormOpen(true)}>
          {t('income.add')}
        </Button>
      </PageHeader>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label={t(mode === 'householder' ? 'income.plannedHouseholder' : 'income.plannedStudent')}
          value={user ? user.monthlyIncome : 0}
          currency={currency}
          icon={Wallet}
          tone="brand"
          footnote={t('income.changeInSettings')}
        />
        <StatCard
          label={t('income.totalLogged')}
          value={data ? data.total : 0}
          currency={currency}
          icon={Wallet}
          tone="safe"
          footnote={t('income.entriesRecorded', { count: items.length })}
        />
      </section>

      <Card>
        <CardHeader title={t('income.history')} icon={Wallet} />

        {loading && !data ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <EmptyState icon={Wallet} title={t('income.loadFailed')} message={error} actionLabel={t('common.retry')} onAction={reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={t('income.empty')}
            message={t('income.emptyMessage')}
            actionLabel={t('income.add')}
            actionIcon={Plus}
            onAction={() => setFormOpen(true)}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((entry) => (
              <li key={entry._id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-safe/10 text-safe dark:bg-safe/15">
                  <Wallet className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.source}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatCalendarDate(entry.date)}
                    {entry.note ? ` \u00B7 ${entry.note}` : ''}
                  </p>
                </div>

                <span className="shrink-0 text-sm font-bold tabular-nums text-safe">
                  +{formatMoney(entry.amount, currency)}
                </span>

                <button
                  type="button"
                  onClick={() => setDeleting(entry)}
                  aria-label={`Delete ${entry.source} income`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-danger/10 hover:text-danger dark:hover:bg-danger/15"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={t('income.add')} size="sm">
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Input
            label={t('common.amount')}
            type="number"
            inputMode="decimal"
            placeholder="0"
            autoFocus
            prefix={currencySymbol(currency)}
            error={errors.amount && errors.amount.message}
            {...register('amount')}
          />

          <Select
            label={t('income.source')}
            options={sources.map((id) => ({ value: id, label: catalogue.labelFor('income', mode, id, language) }))}
            error={errors.source && errors.source.message}
            {...register('source')}
          />

          <Input
            label={t('income.noteOptional')}
            placeholder={t(mode === 'householder' ? 'income.notePlaceholderHouseholder' : 'income.notePlaceholderStudent')}
            {...register('note')}
          />

          <Input
            label={t('common.date')}
            type="date"
            max={toInputDate(new Date())}
            error={errors.date && errors.date.message}
            {...register('date')}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {t('income.add')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={saving}
        title={t('income.deleteTitle')}
        message={
          deleting
            ? t('income.deleteMessage', {
                amount: formatMoney(deleting.amount, currency),
                source: catalogue.labelFor('income', mode, deleting.source, language),
              })
            : ''
        }
      />
    </div>
  );
}
