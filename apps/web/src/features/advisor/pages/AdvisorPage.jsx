import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Lightbulb, MessageSquare, RefreshCw, Sparkles, WifiOff } from 'lucide-react';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import PageHeader from '../../../shared/components/ui/PageHeader';
import Badge from '../../../shared/components/ui/Badge';
import { SkeletonCard } from '../../../shared/components/ui/Skeleton';
import ChatBox from '../components/ChatBox';
import AdviceCard from '../components/AdviceCard';
import { useAuth } from '../../auth';
import useMutation from '../../../shared/hooks/useMutation';
import aiService from '../api/advisorApi';
import { cn } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';

const TABS = [
  { key: 'chat', labelKey: 'advisor.tabChat', icon: MessageSquare },
  { key: 'advice', labelKey: 'advisor.tabAdvice', icon: Lightbulb },
  { key: 'weekly', labelKey: 'advisor.tabWeekly', icon: CalendarRange },
];

export default function AIAdvisor() {
  const { t } = useT();
  const { user, currency } = useAuth();
  const readOnly = Boolean(user?.isDemo);
  const [tab, setTab] = useState('chat');
  const [status, setStatus] = useState(null);

  const [advice, setAdvice] = useState(null);
  const { saving: adviceLoading, run: runAdvice } = useMutation();

  const [weekly, setWeekly] = useState(null);
  const { saving: weeklyLoading, run: runWeekly } = useMutation();

  useEffect(() => {
    aiService.status().then(setStatus).catch(() => setStatus({ configured: false }));
  }, []);

  // Each tab keeps its own in-flight flag, so opening one does not grey out the other.
  const loadAdvice = useCallback(
    () => runAdvice(() => aiService.advice({ tipCount: 4 }), { onDone: setAdvice }),
    [runAdvice]
  );

  const loadWeekly = useCallback(
    () => runWeekly(() => aiService.weeklySummary(), { onDone: setWeekly }),
    [runWeekly]
  );

  // Fetch a tab's data the first time it is opened, not before.
  useEffect(() => {
    if (readOnly) return;
    if (tab === 'advice' && !advice && !adviceLoading) loadAdvice();
    if (tab === 'weekly' && !weekly && !weeklyLoading) loadWeekly();
  }, [tab, advice, weekly, adviceLoading, weeklyLoading, loadAdvice, loadWeekly, readOnly]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('advisor.title')}
        badge={
          status && !status.configured ? (
            <Badge tone="warning" icon={WifiOff}>
              {t('advisor.offlineMode')}
            </Badge>
          ) : null
        }
        subtitle={
          status && status.configured
            ? t('advisor.subtitleConfigured', { model: status.model ? ` · ${status.model}` : '' })
            : t('advisor.subtitleOffline')
        }
      />

      {readOnly ? (
        <Card>
          <p className="text-sm font-semibold text-slate-100">Demo Mode — Read Only</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">Advisor requests and chat changes are disabled in the demo. Explore the dashboard, reports, and existing financial records instead.</p>
        </Card>
      ) : <>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
              tab === option.key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            )}
          >
            <option.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t(option.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'chat' && <ChatBox userName={user ? user.name : t('advisor.you')} />}

      {tab === 'advice' && (
        <Card>
          <CardHeader
            title={t('advisor.monthlyAdvice')}
            subtitle={advice && advice.context ? advice.context.monthLabel : undefined}
            icon={Sparkles}
            action={
              <Button variant="ghost" size="sm" icon={RefreshCw} loading={adviceLoading} onClick={loadAdvice}>
                {t('advisor.refresh')}
              </Button>
            }
          />

          {adviceLoading && !advice ? (
            <SkeletonCard lines={8} className="border-0 p-0 shadow-none" />
          ) : (
            <AdviceCard advice={advice} currency={currency} />
          )}
        </Card>
      )}

      {tab === 'weekly' && (
        <Card>
          <CardHeader
            title={t('advisor.last7Days')}
            icon={CalendarRange}
            action={
              <Button variant="ghost" size="sm" icon={RefreshCw} loading={weeklyLoading} onClick={loadWeekly}>
                {t('advisor.refresh')}
              </Button>
            }
          />

          {weeklyLoading && !weekly ? (
            <SkeletonCard lines={5} className="border-0 p-0 shadow-none" />
          ) : weekly ? (
            <div className="space-y-4">
              <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                {weekly.summary}
              </p>

              {weekly.breakdown && weekly.breakdown.length > 0 && (
                <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  {weekly.breakdown.map((row) => (
                    <li key={row.category} className="flex justify-between py-2">
                      <span className="text-slate-600 dark:text-slate-400">{row.category}</span>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {row.percent}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </Card>
      )}
      </>}
    </div>
  );
}
