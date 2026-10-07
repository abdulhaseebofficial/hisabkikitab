import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider';
import PublicHeader from './PublicHeader';
import PublicFooter from './PublicFooter';

export default function PublicSiteLayout({ children }) {
  const { isDark, toggle } = useTheme();

  return (
    <div className="min-h-full bg-canvas-light dark:bg-canvas-dark">
      <a href="#main-content" className="hw-skip-link">Skip to content</a>
      <PublicHeader controls={
        <button type="button" onClick={toggle} aria-label={isDark ? 'Use light theme' : 'Use dark theme'} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          {isDark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
        </button>
      } />
      <main id="main-content" tabIndex={-1} className="mx-auto min-w-0 w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">
        {children}
      </main>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 lg:px-12"><PublicFooter /></div>
    </div>
  );
}
