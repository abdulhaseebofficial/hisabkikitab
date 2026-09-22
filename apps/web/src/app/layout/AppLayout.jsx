import { useCallback, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import Navbar from './Navbar';
import Sidebar, { MOBILE_NAV_ITEMS } from './Sidebar';
import Footer from './Footer';
import Modal from '../../shared/components/ui/Modal';
import { ExpenseForm } from '../../features/expenses';
import { FeedbackModal } from '../../features/feedback';
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
  const { user } = useAuth();
  const shared = user?.financeMode === 'shared_living';
  const location = useLocation();
  const mobileItems = shared ? MOBILE_NAV_ITEMS.filter((item) => item.to === '/dashboard') : MOBILE_NAV_ITEMS;
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { t } = useT();

  const openQuickAdd = useCallback(() => { if (!shared) setQuickAddOpen(true); }, [shared]);
  const closeQuickAdd = useCallback(() => setQuickAddOpen(false), []);
  const openFeedback = useCallback(() => setFeedbackOpen(true), []);
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
    <QuickAddProvider open={shared ? undefined : openQuickAdd}>
      <div className="flex min-h-full flex-col bg-canvas-light lg:h-full lg:min-h-0 lg:overflow-hidden dark:bg-canvas-dark">
      <a href="#main-content" className="hw-skip-link">
        {t('nav.skipToContent')}
      </a>

      <Navbar onOpenMenu={() => setMenuOpen(true)} onOpenFeedback={openFeedback} />

      <div className="flex flex-1 lg:min-h-0 lg:overflow-hidden">
        <Sidebar mode={user?.financeMode} open={menuOpen} onClose={() => setMenuOpen(false)} />

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 lg:h-full lg:overflow-y-auto">
          {/* pb-28 leaves room for the mobile tab bar and its raised button */}
          <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">
            {shared && !['/dashboard', '/settings'].includes(location.pathname) ? <Navigate to="/dashboard" replace /> : <Outlet />}
          </div>
          <div className="hidden lg:block">
            <Footer onOpenFeedback={openFeedback} />
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

          {!shared && <li className="flex flex-1 justify-center">
            {/* -mt-6 lifts it out of the bar so it reads as the primary action. */}
            <button
              type="button"
              onClick={openQuickAdd}
              aria-label={t('nav.addAnExpense')}
              className="hw-fab -mt-6 mb-1.5"
            >
              <Plus className="h-6 w-6" aria-hidden="true" />
            </button>
          </li>}

          {mobileItems.slice(2).map((item) => (
            <MobileTab key={item.to} item={item} />
          ))}
        </ul>
      </nav>

      <Modal
        open={quickAddOpen && !shared}
        onClose={closeQuickAdd}
        title={t('nav.addAnExpense')}
        subtitle={t('nav.loggedAgainstToday')}
        size="md"
      >
        <QuickAddForm onDone={closeQuickAdd} onCancel={closeQuickAdd} />
      </Modal>

      {/* One instance for the whole shell, opened from the navbar or the footer. */}
      <FeedbackModal open={feedbackOpen} onClose={closeFeedback} />
      </div>
    </QuickAddProvider>
  );
}

function MobileTab({ item: { to, key, icon: Icon }, shared = false }) {
  const { t } = useT();
  const location = useLocation();
  const isActive = location.pathname === to && (!shared || sharedSection(location.search) === 'dashboard');
  return (
    <li className="flex-1">
      <Link
        to={to}
        aria-current={isActive ? 'page' : undefined}
        className={
          cn(
            // min-h-[52px] keeps every tap target above the 44px guideline.
            'flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition',
            isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
          )
        }
      >
          <>
            <Icon className="h-5 w-5" aria-hidden="true" />
            {t(`nav.${key}`)}
            {isActive && <span className="sr-only">(current page)</span>}
          </>
      </Link>
    </li>
  );
}
