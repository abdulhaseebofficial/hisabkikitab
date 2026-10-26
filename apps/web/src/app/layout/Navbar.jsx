import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, LogOut, ChevronDown, MessageSquarePlus, Download, Settings } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useBusiness } from '../../features/business';
import ThemeToggle from './ThemeToggle';
import { initials } from '../../shared/utils/format';
import BrandMark from '../../shared/components/layout/BrandMark';
import { NotificationBell } from '../../features/notifications';
import useT from '../../shared/i18n/I18nProvider';
import usePwaInstall from '../../shared/hooks/usePwaInstall';
import InstallAppModal from '../../shared/components/pwa/InstallAppModal';

export default function Navbar({ onOpenMenu, onOpenFeedback }) {
  const { t } = useT();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const {
    isInstalled,
    isPromptAvailable,
    isIos,
    platform,
    modalOpen,
    closeModal,
    triggerInstall,
  } = usePwaInstall();

  const { isBusinessMode } = useBusiness();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-canvas-card/80 backdrop-blur dark:border-slate-800 dark:bg-canvas-darkCard/80">
      <div className="flex h-16 items-center gap-1.5 sm:gap-3 px-2.5 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={t('common.openMenu')}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>

        <BrandMark to={isBusinessMode ? '/business' : '/dashboard'} nameClassName="hidden lg:block" />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {!isInstalled && (
            <button
              type="button"
              onClick={triggerInstall}
              title={t('pwa.installAppBtn', 'Install App')}
              aria-label={t('pwa.installAppBtn', 'Install App')}
              className="hidden lg:inline-flex h-9 items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50/70 px-2.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/40"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('pwa.install', 'Install')}</span>
            </button>
          )}

          <div className="hidden xs:block"><ThemeToggle /></div>

          <NotificationBell readOnly={Boolean(user?.isDemo)} />

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                {initials(user ? user.name : '')}
              </span>
              <span className="hidden max-w-28 truncate text-sm font-medium text-slate-700 lg:block dark:text-slate-200">
                {user ? user.name.split(' ')[0] : ''}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 lg:block" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-2 w-64 sm:w-72 max-w-[calc(100vw-2rem)] animate-slide-up rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
                  <div className="px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {user ? user.name : ''}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user ? user.email : ''}</p>
                  </div>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800/80" />

                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Settings className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                    <span className="truncate">{t('nav.profileSettings', 'Profile and settings')}</span>
                  </Link>

                  {!user?.isDemo && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenFeedback();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <MessageSquarePlus className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span className="truncate">{t('nav.sendFeedback', 'Send feedback')}</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800/80" />

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 dark:hover:bg-danger/15"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t('nav.logout', 'Log out')}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <InstallAppModal
        open={modalOpen}
        onClose={closeModal}
        isInstalled={isInstalled}
        isPromptAvailable={isPromptAvailable}
        isIos={isIos}
        platform={platform}
        onTriggerInstall={triggerInstall}
      />
    </header>
  );
}
