import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import businessApi from './api/businessApi';
import { useAuth } from '../auth';

const BusinessContext = createContext(null);
const MODE_STORAGE_KEY = 'hkk_app_mode';
const ACTIVE_BIZ_KEY = 'hkk_active_business_id';

export function BusinessProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [mode, setModeState] = useState(() => {
    try {
      return localStorage.getItem(MODE_STORAGE_KEY) || 'personal';
    } catch {
      return 'personal';
    }
  });

  const [businesses, setBusinesses] = useState([]);
  const [activeBusinessId, setActiveBusinessIdState] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_BIZ_KEY) || null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const setMode = useCallback((newMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, newMode);
    } catch { /* optional storage */ }
  }, []);

  const setActiveBusinessId = useCallback((id) => {
    setActiveBusinessIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_BIZ_KEY, id);
      else localStorage.removeItem(ACTIVE_BIZ_KEY);
    } catch { /* optional storage */ }
  }, []);

  const refreshBusinesses = useCallback(async () => {
    if (!isAuthenticated || user?.isDemo) return [];
    setLoading(true);
    try {
      const list = await businessApi.listBusinesses();
      setBusinesses(list || []);
      if (list && list.length > 0) {
        if (!activeBusinessId || !list.some((b) => b.id === activeBusinessId)) {
          setActiveBusinessId(list[0].id);
        }
      } else {
        setActiveBusinessId(null);
      }
      return list;
    } catch (e) {
      console.error('[business] Failed to fetch businesses:', e);
      return [];
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.isDemo, activeBusinessId, setActiveBusinessId]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshBusinesses();
    } else {
      setBusinesses([]);
      setActiveBusinessId(null);
    }
  }, [isAuthenticated, refreshBusinesses, setActiveBusinessId]);

  const activeBusiness = useMemo(() => {
    return businesses.find((b) => b.id === activeBusinessId) || null;
  }, [businesses, activeBusinessId]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      isBusinessMode: mode === 'business',
      businesses,
      activeBusiness,
      activeBusinessId,
      setActiveBusinessId,
      loading,
      refreshBusinesses,
      onboardingOpen,
      openOnboarding: () => setOnboardingOpen(true),
      closeOnboarding: () => setOnboardingOpen(false),
    }),
    [mode, setMode, businesses, activeBusiness, activeBusinessId, setActiveBusinessId, loading, refreshBusinesses, onboardingOpen]
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

const DEFAULT_BUSINESS_CONTEXT = {
  mode: 'personal',
  setMode: () => {},
  isBusinessMode: false,
  businesses: [],
  activeBusiness: null,
  activeBusinessId: null,
  setActiveBusinessId: () => {},
  loading: false,
  refreshBusinesses: async () => [],
  onboardingOpen: false,
  openOnboarding: () => {},
  closeOnboarding: () => {},
};

export const useBusiness = () => {
  const context = useContext(BusinessContext);
  return context || DEFAULT_BUSINESS_CONTEXT;
};

export default BusinessContext;

