import { useEffect, useId, useRef } from 'react';
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { Laptop, BookOpen, CreditCard, FileBarChart, HandCoins, History, LayoutDashboard, Package, PieChart, Receipt, Settings, Settings2, Sparkles, Store, Target, Users, Utensils, Wallet, X, ArrowLeftRight, CalendarClock, ShoppingBag } from 'lucide-react';
import { sharedSection, sharedSectionSearch } from '../../features/sharedLiving';
import { useBusiness } from '../../features/business';
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
  { to: '/learn', key: 'learn', icon: BookOpen },
  { to: '/settings', key: 'settings', icon: Settings },
];

export const BUSINESS_NAV_ITEMS = [
  { to: '/business', key: 'businessOverview', label: 'Business Overview', icon: LayoutDashboard },
  { to: '/business/pos', key: 'pos', label: 'Point of Sale (POS)', icon: Store },
  { to: '/business/sales', key: 'sales', label: 'Sales & Invoices', icon: Receipt },
  { to: '/business/inventory', key: 'inventory', label: 'Inventory & Stock', icon: Package },
  { to: '/business/procurement', key: 'procurement', label: 'Procurement (Kharidari)', icon: ShoppingBag, isDesktopOnly: true },
  { to: '/business/khata', key: 'khata', label: 'Khata (Ledgers)', icon: Users },
  { to: '/business/expenses', key: 'businessExpenses', label: 'Business Expenses', icon: CreditCard },
  { to: '/business/recurring', key: 'recurringExpenses', label: 'Recurring Expenses', icon: CalendarClock },
  { to: '/business/accounts', key: 'businessAccounts', label: 'Cash & Bank Accounts', icon: Wallet, isDesktopOnly: true },
  { to: '/business/payroll', key: 'businessPayroll', label: 'Staff & Payroll', icon: Users, isDesktopOnly: true },
  { to: '/business/budgets', key: 'businessBudgets', label: 'Budgets & Targets', icon: Target, isDesktopOnly: true },
  { to: '/business/reports', key: 'businessReports', label: 'Financial Reports & P&L', icon: FileBarChart, isDesktopOnly: true },
  { to: '/business/settings', key: 'businessSettings', label: 'Business Settings', icon: Settings },
];

export const DESKTOP_ONLY_BUSINESS_ROUTES = BUSINESS_NAV_ITEMS.filter((item) => item.isDesktopOnly).map((item) => item.to);
export const ESSENTIAL_MOBILE_BUSINESS_NAV_ITEMS = BUSINESS_NAV_ITEMS.filter((item) => !item.isDesktopOnly);


export const MOBILE_BUSINESS_NAV_ITEMS = [
  { to: '/business', key: 'businessOverview', label: 'Overview', icon: LayoutDashboard },
  { to: '/business/pos', key: 'pos', label: 'POS', icon: Store },
  { to: '/business/khata', key: 'khata', label: 'Khata', icon: Users },
  { to: '/business/inventory', key: 'inventory', label: 'Stock', icon: Package },
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
  { to: '/learn', key: 'nav.learn', icon: BookOpen },
  { to: '/settings', key: 'nav.settings', icon: Settings },
];

function NavItems({ onNavigate, mode, isDrawer = false }) {
  const { isBusinessMode, setMode: setAppMode } = useBusiness();
  const location = useLocation();
  const navigate = useNavigate();
  const inBusinessMode = isBusinessMode || location.pathname.startsWith('/business');
  const shared = mode === 'shared_living' && !inBusinessMode;
  const items = inBusinessMode ? (isDrawer ? ESSENTIAL_MOBILE_BUSINESS_NAV_ITEMS : BUSINESS_NAV_ITEMS) : (shared ? SHARED_NAV_ITEMS : NAV_ITEMS);
  const { t } = useT();

  const getLabel = (item) => {
    if (inBusinessMode) {
      const k = `nav.${item.key}`;
      const res = t(k);
      return res !== k ? res : (item.label || item.key);
    }
    return t(shared ? item.key : `nav.${item.key}`);
  };

  return (
    <nav aria-label={t('nav.mainNavigation')} className={shared || inBusinessMode ? 'flex flex-1 flex-col gap-1' : 'space-y-1'}>
      {items.map((item) => {
        const { to, section, icon: Icon } = item;
        const destination = section ? `/dashboard${sharedSectionSearch(location.search, section)}` : to;
        const isActive = section
          ? location.pathname === '/dashboard' && sharedSection(location.search) === section
          : (to === '/business' ? location.pathname === '/business' : !!matchPath({ path: to, end: false }, location.pathname));
        const link = (
          <Link
            key={section || to}
            to={destination}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn('hw-nav-item justify-between', isActive && 'hw-nav-item-active')}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {getLabel(item)}
            {isActive && <span className="sr-only">{t('nav.currentPage')}</span>}
          </Link>
        );
        return (shared && to === '/settings') || (inBusinessMode && to === '/business/settings') ? (
          <div key={to} className="mt-auto pt-4">
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              {link}
              {inBusinessMode && (
                <button
                  type="button"
                  onClick={() => {
                    setAppMode('personal');
                    onNavigate?.();
                    navigate('/dashboard');
                  }}
                  className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  {t('nav.switchToPersonal', 'Switch to Personal Mode')}
                </button>
              )}
            </div>
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
  const { isBusinessMode } = useBusiness();
  const location = useLocation();
  const inBusinessMode = isBusinessMode || location?.pathname?.startsWith('/business');
  const drawerRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;
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
    const opener = document.activeElement;
    const drawer = drawerRef.current;
    document.body.style.overflow = 'hidden';
    drawer.querySelector('[aria-current="page"]')?.focus();
    if (!drawer.contains(document.activeElement)) drawer.querySelector('button')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = [...drawer.querySelectorAll('a[href], button:not([disabled])')];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    };
    const desktop = window.matchMedia?.('(min-width: 1024px)');
    const onResize = () => { if (desktop?.matches) closeRef.current(); };
    document.addEventListener('keydown', onKeyDown);
    desktop?.addEventListener('change', onResize);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
      desktop?.removeEventListener('change', onResize);
      if (opener?.isConnected) opener.focus();
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
        <NavItems mode={mode} isDrawer={false} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative z-10 flex h-full w-64 flex-col animate-slide-up overflow-y-auto border-r border-slate-200 bg-canvas-card px-3 py-4 dark:border-slate-800 dark:bg-canvas-darkCard">
            <div className="mb-4 flex items-center justify-between px-2">
              <span id={titleId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('nav.mainNavigation')}</span>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('nav.closeMenu')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavItems onNavigate={onClose} mode={mode} isDrawer={true} />
            {inBusinessMode && (
              <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                  <Laptop className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                  <span>{t('business.desktopWorkspaces', 'Desktop Workspaces')}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed">
                  {t('business.desktopWorkspacesDrawerNotice', 'General Ledger, Procurement, Payroll, Budgets, and Financial Reports are available on Desktop or Laptop.')}
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
