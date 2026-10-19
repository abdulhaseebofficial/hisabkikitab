import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
export const THEME_STORAGE_KEY = 'hkk-theme';
export const THEMES = ['light', 'dark'];

const systemTheme = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const safeTheme = (value) => THEMES.includes(value) ? value : systemTheme();
export const storedTheme = () => {
  if (typeof window === 'undefined') return 'light';
  try { return safeTheme(window.localStorage.getItem(THEME_STORAGE_KEY)); } catch { return systemTheme(); }
};

export const cacheTheme = (theme) => {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(THEME_STORAGE_KEY, safeTheme(theme)); } catch { /* Browser storage is optional. */ }
};

export const applyTheme = (theme) => {
  if (typeof document === 'undefined') return;
  const selected = safeTheme(theme);
  const background = selected === 'dark' ? '#081b4b' : '#f4f8ff';
  document.documentElement.classList.toggle('dark', selected === 'dark');
  document.documentElement.dataset.theme = selected;
  document.documentElement.style.backgroundColor = background;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
};

/** Browser-persistent theme for public, auth and signed-in screens.
 * The pending API branch has a different theme enum, so appearance stays local
 * until that contract is reconciled in a separate backend release.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(storedTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      try { if (window.localStorage.getItem(THEME_STORAGE_KEY)) return; } catch { /* Follow OS when storage is blocked. */ }
      setThemeState(media.matches ? 'dark' : 'light');
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const setTheme = useCallback((requested) => {
    const selected = safeTheme(requested);
    setThemeState(selected);
    applyTheme(selected);
    cacheTheme(selected);
    return selected;
  }, []);
  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [setTheme, theme]);
  const value = useMemo(() => ({ theme, resolved: theme, isDark: theme === 'dark', setTheme, toggleTheme }), [setTheme, theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
};

export default ThemeContext;
