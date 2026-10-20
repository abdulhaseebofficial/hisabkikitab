import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, LogOut, User, ChevronDown, MessageSquarePlus, Download, Briefcase, Building2, Plus, Check, Settings } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useBusiness } from '../../features/business';
import ThemeToggle from './ThemeToggle';
import { initials, cn } from '../../shared/utils/format';
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
    openModal,
    closeModal,
    triggerInstall,
  } = usePwaInstall();

  const {
    mode: appMode,
    setMode: setAppMode,
    isBusinessMode,
    businesses,
    activeBusiness,
    activeBusinessId,
    setActiveBusinessId,
    openOnboarding,
  } = useBusiness();
  const [bizMenuOpen, setBizMenuOpen] = useState(false);

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

        <BrandMark to={isBusinessMode ? '/business' : '/dashboard'} nameClassName="hidden sm:block" />

        {/* Mode Switcher Segmented Control (Desktop) */}
        <div className="hidden md:flex items-center rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setAppMode('personal');
              navigate('/dashboard');
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition',
              !isBusinessMode
                ? 'bg-white text-brand-700 shadow-sm dark:bg-canvas-darkCard dark:text-brand-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            <User className="h-3.5 w-3.5" />
            <span>{t('nav.personalMode', 'Personal')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAppMode('business');
              if (businesses.length === 0) {
                openOnboarding();
              }
              navigate('/business');
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition',
              isBusinessMode
                ? 'bg-brand-600 text-white shadow-sm dark:bg-brand-500'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>{t('nav.businessMode', 'Business')}</span>
          </button>
        </div>

        {/* Business Selector (shown when in Business Mode) */}
        {isBusinessMode && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setBizMenuOpen((open) => !open)}
              className="flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50/60 px-2.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-800/70 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/40"
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[75px] xs:max-w-[110px] truncate sm:max-w-[180px]">
                {activeBusiness?.name || t('business.selectBusiness', 'Select Business')}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>

            {bizMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setBizMenuOpen(false)} aria-hidden="true" />
                <div className="absolute left-0 sm:left-auto sm:right-0 z-20 mt-2 w-64 animate-slide-up overflow-hidden rounded-2xl border border-slate-200 bg-canvas-card shadow-lift dark:border-slate-700 dark:bg-canvas-darkCard">
                  <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    {t('business.yourBusinesses', 'Your Businesses')}
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {businesses.map((biz) => (
                      <button
                        key={biz.id}
                        type="button"
                        onClick={() => {
                          setActiveBusinessId(biz.id);
                          setBizMenuOpen(false);
                          navigate('/business');
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <div className="truncate">
                          <p className="font-semibold">{biz.name}</p>
                          <p className="text-[10px] text-slate-400">{biz.category || 'Retail / General'}</p>
                        </div>
                        {biz.id === activeBusinessId && (
                          <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                        )}
                      </button>
                    ))}
                    {businesses.length === 0 && (
                      <p className="px-3 py-2 text-xs text-slate-400">{t('business.noBusinessesYet', 'No businesses yet')}</p>
                    )}
                  </div>
                  <div className="border-t border-slate-100 p-1 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setBizMenuOpen(false);
                        openOnboarding();
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('business.addNewBusiness', 'Add New Business')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Mobile Quick Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            if (isBusinessMode) {
              setAppMode('personal');
              navigate('/dashboard');
            } else {
              setAppMode('business');
              if (businesses.length === 0) openOnboarding();
              navigate('/business');
            }
          }}
          title={isBusinessMode ? 'Switch to Personal Mode' : 'Switch to Business Mode'}
          className="hidden xs:inline-flex md:hidden h-9 items-center gap-1 rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          {isBusinessMode ? (
            <>
              <Briefcase className="h-3.5 w-3.5 text-brand-600" />
              <span className="text-[11px]">Biz</span>
            </>
          ) : (
            <>
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-[11px]">Personal</span>
            </>
          )}
        </button>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {!isInstalled && (
            <button
              type="button"
              onClick={triggerInstall}
              title={t('pwa.installAppBtn', 'Install App')}
              aria-label={t('pwa.installAppBtn', 'Install App')}
              className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50/70 px-2.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/40"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('pwa.install', 'Install')}</span>
            </button>
          )}

          <ThemeToggle />

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
              <span className="hidden max-w-28 truncate text-sm font-medium text-slate-700 sm:block dark:text-slate-200">
                {user ? user.name.split(' ')[0] : ''}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
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
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                        isBusinessMode 
                          ? "bg-brand-100 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      )}>
                        {isBusinessMode ? <Briefcase className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        {isBusinessMode ? 'Business Mode' : (user?.financeMode === 'householder' ? 'Household Mode' : (user?.financeMode === 'shared_living' ? 'Shared Living' : 'Personal Mode'))}
                      </span>
                    </div>
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

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      if (isBusinessMode) {
                        setAppMode('personal');
                        navigate('/dashboard');
                      } else {
                        setAppMode('business');
                        if (businesses.length === 0) openOnboarding();
                        navigate('/business');
                      }
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {isBusinessMode ? (
                      <User className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                    ) : (
                      <Briefcase className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                    )}
                    <span className="truncate">
                      {isBusinessMode ? t('nav.switchToPersonal', 'Switch to Personal Mode') : t('nav.switchToBusiness', 'Switch to Business Mode')}
                    </span>
                  </button>

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
