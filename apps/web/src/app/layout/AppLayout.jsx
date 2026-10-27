import { Suspense, useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Eye, Plus, Store } from 'lucide-react';
import Navbar from './Navbar';
import Sidebar, { MOBILE_NAV_ITEMS, MOBILE_BUSINESS_NAV_ITEMS } from './Sidebar';
import Footer from './Footer';
import Modal from '../../shared/components/ui/Modal';
import { ExpenseForm } from '../../features/expenses';
import { FeedbackModal } from '../../features/feedback';
import { useBusiness, BusinessOnboardingModal } from '../../features/business';
import useCategories from '../../shared/hooks/useCategories';
import useT from '../../shared/i18n/I18nProvider';
import useMutation from '../../shared/hooks/useMutation';
import { notifyDataChanged } from '../../shared/hooks/useAsync';
import { useAuth } from '../../features/auth/AuthContext';
import { expensesApi as expenseService } from '../../features/expenses';
import { QuickAddProvider } from '../../shared/hooks/useQuickAdd';
import useShortcutKey from '../../shared/hooks/useShortcutKey';
import { cn } from '../../shared/utils/format';
import { sharedSection } from '../../features/sharedLiving';
import { PageSpinner } from '../../shared/components/ui/Spinner';

/**
 * The quick-add form is its own component so `useCategories` only fires its
 * request when the dialog is actually opened, not on every page load.
 */
function QuickAddForm({ onDone, onCancel }) {
  const { currency } = useAuth();
  const { categories } = useCategories();
  const { saving, run } = useMutation();

  const submit = (values) =>
    run(() => expenseService.create(values), {
      success: 'Expense added',
      onDone: () => {
        notifyDataChanged();
        onDone();
      },
    });

  return (
    <ExpenseForm
      categories={categories}
      currency={currency}
      onSubmit={submit}
      onCancel={onCancel}
      submitting={saving}
    />
  );
}

/**
 * Shell for every signed-in screen: top bar, a sidebar on desktop, a bottom
 * tab bar on phones (which is where a student actually logs an expense).
 */
export default function AppLayout() {
  const { user, setDemoFinanceMode } = useAuth();
  const { isBusinessMode, setMode: setBusinessMode, onboardingOpen, closeOnboarding } = useBusiness();
  const location = useLocation();
  const inBusinessMode = isBusinessMode || location.pathname.startsWith('/business');


  const shared = user?.financeMode === 'shared_living' && !inBusinessMode;
  const mobileItems = inBusinessMode
    ? MOBILE_BUSINESS_NAV_ITEMS
    : (shared ? MOBILE_NAV_ITEMS.filter((item) => item.to === '/dashboard') : MOBILE_NAV_ITEMS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { t } = useT();

  const openQuickAdd = useCallback(() => { if (!shared && !user?.isDemo && !inBusinessMode) setQuickAddOpen(true); }, [shared, user?.isDemo, inBusinessMode]);
  const closeQuickAdd = useCallback(() => setQuickAddOpen(false), []);
  const openFeedback = useCallback(() => { if (!user?.isDemo) setFeedbackOpen(true); }, [user?.isDemo]);
  const closeFeedback = useCallback(() => setFeedbackOpen(false), []);

  // "N" logs an expense from anywhere it could not have meant something else.
  // Every guard lives in the hook, where it can be tested on its own.
  useShortcutKey('n', openQuickAdd);

  /*
   * On desktop the shell is exactly one viewport tall and hides its own
   * overflow, so the only thing that scrolls is <main>. That is what holds the
   * sidebar still, and it is why there is never a second scrollbar. Below lg
   * the shell goes back to growing with its content and the page scrolls
   * normally, which is what a phone expects - and what the fixed bottom tab bar
   * is positioned against.
   */
  return (
    <QuickAddProvider open={shared || user?.isDemo || inBusinessMode ? undefined : openQuickAdd}>
      <div className="flex min-h-full flex-col bg-canvas-light lg:h-full lg:min-h-0 lg:overflow-hidden dark:bg-canvas-dark">
      <a href="#main-content" className="hw-skip-link">
        {t('nav.skipToContent')}
      </a>

      <Navbar onOpenMenu={() => setMenuOpen(true)} onOpenFeedback={openFeedback} />

      <div className="flex flex-1 lg:min-h-0 lg:overflow-hidden">
        <Sidebar mode={user?.financeMode} open={menuOpen} onClose={() => setMenuOpen(false)} />

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 lg:h-full lg:overflow-y-auto">
          {/* pb-28 leaves room for the mobile tab bar and its raised button */}
          <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-8">
            {user?.isDemo && (
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-brand-400/50 bg-brand-500/10 p-3 shadow-brand sm:flex-row sm:items-center sm:justify-between" role="status">
                <div className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-200">
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Demo Mode — Read Only
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-canvas-dark p-1" aria-label="Demo finance view">
                  {[
                    ['student', 'Individual'],
                    ['householder', 'Household'],
                    ['shared_living', 'Shared Living'],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setDemoFinanceMode(mode); notifyDataChanged(); }}
                      aria-pressed={user.financeMode === mode}
                      className={cn(
                        'min-h-9 rounded-lg px-2 text-[11px] font-semibold transition sm:px-3 sm:text-xs',
                        user.financeMode === mode
                          ? 'bg-brand-600 text-white shadow-brand'
                          : 'text-slate-400 hover:bg-canvas-darkCard hover:text-slate-100'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Suspense fallback={<PageSpinner label={t('common.loading')} />}>
              {(() => {
                // Strict four-mode route isolation:
                // 1. In Business Mode: personal financial routes redirect to /business.
                // 2. In Personal Mode: business routes redirect to /dashboard.
                // 3. In Shared Living: non-shared routes redirect to /dashboard.
                const isPersonalRoute = ['/dashboard', '/expenses', '/income', '/goals', '/debts', '/budget', '/advisor', '/reports'].includes(location.pathname);
                const isBusinessRoute = location.pathname.startsWith('/business');

                if (user?.isDemo && isBusinessRoute) {
                  return <Navigate to="/dashboard" replace />;
                }
                if (isBusinessMode && isPersonalRoute) {
                  return <Navigate to="/business" replace />;
                }
                if (shared && !['/dashboard', '/settings'].includes(location.pathname)) {
                  return <Navigate to="/dashboard" replace />;
                }
                return <Outlet key={`${user?.financeMode}-${isBusinessMode ? 'biz' : 'pers'}`} />;
              })()}
            </Suspense>
          </div>
          <div className="hidden lg:block">
            <Footer onOpenFeedback={user?.isDemo ? undefined : openFeedback} />
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation. Two tabs, the add button, two more tabs. */}
      <nav
        aria-label={t('nav.mainNavigation')}
        className="hw-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-canvas-card/95 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-canvas-darkCard/95"
      >
        <ul className="mx-auto flex max-w-md items-end">
          {mobileItems.slice(0, 2).map((item) => (
            <MobileTab key={item.to} item={item} shared={shared} />
          ))}

          {inBusinessMode ? (
            <li className="flex flex-1 min-w-0 justify-center">
              <Link
                to="/business/pos"
                aria-label="POS Checkout"
                className="hw-fab -mt-6 mb-1.5 flex items-center justify-center bg-brand-600 text-white shadow-brand hover:bg-brand-700"
              >
                <Store className="h-6 w-6" aria-hidden="true" />
              </Link>
            </li>
          ) : (
            !shared && !user?.isDemo && (
              <li className="flex flex-1 justify-center">
                {/* -mt-6 lifts it out of the bar so it reads as the primary action. */}
                <button
                  type="button"
                  onClick={openQuickAdd}
                  aria-label={t('nav.addAnExpense')}
                  className="hw-fab -mt-6 mb-1.5"
                >
                  <Plus className="h-6 w-6" aria-hidden="true" />
                </button>
              </li>
            )
          )}

          {mobileItems.slice(2).map((item) => (
            <MobileTab key={item.to} item={item} />
          ))}
        </ul>
      </nav>

      <Modal
        open={quickAddOpen && !shared && !user?.isDemo}
        onClose={closeQuickAdd}
        title={t('nav.addAnExpense')}
        subtitle={t('nav.loggedAgainstToday')}
        size="md"
      >
        <QuickAddForm onDone={closeQuickAdd} onCancel={closeQuickAdd} />
      </Modal>

      {/* One instance for the whole shell, opened from the navbar or the footer. */}
      <FeedbackModal open={feedbackOpen && !user?.isDemo} onClose={closeFeedback} />

      {/* Business Setup Wizard */}
      <BusinessOnboardingModal open={onboardingOpen} onClose={closeOnboarding} />
      </div>
    </QuickAddProvider>
  );
}

function MobileTab({ item: { to, key, label, icon: Icon }, shared = false }) {
  const { t } = useT();
  const location = useLocation();
  const isActive = (to === '/business' ? location.pathname === '/business' : location.pathname === to) && (!shared || sharedSection(location.search) === 'dashboard');
  const itemKey = `nav.${key}`;
  const translated = t(itemKey);
  const displayLabel = translated !== itemKey ? translated : (label || key);

  return (
    <li className="flex-1 min-w-0">
      <Link
        to={to}
        aria-current={isActive ? 'page' : undefined}
        className={
          cn(
            // min-h-[52px] keeps every tap target above the 44px guideline.
            'flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium leading-tight transition',
            isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
          )
        }
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="truncate max-w-[64px]">{displayLabel}</span>
        {isActive && <span className="sr-only">(current page)</span>}
      </Link>
    </li>
  );
}
