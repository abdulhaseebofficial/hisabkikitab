import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, RefreshCw, Sparkles } from 'lucide-react';
import aiService from '../api/advisorApi';
import Skeleton from '../../../shared/components/ui/Skeleton';
import useT from '../../../shared/i18n/I18nProvider';
import { useAuth } from '../../auth';

/**
 * "Tip of the day" card for the dashboard.
 * The backend caches the tip per student per day, so refreshing the page does
 * not burn an API call - only the explicit refresh button does.
 */
export default function TipCard() {
  const { t } = useT();
  const { user } = useAuth();
  const householder = Boolean(user && user.financeMode === 'householder');
  const [tip, setTip] = useState(null);
  const [aiPowered, setAiPowered] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const data = await aiService.tip(refresh);
      setTip(data.tip);
      setAiPowered(data.aiPowered);
    } catch {
      // Even the could-not-load case is worded for who is reading it.
      setTip(t(householder ? 'advisor.tipUnavailableHouseholder' : 'advisor.tipUnavailableStudent'));
      setAiPowered(false);
    } finally {
      setLoading(false);
    }
  }, [t, householder]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="hw-card overflow-hidden border-brand-200 bg-linear-to-br/srgb from-brand-50 to-canvas-card p-5 dark:border-brand-500/20 dark:from-brand-500/10 dark:to-slate-900">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Lightbulb className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('advisor.tipOfTheDay')}</h2>
            {aiPowered && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{tip}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          aria-label={t('advisor.anotherTip')}
          className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-canvas-card/70 hover:text-brand-600 disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </button>
      </div>
    </section>
  );
}
