import { GraduationCap, Home, Users, Briefcase } from 'lucide-react';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import useT from '../../../shared/i18n/I18nProvider';
import { cn } from '../../../shared/utils/format';

const OPTIONS = [
  { key: 'student', icon: GraduationCap },
  { key: 'householder', icon: Home },
  { key: 'shared_living', icon: Users },
  { key: 'business', icon: Briefcase },
];

/**
 * Which set of books is open.
 *
 * The important thing this has to communicate is that switching is not
 * destructive. A person with two years of student expenses will not touch a
 * button that might mean "start again", so the hint says plainly that both
 * sets stay, and the confirmation before the switch says it again.
 *
 * The switch itself is confirmed in the page, not here: this only reports
 * which mode is active and asks for the other one.
 */
export default function FinanceModeCard({ mode, onSelect, saving }) {
  const { t } = useT();

  return (
    <Card>
      <CardHeader
        title={t('settings.financeMode')}
        subtitle={t('settings.financeModeHint')}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const active = mode === option.key;
          return (
            <button
              key={option.key}
              type="button"
              disabled={saving}
              aria-pressed={active}
              onClick={() => (active ? undefined : onSelect(option.key))}
              className={cn(
                'flex gap-3 rounded-xl border p-4 text-left transition disabled:opacity-60',
                active
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
              )}
            >
              <option.icon
                className={cn(
                  'h-5 w-5 shrink-0',
                  active ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400'
                )}
                aria-hidden="true"
              />
              <span>
                <span
                  className={cn(
                    'block text-sm font-semibold',
                    active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'
                  )}
                >
                  {t(`mode.${option.key}`)}
                </span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  {t(`mode.${option.key}Description`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
