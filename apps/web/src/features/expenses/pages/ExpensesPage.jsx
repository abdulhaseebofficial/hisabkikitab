import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Receipt, X } from 'lucide-react';
import Button from '../../../shared/components/ui/Button';
import PageHeader from '../../../shared/components/ui/PageHeader';
import Modal from '../../../shared/components/ui/Modal';
import ConfirmDialog from '../../../shared/components/ui/ConfirmDialog';
import EmptyState from '../../../shared/components/ui/EmptyState';
import { SkeletonRows } from '../../../shared/components/ui/Skeleton';
import ExpenseForm from '../components/ExpenseForm';
import ExpenseItem from '../components/ExpenseItem';
import ExpenseFilters, { presetRange } from '../components/ExpenseFilters';
import useAsync from '../../../shared/hooks/useAsync';
import useDebounce from '../../../shared/hooks/useDebounce';
import useCategories from '../../../shared/hooks/useCategories';
import useMutation from '../../../shared/hooks/useMutation';
import useQuickAdd from '../../../shared/hooks/useQuickAdd';
import { useAuth } from '../../auth';
import expenseService from '../api/expensesApi';
import { formatMoney } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';

const INITIAL_FILTERS = {
  search: '',
  category: '',
  paymentMethod: '',
  minAmount: '',
  maxAmount: '',
  preset: 'month',
  ...presetRange('month'),
  page: 1,
  limit: 20,
};

export default function Expenses() {
  const { t } = useT();
  const { user, currency } = useAuth();
  const readOnly = Boolean(user?.isDemo);
  const { categories } = useCategories();
  // The shell owns the add-an-expense dialog. Using it here rather than a
  // second copy is what lets the button honestly advertise the N shortcut:
  // the key and the click now run the same function.
  const { open: openQuickAdd, canCreate } = useQuickAdd();

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { saving, run } = useMutation();

  // The search box types fast; the API should not.
  const debouncedSearch = useDebounce(filters.search, 400);

  const query = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      category: filters.category || undefined,
      paymentMethod: filters.paymentMethod || undefined,
      minAmount: filters.minAmount || undefined,
      maxAmount: filters.maxAmount || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page: filters.page,
      limit: filters.limit,
    }),
    [debouncedSearch, filters]
  );

  const load = useCallback(() => expenseService.list(query), [query]);
  const { data, loading, error, reload } = useAsync(load, [query]);

  const submit = (values) =>
    run(() => (editing ? expenseService.update(editing._id, values) : expenseService.create(values)), {
      success: editing ? t('expenses.updated') : t('expenses.added'),
      onDone: () => {
        setFormOpen(false);
        setEditing(null);
        reload();
      },
    });

  const confirmDelete = () =>
    run(() => expenseService.remove(deleting._id), {
      success: t('expenses.deleted'),
      onDone: () => {
        setDeleting(null);
        reload();
      },
    });

  const openEdit = (expense) => {
    setEditing(expense);
    setFormOpen(true);
  };

  const items = data ? data.items : [];
  const pagination = data ? data.pagination : null;

  // True when the list is narrowed by anything the student chose, so an empty
  // result can be explained rather than looking like lost data.
  const filtered = Boolean(
    filters.search ||
      filters.category ||
      filters.paymentMethod ||
      filters.minAmount ||
      filters.maxAmount ||
      filters.preset !== 'month'
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('expenses.title')}
        subtitle={
          data
            ? t('expenses.subtitle', {
                amount: formatMoney(data.filteredTotal, currency),
                count: pagination.total,
              })
            : undefined
        }
      >
        {/* The tab bar's raised button already covers this on a phone. */}
        {canCreate && (
          <Button icon={Plus} shortcut="N" onClick={openQuickAdd} className="hidden sm:inline-flex">
            {t('expenses.add')}
          </Button>
        )}
      </PageHeader>

      <ExpenseFilters
        filters={filters}
        categories={categories}
        resultCount={pagination ? pagination.total : undefined}
        onChange={setFilters}
        onReset={() => setFilters(INITIAL_FILTERS)}
      />

      {loading && !data ? (
        <SkeletonRows count={6} />
      ) : error ? (
        <EmptyState icon={Receipt} title={t('expenses.loadFailed')} message={error} actionLabel={t('common.retry')} onAction={reload} />
      ) : items.length === 0 ? (
        // When a filter is what emptied the list, the useful button is the one
        // that puts the expenses back, not one that adds another.
        filtered ? (
          <EmptyState
            icon={Receipt}
            title={t('expenses.noMatch')}
            message={t('expenses.noMatchMessage')}
            actionLabel={t('expenses.clearFilters')}
            actionIcon={X}
            onAction={() => setFilters(INITIAL_FILTERS)}
          />
        ) : (
          <EmptyState
            icon={Receipt}
            title={t('expenses.empty')}
            message={t('expenses.emptyMessage')}
            actionLabel={t('expenses.add')}
            actionIcon={Plus}
            onAction={openQuickAdd}
          />
        )
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((expense) => (
              <ExpenseItem
                key={expense._id}
                expense={expense}
                currency={currency}
                onEdit={readOnly ? undefined : openEdit}
                onDelete={readOnly ? undefined : setDeleting}
              />
            ))}
          </ul>

          {pagination.pages > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-1" aria-label="Pagination">
              <Button
                variant="outline"
                size="sm"
                icon={ChevronLeft}
                disabled={!pagination.hasPrev}
                onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
              >
                Previous
              </Button>

              <span className="text-xs text-slate-500 dark:text-slate-400">
                Page {pagination.page} of {pagination.pages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasNext}
                onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? t('expenses.edit') : t('expenses.addTitle')}
        size="md"
      >
        <ExpenseForm
          expense={editing}
          categories={categories}
          currency={currency}
          onSubmit={submit}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          submitting={saving}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={saving}
        title={t('expenses.deleteTitle')}
        message={
          deleting
            ? t('expenses.deleteMessage', {
                what: deleting.description || deleting.category,
                amount: formatMoney(deleting.amount, currency),
              })
            : ''
        }
      />
    </div>
  );
}
