import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthContext from '../../features/auth/AuthContext';
import profileApi from '../../shared/api/profileApi';
import { ThemeProvider, THEME_STORAGE_KEY, useTheme } from './ThemeProvider';

vi.mock('../../shared/api/profileApi', () => ({ default: { update: vi.fn() } }));

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button type="button" onClick={toggleTheme}>{theme}</button>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
    vi.clearAllMocks();
  });

  it('restores a saved browser preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('switches light and dark for a demo session without a profile write', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const auth = { user: { id: 'demo', isDemo: true }, updateUser: vi.fn() };
    render(<AuthContext.Provider value={auth}><ThemeProvider><Probe /></ThemeProvider></AuthContext.Provider>);
    await userEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(profileApi.update).not.toHaveBeenCalled();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('does not send a new theme enum to the unfinished account API', async () => {
    const auth = { user: { id: 'user-1', theme: 'purple' }, updateUser: vi.fn() };
    render(<AuthContext.Provider value={auth}><ThemeProvider><Probe /></ThemeProvider></AuthContext.Provider>);
    await userEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(profileApi.update).not.toHaveBeenCalled();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('does not crash when browser storage is restricted', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });
    expect(() => render(<ThemeProvider><Probe /></ThemeProvider>)).not.toThrow();
    getItem.mockRestore();
  });
});
