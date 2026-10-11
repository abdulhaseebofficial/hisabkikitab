import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider';
import PublicFrame from './PublicFrame';

export default function PublicSiteLayout({ children }) {
  const { isDark, toggle } = useTheme();

  return (
    <PublicFrame controls={
        <button type="button" onClick={toggle} aria-label={isDark ? 'Use light theme' : 'Use dark theme'} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          {isDark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
        </button>
      }>{children}</PublicFrame>
  );
}
