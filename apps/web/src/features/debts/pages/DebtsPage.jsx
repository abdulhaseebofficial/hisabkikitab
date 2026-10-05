import { useCallback, useState } from 'react';
import { Plus, HandCoins, ChevronDown, Search } from 'lucide-react';
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
import DebtForm from '../components/DebtForm';
import DebtDetail from '../components/DebtDetail';
import { formatMoney, formatDate } from '../../../shared/utils/format';

/** Still-open records first: a settled debt is history, not a to-do. */
const DEFAULT_FILTERS = { search: '', page: 1 };

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
  const [openPerson, setOpenPerson] = useState('');
  const [recordPage, setRecordPage] = useState(1);
  const [confirm, setConfirm] = useState(null);

  // Typing in the search box should not fire a request per keystroke.
  const search = useDebounce(filters.search, 350);
  const query = { ...filters, search };

  const {
    data: list,
    loading: listLoading,
    error: listError,
    reload: refreshList,
  } = useAsync(() => debtsApi.people(query), [JSON.stringify(query)]);

  const { data: personRecords, loading: recordsLoading, reload: refreshRecords } =
    useAsync(() => openPerson
      ? debtsApi.personRecords({ contactId: openPerson, page: recordPage })
      : Promise.resolve(null), [openPerson, recordPage]);

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
    refreshRecords();
    refreshSummary();
    if (openId) refreshDetail();
  }, [refreshList, refreshRecords, refreshSummary, refreshDetail, openId]);

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

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="hw-card p-3"><p className="text-xs text-slate-500 dark:text-slate-400">{t('udhaar.collectSection')}</p><p className="text-lg font-bold tabular-nums">{summaryLoading ? '...' : formatMoney(summary?.receivable || 0, currency)}</p></div>
        <div className="hw-card p-3"><p className="text-xs text-slate-500 dark:text-slate-400">{t('udhaar.paySection')}</p><p className="text-lg font-bold tabular-nums">{summaryLoading ? '...' : formatMoney(summary?.payable || 0, currency)}</p></div>
      </div>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" className="hw-input pl-9" value={filters.search} placeholder={t('udhaar.searchPlaceholder')}
          aria-label={t('udhaar.filters.person')} onChange={(event) => setFilters({ search: event.target.value, page: 1 })} />
      </div>

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
          {items.map((person) => (
            <div key={person.key} className="hw-card overflow-hidden p-3 sm:p-4">
              <button type="button" className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={openPerson === person.key}
                onClick={() => { setOpenPerson(openPerson === person.key ? '' : person.key); setRecordPage(1); }}>
                <span className="min-w-0"><strong className="block truncate">{person.name}</strong><span className="text-xs text-slate-500 dark:text-slate-400">{person.recordCount} {t('udhaar.records')} · {person.contactInfo ? `${person.contactInfo} · ` : ''}{t('udhaar.contactRef')} {person.contactId?.slice(-6)}</span></span>
                <span className="flex shrink-0 items-center gap-2 text-right"><span className="text-sm font-semibold tabular-nums">{person.netBalance > 0 ? t('udhaar.personOwesYou') : person.netBalance < 0 ? t('udhaar.youOwePerson') : t('udhaar.settled')}: {formatMoney(Math.abs(person.netBalance), currency)}</span><ChevronDown className="h-4 w-4" /></span>
              </button>
              {openPerson === person.key && <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                {recordsLoading ? <Skeleton className="h-16" /> : (personRecords?.items || []).map((debt) =>
                  <button key={debt._id} type="button" onClick={() => setOpenId(debt._id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2 text-left text-sm hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700">
                    <span><strong>{debt.kind === 'BORROWED' ? t('udhaar.borrowedFrom') : t('udhaar.lentTo')}</strong><span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{formatDate(debt.transactionDate)}</span></span>
                    <span className="font-semibold tabular-nums">{formatMoney(debt.originalAmount, currency)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">({formatMoney(debt.remainingAmount, currency)} {t('udhaar.remaining')})</span></span>
                  </button>)}
                {personRecords?.pagination?.pages > 1 && <div className="flex items-center justify-between gap-2 text-sm"><span>{recordPage} / {personRecords.pagination.pages}</span><div className="flex gap-2"><Button variant="outline" disabled={!personRecords.pagination.hasPrev} onClick={() => setRecordPage((n) => n - 1)}>{t('common.previous')}</Button><Button variant="outline" disabled={!personRecords.pagination.hasNext} onClick={() => setRecordPage((n) => n + 1)}>{t('common.next')}</Button></div></div>}
              </div>}
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Page {pagination.page} of {pagination.pages} - {pagination.total} people
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
        defaultKind="LENT"
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
