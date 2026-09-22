import { useEffect } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { FileBarChart, HandCoins, History, LayoutDashboard, PieChart, Receipt, Settings, Settings2, Sparkles, Target, Users, Utensils, Wallet, X } from 'lucide-react';
import { sharedSection, sharedSectionSearch } from '../../features/sharedLiving';
import useT from '../../shared/i18n/I18nProvider';
import { cn } from '../../shared/utils/format';

export const NAV_ITEMS = [
  // `key` is the translation key, not the label: the route stays the same in
  // both languages and only the word on it changes.
  { to: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { to: '/expenses', key: 'expenses', icon: Receipt },
  { to: '/income', key: 'income', icon: Wallet },
  { to: '/goals', key: 'goals', icon: Target },
  { to: '/debts', key: 'udhaar', icon: HandCoins },
  { to: '/budget', key: 'budget', icon: PieChart },
  { to: '/advisor', key: 'advisor', icon: Sparkles },
  { to: '/reports', key: 'reports', icon: FileBarChart },
  { to: '/settings', key: 'settings', icon: Settings },
];

/**
 * The mobile tab bar shows FOUR screens, not five: the middle slot is the
 * raised "add expense" button. Logging a purchase is the thing a student does
 * many times a day, and it should never cost a scroll to the top of a page.
 * The two shown on each side are the most visited; everything else is one tap
 * away in the drawer.
 */
export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ['/dashboard', '/expenses', '/goals', '/advisor'].includes(item.to)
);

const SHARED_NAV_ITEMS = [
  { section: 'dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
  { section: 'daily', key: 'shared.daily', icon: Utensils },
  { section: 'bills', key: 'shared.bills', icon: Receipt },
  { section: 'members', key: 'shared.members', icon: Users },
  { section: 'payments', key: 'shared.payments', icon: Wallet },
  { section: 'manage', key: 'shared.manageSpace', icon: Settings2 },
  { section: 'activity', key: 'shared.activity', icon: History },
  { to: '/settings', key: 'nav.settings', icon: Settings },
];

function NavItems({ onNavigate, mode }) {
  const shared = mode === 'shared_living';
  const items = shared ? SHARED_NAV_ITEMS : NAV_ITEMS;
  const location = useLocation();
  const { t } = useT();

  return (
    <nav aria-label={t('nav.mainNavigation')} className={shared ? 'flex flex-1 flex-col gap-1' : 'space-y-1'}>
      {items.map(({ to, key, section, icon: Icon }) => {
        const destination = section ? `/dashboard${sharedSectionSearch(location.search, section)}` : to;
        const isActive = section
          ? location.pathname === '/dashboard' && sharedSection(location.search) === section
          : !!matchPath({ path: to, end: false }, location.pathname);
        const link = (
          <Link
            key={section || to}
            to={destination}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn('hw-nav-item', isActive && 'hw-nav-item-active')}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {t(shared ? key : `nav.${key}`)}
            {isActive && <span className="sr-only">{t('nav.currentPage')}</span>}
          </Link>
        );
        return shared && to === '/settings' ? (
          <div key={to} className="mt-auto pt-4">
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">{link}</div>
          </div>
        ) : link;
      })}
    </nav>
  );
}

/**
 * Desktop rail plus the mobile drawer. Both render the same list so a new
 * screen only has to be added to NAV_ITEMS once.
 */
export default function Sidebar({ open, onClose, mode }) {
  const { t } = useT();
  /*
   * While the drawer is open the page behind it must not scroll: on a phone,
   * dragging the overlay otherwise moves the page underneath and the student
   * closes the menu to find themselves somewhere else. The previous value is
   * restored rather than assumed to be '', so this cannot fight anything else
   * that manages scrolling.
   */
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {/*
        Desktop rail. `h-full` inside the shell's fixed-height row is what keeps
        it still while the page moves: the rail is exactly as tall as the
        viewport and never taller, so there is nothing for the page scroll to
        move. `sticky top-4` used to do this job approximately - the rail slid
        upward until it caught, which looked like a bug on short pages.
        overflow-y-auto is the escape hatch for a viewport shorter than the nav
        list, so a small laptop still reaches Settings.
      */}
      <aside className={cn('hidden w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-canvas-card px-3 py-4 lg:h-full dark:border-slate-800 dark:bg-canvas-darkCard', mode === 'shared_living' ? 'lg:flex lg:flex-col' : 'lg:block')}>
        <NavItems mode={mode} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <aside className="relative z-10 flex h-full w-64 flex-col animate-slide-up overflow-y-auto border-r border-slate-200 bg-canvas-card px-3 py-4 dark:border-slate-800 dark:bg-canvas-darkCard">
            <div className="mb-4 flex items-center justify-between px-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Menu</span>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('nav.closeMenu')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavItems onNavigate={onClose} mode={mode} />
          </aside>
        </div>
      )}
    </>
  );
}
