import { useState } from 'react';
import { Ban, CalendarClock, Check, Phone, Pencil, Trash2, Undo2 } from 'lucide-react';
import Modal from '../../../shared/components/ui/Modal';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import ProgressBar from '../../../shared/components/ui/ProgressBar';
import EmptyState from '../../../shared/components/ui/EmptyState';
import { KindBadge, StatusBadge } from './DebtBadges';
import { progressPercent } from '../utils/debtDisplay';
import useT from '../../../shared/i18n/I18nProvider';
// Default import: contracts is CommonJS and Rollup cannot see named exports on it.
import catalogue from '@hisabkikitab/contracts/catalogue';
import { cn, formatMoney, formatDate, currencySymbol } from '../../../shared/utils/format';

/**
 * One record, in full: what is left, how it got there, and what can be done
 * about it.
 *
 * The payment history is the point. A single "paid so far" figure is a number
 * a student has to trust; a list of dated payments is one they can check.
 */
export default function DebtDetail({
  open,
  onClose,
  debt,
  payments = [],
  currency = 'PKR',
  busy = false,
  readOnly = false,
  onAddPayment,
  onSettle,
  onEdit,
  onDelete,
  onCancel,
  onRemovePayment,
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const { t, language } = useT();

  if (!debt) return null;

  const settled = debt.status === 'SETTLED';
  const cancelled = debt.status === 'CANCELLED';
  const percent = progressPercent(debt);

  const submitPayment = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    await onAddPayment({ amount: value, note });
    setAmount('');
    setNote('');
  };

  return (
    <Modal open={open} onClose={onClose} title={debt.personName} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={debt.kind} />
          <StatusBadge debt={debt} />
          {debt.category && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {debt.category}
            </span>
          )}
        </div>

        {/* What is left, and how far along */}
        <div className="hw-card p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {settled ? 'Fully settled' : 'Still outstanding'}
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100">
                {formatMoney(debt.remainingAmount, currency)}
              </p>
            </div>
            <p className="text-right text-xs text-slate-500 dark:text-slate-400">
              {formatMoney(debt.paidAmount, currency)} paid
              <br />
              of {formatMoney(debt.originalAmount, currency)}
            </p>
          </div>
          <div className="mt-3">
            <ProgressBar value={percent} tone={settled ? 'safe' : 'brand'} />
          </div>
        </div>

        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('udhaar.transactionDate')}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">
              {formatDate(debt.transactionDate)}
            </dd>
          </div>
          {debt.dueDate && (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Due</dt>
              <dd
                className={cn(
                  'flex items-center gap-1.5 font-medium',
                  debt.isOverdue ? 'text-danger' : 'text-slate-800 dark:text-slate-200'
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(debt.dueDate)}
                {debt.isOverdue && ' - overdue'}
              </dd>
            </div>
          )}
          {debt.personContact && (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Contact</dt>
              <dd className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {debt.personContact}
              </dd>
            </div>
          )}
          {/* The purpose sits above the note and spans the row: it is the
              thing that makes the record still mean something months later. */}
          {(debt.purpose || debt.purposeCategory) && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">{t('udhaar.purpose')}</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">
                <span dir="auto">{debt.purpose}</span>
                {debt.purpose && debt.purposeCategory ? ' - ' : ''}
                {debt.purposeCategory
                  ? catalogue.lookup('udhaarPurpose', debt.purposeCategory, language)
                  : ''}
              </dd>
            </div>
          )}
          {debt.note && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">Note</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">{debt.note}</dd>
            </div>
          )}
        </dl>

        {/* Recording a payment */}
        {/* A cancelled record takes no more payments: it stopped counting. */}
        {!readOnly && !settled && !cancelled && (
          <div className="hw-card space-y-3 p-4">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {debt.kind === 'BORROWED' ? 'Record a repayment' : 'Record money received'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                prefix={currencySymbol(currency)}
                placeholder={String(debt.remainingAmount)}
                hint={`${formatMoney(debt.remainingAmount, currency)} left`}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <Input
                label="Note"
                placeholder="Optional"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" icon={Check} loading={busy} onClick={onSettle}>
                Settle the full {formatMoney(debt.remainingAmount, currency)}
              </Button>
              <Button loading={busy} disabled={!Number(amount)} onClick={submitPayment}>
                Add payment
              </Button>
            </div>
          </div>
        )}

        {/* The ledger */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Payment history
          </p>
          {payments.length === 0 ? (
            <EmptyState
              title={t('udhaar.nothingPaidYet')}
              message={t('udhaar.everyPaymentListed')}
            />
          ) : (
            <ul className="space-y-1.5">
              {payments.map((payment) => (
                <li
                  key={payment._id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                      {formatMoney(payment.amount, currency)}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDate(payment.paidOn)}
                      {payment.note ? ` - ${payment.note}` : ''}
                    </p>
                  </div>
                  {!readOnly && <button
                    type="button"
                    onClick={() => onRemovePayment(payment)}
                    aria-label={`Undo the payment of ${formatMoney(payment.amount, currency)}`}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-danger dark:hover:bg-slate-800"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                  </button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {!readOnly && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Button variant="ghost" icon={Pencil} onClick={onEdit}>
            Edit
          </Button>
          {/* Cancel sits next to Delete deliberately, so the gentler option is
              seen first: this one keeps the record and the ledger, and only
              stops it counting. A settled debt is finished and has nothing to
              cancel. */}
          {!settled && !cancelled && (
            <Button variant="outline" icon={Ban} onClick={onCancel}>
              Cancel this record
            </Button>
          )}
          <Button variant="danger" icon={Trash2} onClick={onDelete}>
            Delete
          </Button>
        </div>}
      </div>
    </Modal>
  );
}
