import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Moon, Sun, LogOut, User, ChevronDown, MessageSquarePlus } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useTheme } from '../providers/ThemeProvider';
import { initials } from '../../shared/utils/format';
import BrandMark from '../../shared/components/layout/BrandMark';
import { NotificationBell } from '../../features/notifications';
import useT from '../../shared/i18n/I18nProvider';

export default function Navbar({ onOpenMenu, onOpenFeedback }) {
  const { t } = useT();
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-canvas-card/80 backdrop-blur dark:border-slate-800 dark:bg-canvas-darkCard/80">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={t('common.openMenu')}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>

        <BrandMark nameClassName="hidden sm:block" />

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <NotificationBell />

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                {initials(user ? user.name : '')}
              </span>
              <span className="hidden max-w-28 truncate text-sm font-medium text-slate-700 sm:block dark:text-slate-200">
                {user ? user.name.split(' ')[0] : ''}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-2 w-56 animate-slide-up overflow-hidden rounded-2xl border border-slate-200 bg-canvas-card shadow-lift dark:border-slate-700 dark:bg-canvas-darkCard">
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {user ? user.name : ''}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user ? user.email : ''}</p>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <User className="h-4 w-4" />
                    Profile and settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenFeedback();
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                    Send feedback
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 dark:hover:bg-danger/15"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
