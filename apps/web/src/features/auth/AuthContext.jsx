import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import authService from './api/authApi';
import { setSessionExpiredHandler, getErrorMessage, bumpSessionEpoch } from '../../shared/api/client';
import { trackEvent } from '../../shared/analytics/analytics';

const AuthContext = createContext(null);
const protectedPaths = new Set(['/onboarding', '/dashboard', '/expenses', '/income', '/goals', '/debts', '/budget', '/advisor', '/reports', '/settings']);

/**
 * Owns the signed-in student, and restores the session when a protected page
 * needs it. Public guides, tools, trust, and sign-in pages work anonymously;
 * probing cookies there produces unnecessary 401 responses for visitors.
 *
 * Nothing is read from localStorage any more - the access token is not stored
 * anywhere a script can reach it. A fresh page load therefore starts with no
 * token in memory and two ways back in, tried in order:
 *
 *   /auth/me       the httpOnly access cookie authenticates it directly. This
 *                  is the common case and costs no rotation. The API client
 *                  retries a 401 through /auth/refresh when needed.
 *
 * Trying /auth/me first matters: refreshing on every reload would rotate the
 * refresh token every time somebody pressed F5.
 */
export function AuthProvider({ children }) {
  const { pathname } = useLocation();
  const [user, setUser] = useState(null);
  const [restored, setRestored] = useState(false);
  const loading = protectedPaths.has(pathname) && !restored;
  // A page can receive a login click while a /me -> /refresh
  // restoration is still in flight. Its late 401 must not clear the newly
  // authenticated user.
  const sessionVersion = useRef(0);

  const clearSession = useCallback(() => {
    setUser(null);
  }, []);

  // The axios interceptor calls this when a refresh attempt finally fails.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession();
      // Anonymous readers do not need a session to use the public library.
      if (pathname !== '/' && !/^\/(?:learn|tools)(?:\/|$)/.test(pathname)) {
        toast.error('Your session expired. Please log in again.');
      }
    });
  }, [clearSession, pathname]);

  useEffect(() => {
    if (!protectedPaths.has(pathname) || restored) return undefined;
    let cancelled = false;

    const restore = async () => {
      const version = sessionVersion.current;
      try {
        // The access cookie is sent automatically; no token in memory is the
        // normal state on a fresh load, not a signed-out one.
        const me = await authService.me();
        if (!cancelled && version === sessionVersion.current) setUser(me);
      } catch {
        // The API client has already attempted refresh for a 401. A second
        // refresh here would rotate or retry the cookie unnecessarily.
        if (!cancelled && version === sessionVersion.current) setUser(null);
      } finally {
        if (!cancelled && version === sessionVersion.current) setRestored(true);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, [pathname, restored]);

  const login = useCallback(async (credentials) => {
    sessionVersion.current += 1;
    bumpSessionEpoch();
    const loggedIn = await authService.login(credentials);
    setUser(loggedIn);
    setRestored(true);
    trackEvent('login_completed', { method: 'password' });
    toast.success(`Welcome back, ${loggedIn.name.split(' ')[0]}!`);
    return loggedIn;
  }, []);

  const register = useCallback(async (payload) => {
    sessionVersion.current += 1;
    bumpSessionEpoch();
    const created = await authService.register(payload);
    setUser(created);
    setRestored(true);
    trackEvent('sign_up_completed', { method: 'password' });
    toast.success('Account created. Let us set things up.');
    return created;
  }, []);

  /**
   * Signs in with a Google credential, and reports whether the account is new
   * so the caller can send a first timer to onboarding rather than a dashboard
   * with nothing on it yet.
   */
  const loginWithGoogle = useCallback(async (idToken) => {
    const result = await authService.google(idToken);
    setUser(result.user);
    setRestored(true);
    trackEvent(result.created ? 'sign_up_completed' : 'login_completed', { method: 'google' });
    toast.success(result.created ? 'Account created. Let us set things up.' : 'Welcome back.');
    return result;
  }, []);

  const logout = useCallback(async () => {
    sessionVersion.current += 1;
    bumpSessionEpoch();
    await authService.logout();
    trackEvent('logout_completed');
    setUser(null);
    toast.success('Logged out');
  }, []);

  /** Merge a partial update (profile edit, onboarding) into the cached user. */
  const updateUser = useCallback((patch) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authService.me();
      setUser(me);
      setRestored(true);
      return me;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      needsOnboarding: Boolean(user) && !user.onboardingCompleted,
      currency: user ? user.currency : 'PKR',
      login,
      loginWithGoogle,
      register,
      logout,
      updateUser,
      refreshUser,
    }),
    [user, loading, login, loginWithGoogle, register, logout, updateUser, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};

export default AuthContext;
