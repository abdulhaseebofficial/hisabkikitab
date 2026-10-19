import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import notificationService from '../api/notificationsApi';
import useMutation from '../../../shared/hooks/useMutation';
import { formatRelative, cn } from '../../../shared/utils/format';
import useT from '../../../shared/i18n/I18nProvider';

const TYPE_STYLES = {
  overspend: 'bg-danger/10 text-danger dark:bg-danger/15',
  bill_due: 'bg-caution/10 text-caution dark:bg-caution/15',
  goal_deadline: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
  goal_completed: 'bg-safe/10 text-safe dark:bg-safe/15',
  log_reminder: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  info: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/**
 * The badge word for each stored type.
 *
 * The type is an identifier - "bill_due" - and printing it with the underscore
 * swapped for a space is still printing an identifier. Mirrors the keys of
 * TYPE_STYLES above, so a new type gets both a colour and a word or neither.
 */
const TYPE_LABEL_KEYS = {
  overspend: 'notifications.typeOverspend',
  bill_due: 'notifications.typeBillDue',
  goal_deadline: 'notifications.typeGoalDeadline',
  goal_completed: 'notifications.typeGoalCompleted',
  log_reminder: 'notifications.typeLogReminder',
  info: 'notifications.typeInfo',
};

/** Bell with the unread count and a dropdown tray. */
export default function NotificationBell({ readOnly = false }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const containerRef = useRef(null);
  const { run } = useMutation();

  const load = useCallback(async () => {
    try {
      const data = await notificationService.list({ limit: 15 });
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch {
      /* the bell is not important enough to interrupt the student */
    }
  }, []);

  useEffect(() => {
    load();
    // Cheap poll so an alert raised by a background job shows up eventually.
    const timer = setInterval(load, 120000);
    return () => clearInterval(timer);
  }, [load]);

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markAllRead = () =>
    run(() => notificationService.markAllRead(), {
      onDone: () => {
        setItems((current) => current.map((n) => ({ ...n, isRead: true })));
        setUnread(0);
      },
    });

  const clearAll = () =>
    run(() => notificationService.clearAll(), {
      onDone: () => {
        setItems([]);
        setUnread(0);
      },
    });

  const openTray = async () => {
    const next = !open;
    setOpen(next);
    if (next) await load();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={openTray}
        aria-label={unread > 0 ? t('notifications.withUnread', { count: unread }) : t('notifications.title')}
        className="relative rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 origin-top-right animate-slide-up overflow-hidden rounded-2xl border border-slate-200 bg-canvas-card shadow-lift dark:border-slate-700 dark:bg-canvas-darkCard">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('notifications.title')}</span>
            {!readOnly && <div className="flex gap-1">
              <button
                type="button"
                onClick={markAllRead}
                title={t('notifications.markAllRead')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={clearAll}
                title={t('notifications.clearAll')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-danger dark:hover:bg-slate-800"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {t('notifications.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item) => (
                  <li
                    key={item._id}
                    className={cn('px-4 py-3', !item.isRead && 'bg-brand-50/50 dark:bg-brand-500/5')}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          'mt-0.5 rounded-lg px-1.5 py-0.5 text-[10px] font-bold uppercase',
                          TYPE_STYLES[item.type] || TYPE_STYLES.info
                        )}
                      >
                        {t(TYPE_LABEL_KEYS[item.type] || TYPE_LABEL_KEYS.info)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{item.message}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{formatRelative(item.createdAt)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
