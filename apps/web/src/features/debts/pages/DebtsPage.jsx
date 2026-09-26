import { useCallback, useState } from 'react';
import { Plus, HandCoins } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../../shared/components/ui/PageHeader';
import Button from '../../../shared/components/ui/Button';
import Skeleton from '../../../shared/components/ui/Skeleton';
import EmptyState from '../../../shared/components/ui/EmptyState';
import ConfirmDialog from '../../../shared/components/ui/ConfirmDialog';
import useAsync from '../../../shared/hooks/useAsync';
import useMutation from '../../../shared/hooks/useMutation';
import useDebounce from '../../../shared/hooks/useDebounce';
import useT from '../../../shared/i18n/I18nProvider';
import { useAuth } from '../../auth';
import debtsApi from '../api/debtsApi';
import DebtFilters from '../components/DebtFilters';
import DebtRow from '../components/DebtRow';
import DebtForm from '../components/DebtForm';
import DebtDetail from '../components/DebtDetail';

/** Still-open records first: a settled debt is history, not a to-do. */
const DEFAULT_FILTERS = { kind: 'LENT', status: 'OUTSTANDING', sort: 'newest', search: '', page: 1 };

/**
 * Udhaar: who owes whom.
 *
 * The page holds the state and decides what an action means; the cards, the
 * filters, the rows and the two dialogs only render. Every figure on screen -
 * remaining, status, the four totals - is computed by the server, because a
 * balance worked out in two places is a balance that will eventually disagree
 * with itself.
 */
export default function DebtsPage() {
  const { currency } = useAuth();
  const { t } = useT();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // Typing in the search box should not fire a request per keystroke.
  const search = useDebounce(filters.search, 350);
  const query = { ...filters, search };

  const {
    data: list,
    loading: listLoading,
    error: listError,
    reload: refreshList,
  } = useAsync(() => debtsApi.list(query), [JSON.stringify(query)]);

  const {
    data: summary,
    loading: summaryLoading,
    reload: refreshSummary,
  } = useAsync(() => debtsApi.summary(), []);

  const {
    data: detail,
    loading: detailLoading,
    reload: refreshDetail,
  } = useAsync(() => (openId ? debtsApi.get(openId) : Promise.resolve(null)), [openId]);

  const { saving, run } = useMutation();

  /** Any write can move a balance, so both the list and the totals reload. */
  const refreshAll = useCallback(() => {
    refreshList();
    refreshSummary();
    if (openId) refreshDetail();
  }, [refreshList, refreshSummary, refreshDetail, openId]);

  const saveRecord = (values) =>
    run(() => (editing ? debtsApi.update(editing._id, values) : debtsApi.create(values)), {
      success: editing ? 'Record updated' : 'Added to your udhaar',
      onDone: () => {
        setFormOpen(false);
        setEditing(null);
        refreshAll();
      },
    });

  const addPayment = (payload) =>
    run(() => debtsApi.addPayment(openId, payload), {
      success: 'Payment recorded',
      onDone: (result) => {
        if (result.justSettled) toast.success(`Settled with ${result.debt.personName}`);
        refreshAll();
      },
    });

  const settleFull = () =>
    run(() => debtsApi.settle(openId), { success: 'Settled in full', onDone: refreshAll });

  const undoPayment = (payment) =>
    setConfirm({
      title: 'Undo this payment?',
      message: 'The amount goes back onto the outstanding balance. The record may reopen.',
      confirmLabel: 'Undo payment',
      onConfirm: () =>
        run(() => debtsApi.removePayment(openId, payment._id), {
          success: 'Payment removed',
          onDone: refreshAll,
        }),
    });

  /**
   * Cancelling is confirmed like deleting, but the wording has to carry the
   * difference: this one keeps everything and only stops the record counting.
   * Somebody reaching for Delete because they did not realise Cancel exists is
   * the outcome to avoid.
   */
  const cancelRecord = () =>
    setConfirm({
      title: 'Cancel this record?',
      message:
        'It stops counting towards what you owe or are owed. The record and its payment history stay, and you can still read them.',
      confirmLabel: 'Cancel record',
      onConfirm: () =>
        run(() => debtsApi.cancel(openId), {
          success: 'Record cancelled',
          onDone: refreshAll,
        }),
    });

  const deleteRecord = () =>
    setConfirm({
      title: 'Delete this record?',
      message: 'The record and its whole payment history are removed. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () =>
        run(() => debtsApi.remove(openId), {
          success: 'Record deleted',
          onDone: () => {
            setOpenId(null);
            refreshAll();
          },
        }),
    });

  const items = list?.items || [];
  const pagination = list?.pagination;

  return (
    <div className="space-y-5">
      <PageHeader title={t('udhaar.title')} subtitle={t('udhaar.subtitle')}>
        <Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true); }}>
          {t('udhaar.addRecord')}
        </Button>
      </PageHeader>

      <DebtFilters filters={filters} onChange={setFilters} summary={summary} currency={currency} loading={summaryLoading} />

      {listError ? (
        <EmptyState
          icon={HandCoins}
          title={t('udhaar.loadFailed')}
          message={listError}
          actionLabel={t('common.retry')}
          onAction={refreshList}
        />
      ) : listLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[92px] rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={filters.search ? t('udhaar.empty.noMatch') : t('udhaar.empty.title')}
          message={
            filters.search ? t('udhaar.empty.tryDifferent') : t('udhaar.empty.message')
          }
          actionLabel={filters.search ? undefined : t('udhaar.empty.action')}
          actionIcon={Plus}
          onAction={filters.search ? undefined : () => { setEditing(null); setFormOpen(true); }}
        />
      ) : (
        <div className="space-y-2">
          {items.map((debt) => (
            <DebtRow key={debt._id} debt={debt} currency={currency} onOpen={() => setOpenId(debt._id)} />
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Page {pagination.page} of {pagination.pages} - {pagination.total} record(s)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!pagination.hasPrev}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!pagination.hasNext}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {formOpen && <DebtForm
        defaultKind={filters.kind}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={saveRecord}
        debt={editing}
        currency={currency}
      />}

      <DebtDetail
        open={Boolean(openId) && !detailLoading}
        onClose={() => setOpenId(null)}
        debt={detail?.debt}
        payments={detail?.payments || []}
        currency={currency}
        busy={saving}
        onAddPayment={addPayment}
        onSettle={settleFull}
        onEdit={() => { setEditing(detail.debt); setOpenId(null); setFormOpen(true); }}
        onDelete={deleteRecord}
        onCancel={cancelRecord}
        onRemovePayment={undoPayment}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.danger ? 'danger' : 'primary'}
        loading={saving}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await confirm.onConfirm();
          setConfirm(null);
        }}
      />
    </div>
  );
}
