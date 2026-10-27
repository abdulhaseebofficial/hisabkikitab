import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Link from '../../shared/seo/PublicLink';
import { ArrowUpRight, Menu, X, Download } from 'lucide-react';
import OfficialLogo from '../../shared/components/layout/OfficialLogo';
import usePwaInstall from '../../shared/hooks/usePwaInstall';
import InstallAppModal from '../../shared/components/pwa/InstallAppModal';

const links = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/dashboard', label: 'My finances' },
  { to: '/learn', label: 'Guides' },
  { to: '/tools', label: 'Tools' },
];

export default function PublicHeader({ controls }) {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    isInstalled,
    isPromptAvailable,
    isIos,
    modalOpen,
    openModal,
    closeModal,
    triggerInstall,
  } = usePwaInstall();

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const navLink = (to, label) => (
    <Link key={to} to={to} aria-current={pathname === to || (to !== '/' && pathname.startsWith(`${to}/`)) ? 'page' : undefined} onClick={() => setMenuOpen(false)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 aria-[current=page]:bg-brand-50 aria-[current=page]:text-brand-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:aria-[current=page]:bg-brand-500/15 dark:aria-[current=page]:text-brand-300">
      {label}
    </Link>
  );

  return (
    <header className="relative z-30 px-4 pt-4 sm:px-8 lg:px-12">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-canvas-card/85 px-4 shadow-raised backdrop-blur-xl sm:h-[76px] sm:px-7 dark:border-slate-700 dark:bg-canvas-darkCard/85">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 text-slate-900 dark:text-slate-100" aria-label="HisabKi Kitab home">
          <OfficialLogo className="h-9 w-9" />
          <span className="truncate font-display text-xl font-semibold tracking-tight sm:text-2xl">HisabKi Kitab</span>
        </Link>
        <nav aria-label="Public navigation" className="hidden items-center gap-1 lg:flex">{links.map(({ to, label }) => navLink(to, label))}</nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {controls}
          <button
            type="button"
            onClick={isInstalled ? openModal : triggerInstall}
            className="hidden min-h-11 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50/70 px-3.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 sm:inline-flex dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/40"
            aria-label="Install App"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isInstalled ? 'App Ready' : 'Install App'}</span>
          </button>
          <Link to="/login" className="hidden min-h-11 items-center rounded-full px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex dark:text-slate-200 dark:hover:bg-slate-800">Sign in</Link>
          <Link to="/register" className="hidden min-h-11 items-center gap-1.5 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 lg:inline-flex">Get started <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
          <button type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="public-mobile-nav" onClick={() => setMenuOpen((open) => !open)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 lg:hidden dark:text-slate-200 dark:hover:bg-slate-800">
            {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {menuOpen && <nav id="public-mobile-nav" aria-label="Mobile public navigation" className="mx-auto mt-2 max-w-7xl rounded-2xl border border-brand-100 bg-canvas-card px-4 pb-4 pt-2 shadow-raised lg:hidden dark:border-slate-700 dark:bg-canvas-darkCard">
        <div className="mx-auto grid max-w-7xl gap-1">
          {links.map(({ to, label }) => navLink(to, label))}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              if (isInstalled) openModal();
              else triggerInstall();
            }}
            className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 text-sm font-semibold text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300"
          >
            <Download className="h-4 w-4" />
            <span>{isInstalled ? 'App Ready' : 'Install App'}</span>
          </button>
          <Link to="/login" onClick={() => setMenuOpen(false)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-slate-700 sm:hidden dark:text-slate-200">Sign in</Link>
          <Link to="/register" onClick={() => setMenuOpen(false)} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Get started</Link>
        </div>
      </nav>}
      <InstallAppModal
        open={modalOpen}
        onClose={closeModal}
        isInstalled={isInstalled}
        isPromptAvailable={isPromptAvailable}
        isIos={isIos}
        onTriggerInstall={triggerInstall}
      />
    </header>
  );
}
