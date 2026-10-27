import { Languages } from 'lucide-react';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import useT from '../../../shared/i18n/I18nProvider';
import { cn } from '../../../shared/utils/format';

/**
 * Which language the interface is in.
 *
 * Each option carries a line of itself, because the name of a language is not
 * much use to someone deciding whether they can read it. "Roman Urdu" tells
 * you nothing; "Mujhe paise dene hain" tells you immediately. The samples are
 * data on the language, not translated strings, so the choice reads the same
 * whichever language is currently active - a person who landed in the wrong one
 * needs to recognise their way out.
 *
 * The list comes from the provider, which offers only languages whose
 * translation catalogue actually shipped. That is deliberately narrower than
 * the scripts a person can TYPE in: Urdu, Hindi, Tamil and the rest work in
 * every free-text field regardless of what this card offers, because storage
 * and validation are script-neutral. Urdu-script interface localisation
 * appears here when locales/ur.json exists and has been checked, and not
 * before - a half-translated interface falls back to English key by key and
 * reads as broken.
 */
export default function LanguageCard({ language, onChange, saving }) {
  const { t, languages } = useT();

  return (
    <Card>
      <CardHeader
        title={t('language.label')}
        subtitle={t('settings.languageHint')}
        icon={Languages}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {languages.map((option) => {
          const active = language === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={saving}
              aria-pressed={active}
              onClick={() => (active ? undefined : onChange(option.id))}
              className={cn(
                'rounded-xl border p-4 text-left transition disabled:opacity-60',
                active
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
              )}
            >
              <span
                className={cn(
                  'block text-sm font-semibold',
                  active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'
                )}
              >
                {option.name}
              </span>
              <span dir="auto" className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                {option.sample}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
