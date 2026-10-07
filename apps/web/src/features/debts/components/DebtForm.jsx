import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Input from '../../../shared/components/ui/Input';
import Select from '../../../shared/components/ui/Select';
import Textarea from '../../../shared/components/ui/Textarea';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import useCategories from '../../../shared/hooks/useCategories';
import useT from '../../../shared/i18n/I18nProvider';
// Default import: the contracts package is CommonJS, and Rollup cannot prove a
// named export exists on it at build time.
import catalogue from '@hisabkikitab/contracts/catalogue';
import { cn, currencySymbol, toInputDate } from '../../../shared/utils/format';
import useAsync from '../../../shared/hooks/useAsync';
import useDebounce from '../../../shared/hooks/useDebounce';
import debtsApi from '../api/debtsApi';

const PURPOSES = catalogue.idsOf('udhaarPurpose');

const schema = z.object({
  kind: z.enum(['BORROWED', 'LENT']),
  contactId: z.string().optional(),
  personName: z.string().max(80),
  originalAmount: z.coerce
    .number({ invalid_type_error: 'Enter an amount' })
    .positive('Amount must be more than zero'),
  transactionDate: z.string().min(1, 'When was this?'),
  dueDate: z.string().optional(),
  personContact: z.string().max(120).optional(),
  category: z.string().optional(),
  purpose: z.string().max(300, 'Keep it under 300 characters').optional(),
  purposeCategory: z.string().optional(),
  note: z.string().max(500).optional(),
})
  // "Other" is not a reason. Whoever files a debt under it has to say what it
  // actually was, or the record means nothing when they come back to it.
  .refine(
    (v) => !catalogue.listRequiresNote('udhaarPurpose', v.purposeCategory) || Boolean((v.purpose || '').trim()),
    { path: ['purpose'], message: 'Please say a little more' }
  ).refine((v) => Boolean(v.contactId) !== Boolean(v.personName.trim()),
    { path: ['personName'], message: 'Choose a contact or enter a new name' });

/** yyyy-mm-dd, which is what a date input wants. */
const asDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

/**
 * Add or correct a record.
 *
 * The direction is a pair of buttons rather than a dropdown, because it is the
 * first decision and the one most likely to be got wrong: "I borrowed" and "I
 * lent" read as sentences, where a select labelled "type" does not.
 *
 * The amount is not editable below what has already been paid - the server
 * refuses it - so the hint says so before the student tries.
 */
export default function DebtForm({ open, onClose, onSubmit, debt = null, currency = 'PKR', defaultKind = 'BORROWED' }) {
  const { categories } = useCategories();
  const editing = Boolean(debt);
  const [contactSearch, setContactSearch] = useState('');
  const [contactPage, setContactPage] = useState(1);
  const debouncedContactSearch = useDebounce(contactSearch, 250);
  const { data: contactResult, loading: contactsLoading } = useAsync(
    () => editing ? Promise.resolve({ items: [] }) : debtsApi.contacts({ search: debouncedContactSearch, page: contactPage }),
    [editing, debouncedContactSearch, contactPage],
  );
  const contacts = contactResult?.items || [];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: debt?.kind || defaultKind,
      contactId: '',
      personName: debt?.personName || '',
      originalAmount: debt?.originalAmount ?? '',
      transactionDate: asDateInput(debt?.transactionDate) || toInputDate(new Date()),
      dueDate: asDateInput(debt?.dueDate),
      personContact: debt?.personContact || '',
      category: debt?.category || '',
      purpose: debt?.purpose || '',
      purposeCategory: debt?.purposeCategory || '',
      note: debt?.note || '',
    },
  });

  const kind = watch('kind');
  const contactId = watch('contactId');
  const { t, language } = useT();

  const submit = (values) => {
    const payload = {
      ...values,
      dueDate: values.dueDate || null,
      category: values.category || null,
      purpose: values.purpose || null,
      purposeCategory: values.purposeCategory || null,
    };
    if (editing || !values.contactId) delete payload.contactId;
    else delete payload.personName;
    return onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('udhaar.editRecord') : t('udhaar.addToUdhaar')}
      size="md"
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <fieldset>
          <legend className="hw-label mb-2">{t('udhaar.whichWay')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'BORROWED', label: t('udhaar.borrowedOption'), hint: t('udhaar.borrowedHint') },
              { value: 'LENT', label: t('udhaar.lentOption'), hint: t('udhaar.lentHint') },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setValue('kind', option.value, { shouldValidate: true })}
                aria-pressed={kind === option.value}
                className={cn(
                  'rounded-xl border p-3 text-left transition',
                  kind === option.value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                    : 'border-slate-200 hover:border-brand-300 dark:border-slate-800'
                )}
              >
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
          <input type="hidden" {...register('kind')} />
        </fieldset>

        {!editing && <div className="space-y-3">
          <Input label={t('udhaar.findContact')} value={contactSearch}
            onChange={(event) => { setContactSearch(event.target.value); setContactPage(1); setValue('contactId', ''); }} />
          <Select label={t('udhaar.chooseContact')} hint={contactsLoading ? t('common.loading') : undefined}
            options={[{ value: '', label: t('udhaar.newContact') },
              ...contacts.map((contact) => ({ value: contact.id,
                label: `${contact.displayName}${contact.contactInfo ? ` · ${contact.contactInfo}` : ''} · ${t('udhaar.contactRef')} ${contact.id.slice(-6)}` }))]}
            {...register('contactId', { onChange: (event) => {
              if (event.target.value) setValue('personName', '', { shouldValidate: true });
            } })} />
          {(contactResult?.hasPrev || contactResult?.hasNext) && <div className="flex items-center justify-between gap-2 text-sm">
            <Button variant="outline" disabled={!contactResult.hasPrev} onClick={() => { setContactPage((page) => page - 1); setValue('contactId', ''); }}>{t('common.previous')}</Button>
            <span>{contactPage}</span>
            <Button variant="outline" disabled={!contactResult.hasNext} onClick={() => { setContactPage((page) => page + 1); setValue('contactId', ''); }}>{t('common.next')}</Button>
          </div>}
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          {(!contactId || editing) && <Input
            label={kind === 'BORROWED' ? t('udhaar.whoLentToYou') : t('udhaar.whoDidYouLendTo')}
            placeholder={t('udhaar.personPlaceholder')}
            hint={editing ? t('udhaar.renameContactHint') : undefined}
            error={errors.personName && errors.personName.message}
            {...register('personName')}
          />}
          <Input
            label={t('common.amount')}
            type="number"
            inputMode="decimal"
            step="0.01"
            prefix={currencySymbol(currency)}
            hint={editing ? 'Cannot go below what is already paid' : undefined}
            error={errors.originalAmount && errors.originalAmount.message}
            {...register('originalAmount')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('udhaar.transactionDate')}
            type="date"
            error={errors.transactionDate && errors.transactionDate.message}
            {...register('transactionDate')}
          />
          <Input
            label={t('udhaar.dueDate')}
            type="date"
            hint={t('udhaar.dueDateHint')}
            {...register('dueDate')}
          />
        </div>

        <details open={editing || Boolean(errors.purpose)} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">{t('udhaar.optionalDetails')}</summary>
          <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('udhaar.personContact')}
            placeholder={t('common.optional')}
            {...register('personContact')}
          />
          <Select
            label={t('common.category')}
            options={[
              { value: '', label: t('common.none') },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
            {...register('category')}
          />
        </div>

        {/* What the money was for. Six months on this is the difference
            between a record and a name with a number next to it. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t('udhaar.purposeCategory')}
            options={[
              { value: '', label: t('common.none') },
              ...PURPOSES.map((id) => ({ value: id, label: catalogue.lookup('udhaarPurpose', id, language) })),
            ]}
            {...register('purposeCategory')}
          />
          <Input
            label={t('udhaar.purpose')}
            placeholder={t('common.optional')}
            error={errors.purpose && errors.purpose.message}
            {...register('purpose')}
          />
        </div>

        <Textarea
          label={t('common.note')}
          rows={2}
          placeholder={t('udhaar.notePlaceholder')}
          {...register('note')}
        />

          </div>
        </details>

        <div className="flex justify-end gap-2 pt-1 [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {editing ? t('udhaar.saveChanges') : t('udhaar.addRecord')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
