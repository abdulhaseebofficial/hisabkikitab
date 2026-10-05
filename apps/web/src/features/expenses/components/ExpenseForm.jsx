import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Input from '../../../shared/components/ui/Input';
import Select from '../../../shared/components/ui/Select';
import Button from '../../../shared/components/ui/Button';
import { PAYMENT_METHODS, RECURRING_FREQUENCIES, categoryColor, categoryEmoji } from '../../../shared/utils/constants';
import { cn, currencySymbol, formatMoney, toInputDate } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';
import { useAuth } from '../../auth';
import { sumMoney, toMinor } from '../../../shared/utils/money';

// Mirrors the backend validators so the student is told about a bad value
// before a request is even sent.
const schema = z.object({
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount' }).positive('Amount must be more than 0')
    .refine((value) => { try { return toMinor(value) <= 99999999999999n; } catch { return false; } }, 'Use at most two decimal places'),
  category: z.string().min(1, 'Pick a category'),
  description: z.string().max(200, 'Keep it under 200 characters').optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  date: z.string().min(1, 'Pick a date'),
  isRecurring: z.boolean().optional(),
  recurringFrequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
});

/**
 * The amounts a hostel purchase actually lands on - a chai, a rickshaw share,
 * a plate at the dhaba, a top-up. Tapping one beats typing on a phone keypad,
 * and the field stays editable for everything else.
 */
const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

export default function ExpenseForm({ expense, categories = [], currency = 'PKR', onSubmit, onCancel, submitting }) {
  const { t } = useT();
  const { user } = useAuth();
  const householder = Boolean(user && user.financeMode === 'householder');
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: '',
      category: categories[0] || '',
      description: '',
      paymentMethod: 'Cash',
      date: toInputDate(new Date()),
      isRecurring: false,
      recurringFrequency: 'monthly',
    },
  });

  // Re-seed the form whenever a different expense is opened for editing.
  useEffect(() => {
    if (expense) {
      reset({
        amount: expense.amount,
        category: expense.category,
        description: expense.description || '',
        paymentMethod: expense.paymentMethod,
        date: toInputDate(expense.date),
        isRecurring: Boolean(expense.isRecurring),
        recurringFrequency: expense.recurringFrequency || 'monthly',
      });
    }
  }, [expense, reset]);

  // The category list arrives from the API a moment after first paint. Only
  // seed it when nothing is chosen yet, so it never overwrites a real choice.
  const selectedCategory = watch('category');
  useEffect(() => {
    if (!selectedCategory && categories.length > 0) {
      setValue('category', categories[0], { shouldValidate: false });
    }
  }, [categories, selectedCategory, setValue]);

  const isRecurring = watch('isRecurring');
  const amount = watch('amount');

  const bumpAmount = (value) => {
    // Tapping twice adds up: 500 then 100 is 600, which is how a student
    // totals a split bill in their head.
    try {
      setValue('amount', sumMoney([amount || 0, value]), { shouldValidate: true, shouldDirty: true });
    } catch {
      setValue('amount', amount, { shouldValidate: true, shouldDirty: true });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Input
          label="Amount"
          type="number"
          step="0.01"
          inputMode="decimal"
          placeholder="0"
          prefix={currencySymbol(currency)}
          autoFocus
          error={errors.amount && errors.amount.message}
          {...register('amount')}
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => bumpAmount(value)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              +{formatMoney(value, currency)}
            </button>
          ))}
          {Number(amount) > 0 && (
            <button
              type="button"
              onClick={() => setValue('amount', '', { shouldValidate: false })}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/*
        Categories are radio buttons dressed as chips rather than a <select>.
        A dropdown on a phone is tap - scroll - tap; this is one tap, shows the
        same emoji the list view uses, and keeps arrow-key navigation and
        screen-reader semantics for free.
      */}
      <fieldset>
        <legend className="hw-label">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((name) => {
            const active = selectedCategory === name;
            return (
              <label
                key={name}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  'focus-within:ring-2 focus-within:ring-brand-500/60 focus-within:ring-offset-2',
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-500/15 dark:text-brand-200'
                    : 'border-slate-200 bg-canvas-card text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                <input type="radio" value={name} className="sr-only" {...register('category')} />
                <span aria-hidden="true">{categoryEmoji(name)}</span>
                {name}
                {active && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: categoryColor(name) }}
                    aria-hidden="true"
                  />
                )}
              </label>
            );
          })}
          {categories.length === 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('expenses.loadingCategories')}</span>
          )}
        </div>
        {errors.category && <p className="hw-error">{errors.category.message}</p>}
      </fieldset>

      <Input
        label={t('expenses.whatFor')}
        hint={t('expenses.whatForHint')}
        placeholder={t(householder ? 'expenses.whatForPlaceholderHouseholder' : 'expenses.whatForPlaceholderStudent')}
        error={errors.description && errors.description.message}
        {...register('description')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t('expenses.paidWith')}
          options={PAYMENT_METHODS}
          error={errors.paymentMethod && errors.paymentMethod.message}
          {...register('paymentMethod')}
        />

        <Input
          label="Date"
          type="date"
          max={toInputDate(new Date())}
          error={errors.date && errors.date.message}
          {...register('date')}
        />
      </div>

      <div className="rounded-xl bg-slate-100/70 p-4 dark:bg-slate-950/50">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            {...register('isRecurring')}
          />
          <span>
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              This repeats every month
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Perfect for the mess bill or hostel fee. Hisabki Kitab will add it for you automatically.
            </span>
          </span>
        </label>

        {isRecurring && (
          <Select
            className="mt-3"
            label={t('expenses.howOften')}
            options={RECURRING_FREQUENCIES}
            {...register('recurringFrequency')}
          />
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {expense ? 'Save changes' : 'Add expense'}
        </Button>
      </div>
    </form>
  );
}
