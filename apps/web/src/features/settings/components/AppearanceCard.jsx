import { Moon, Sun } from 'lucide-react';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import { cn } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';

const THEME_OPTIONS = [
  { key: 'light', labelKey: 'settings.themeLight', icon: Sun, swatch: 'bg-[#eaf3ff] text-[#1468ff]' },
  { key: 'dark', labelKey: 'settings.themeDark', icon: Moon, swatch: 'bg-[#081b4b] text-[#63adff]' },
];

export default function AppearanceCard({ theme, onChange }) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader title={t('settings.appearance')} subtitle={t('settings.appearanceSubtitle')} />
      <div className="grid grid-cols-2 gap-3">
        {THEME_OPTIONS.map((option) => (
          <button key={option.key} type="button" onClick={() => { if (theme !== option.key) onChange(option.key); }}
            aria-pressed={theme === option.key}
            className={cn(
              'flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-4 text-xs font-semibold transition',
              theme === option.key
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:text-slate-300'
            )}>
            <span className={`flex h-9 w-9 items-center justify-center rounded-full shadow-card ${option.swatch}`}>
              <option.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </Card>
  );
}
