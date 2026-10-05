import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, Wallet, X } from 'lucide-react';

const links = [
  { to: '/', label: 'Home' },
  { to: '/dashboard', label: 'My finances' },
  { to: '/learn', label: 'Guides' },
  { to: '/tools', label: 'Tools' },
];

export default function PublicHeader({ controls }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const navLink = (to, label) => (
    <Link key={to} to={to} aria-current={location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`)) ? 'page' : undefined} onClick={() => setMenuOpen(false)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 aria-[current=page]:bg-brand-50 aria-[current=page]:text-brand-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:aria-[current=page]:bg-brand-500/15 dark:aria-[current=page]:text-brand-300">
      {label}
    </Link>
  );

  return (
    <header className="relative z-30 border-b border-slate-200/80 bg-canvas-card/95 backdrop-blur dark:border-slate-800 dark:bg-canvas-darkCard/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-[76px] sm:px-8 lg:px-12">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 text-slate-900 dark:text-slate-100" aria-label="Hisabki Kitab home">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white"><Wallet className="h-5 w-5" aria-hidden="true" /></span>
          <span className="truncate font-display text-xl font-semibold tracking-tight sm:text-2xl">Hisabki Kitab</span>
        </Link>
        <nav aria-label="Public navigation" className="hidden items-center gap-1 lg:flex">{links.map(({ to, label }) => navLink(to, label))}</nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {controls}
          <Link to="/login" className="hidden min-h-11 items-center rounded-full px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex dark:text-slate-200 dark:hover:bg-slate-800">Sign in</Link>
          <Link to="/register" className="hidden min-h-11 items-center gap-1.5 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 lg:inline-flex">Get started <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
          <button type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="public-mobile-nav" onClick={() => setMenuOpen((open) => !open)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 lg:hidden dark:text-slate-200 dark:hover:bg-slate-800">
            {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {menuOpen && <nav id="public-mobile-nav" aria-label="Mobile public navigation" className="border-t border-slate-200 bg-canvas-card px-4 pb-4 pt-2 lg:hidden dark:border-slate-800 dark:bg-canvas-darkCard">
        <div className="mx-auto grid max-w-7xl gap-1">{links.map(({ to, label }) => navLink(to, label))}<Link to="/login" onClick={() => setMenuOpen(false)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-slate-700 sm:hidden dark:text-slate-200">Sign in</Link><Link to="/register" onClick={() => setMenuOpen(false)} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Get started</Link></div>
      </nav>}
    </header>
  );
}
