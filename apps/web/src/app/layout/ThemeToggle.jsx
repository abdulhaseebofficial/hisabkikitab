import { useCallback, useContext, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import ThemeContext, { applyTheme, cacheTheme, storedTheme, useTheme } from '../providers/ThemeProvider';
import { cn } from '../../shared/utils/format';

function ThemeToggleButton({ className, theme, toggleTheme }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <button type="button" onClick={toggleTheme} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}
      className={cn('inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-canvas-card text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-canvas-darkCard dark:text-slate-100 dark:hover:border-brand-400 dark:hover:bg-brand-500/15 focus-visible:ring-brand-500', className)}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

function ConnectedThemeToggle(props) {
  const { theme, toggleTheme } = useTheme();
  return <ThemeToggleButton {...props} theme={theme} toggleTheme={toggleTheme} />;
}

function LocalThemeToggle(props) {
  const [theme, setTheme] = useState(storedTheme);
  const toggleTheme = useCallback(() => {
    const selected = theme === 'dark' ? 'light' : 'dark';
    setTheme(selected);
    applyTheme(selected);
    cacheTheme(selected);
  }, [theme]);
  return <ThemeToggleButton {...props} theme={theme} toggleTheme={toggleTheme} />;
}

export default function ThemeToggle(props) {
  return useContext(ThemeContext) ? <ConnectedThemeToggle {...props} /> : <LocalThemeToggle {...props} />;
}
