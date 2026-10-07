import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Input from '../../../shared/components/ui/Input';
import Textarea from '../../../shared/components/ui/Textarea';
import Button from '../../../shared/components/ui/Button';
import { GOAL_ICONS } from '../../../shared/utils/constants';
import { currencySymbol, toInputDate, cn } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';
import { isSupportedMoney } from '../../../shared/utils/money';

const schema = z.object({
  title: z.string().min(1, 'Give your goal a name').max(80, 'Keep the name shorter'),
  targetAmount: z.coerce.number({ invalid_type_error: 'Enter a target' }).min(1, 'Target must be at least 1')
    .refine((value) => isSupportedMoney(value, { minimumMinor: 100n }), 'Use at most two decimal places'),
  deadline: z.string().optional(),
  icon: z.string().min(1),
  note: z.string().max(200).optional(),
});

export default function GoalForm({ goal, currency = 'INR', onSubmit, onCancel, submitting }) {
  const { t } = useT();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      targetAmount: '',
      deadline: '',
      icon: GOAL_ICONS[0],
      note: '',
    },
  });

  useEffect(() => {
    if (goal) {
      reset({
        title: goal.title,
        targetAmount: goal.targetAmount,
        deadline: goal.deadline ? toInputDate(goal.deadline) : '',
        icon: goal.icon || GOAL_ICONS[0],
        note: goal.note || '',
      });
    }
  }, [goal, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label={t('goals.savingFor')}
        placeholder={t('goals.savingForPlaceholder')}
        autoFocus
        error={errors.title && errors.title.message}
        {...register('title')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('goals.targetAmount')}
          type="number"
          step="1"
          inputMode="decimal"
          placeholder="25000"
          prefix={currencySymbol(currency)}
          error={errors.targetAmount && errors.targetAmount.message}
          {...register('targetAmount')}
        />

        <Input
          label={t('goals.deadlineOptional')}
          type="date"
          min={toInputDate(new Date())}
          hint={t('goals.deadlineHint')}
          error={errors.deadline && errors.deadline.message}
          {...register('deadline')}
        />
      </div>

      <div>
        <span className="hw-label">{t('goals.pickIcon')}</span>
        <Controller
          name="icon"
          control={control}
          render={({ field }) => (
            <div className="flex flex-wrap gap-1.5">
              {GOAL_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => field.onChange(icon)}
                  aria-label={t('goals.useIcon', { icon })}
                  aria-pressed={field.value === icon}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl text-xl transition',
                    field.value === icon
                      ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-500/20'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
          )}
        />
      </div>

      <Textarea
        label={t('goals.noteOptional')}
        placeholder={t('goals.notePlaceholder')}
        error={errors.note && errors.note.message}
        {...register('note')}
      />

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {goal ? t('goals.saveChanges') : t('goals.createGoal')}
        </Button>
      </div>
    </form>
  );
}
