import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import businessApi from './api/businessApi';
import { useAuth } from '../auth';

const BusinessContext = createContext(null);
const MODE_STORAGE_KEY = 'hkk_app_mode';
const ACTIVE_BIZ_KEY = 'hkk_active_business_id';

export function BusinessProvider({ children }) {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const userId = user?._id || user?.id || null;
  const isDemo = Boolean(user?.isDemo);

  const [mode, setModeState] = useState(() => {
    try {
      if (isDemo) return 'personal';
      return localStorage.getItem(MODE_STORAGE_KEY) || 'personal';
    } catch {
      return 'personal';
    }
  });

  const [businesses, setBusinesses] = useState([]);
  const [activeBusinessId, setActiveBusinessIdState] = useState(() => {
    try {
      if (isDemo) return null;
      return localStorage.getItem(ACTIVE_BIZ_KEY) || null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const prevUserIdRef = useRef(userId);

  const setMode = useCallback((newMode) => {
    if (isDemo && newMode === 'business') {
      return; // Demo users cannot enter Business Mode
    }
    setModeState(newMode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, newMode);
    } catch { /* optional storage */ }
  }, [isDemo]);

  const setActiveBusinessId = useCallback((id) => {
    setActiveBusinessIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_BIZ_KEY, id);
      else localStorage.removeItem(ACTIVE_BIZ_KEY);
    } catch { /* optional storage */ }
  }, []);

  const refreshBusinesses = useCallback(async () => {
    if (!isAuthenticated || isDemo) {
      setBusinesses([]);
      setActiveBusinessId(null);
      return [];
    }
    setLoading(true);
    try {
      const list = await businessApi.listBusinesses();
      const safeList = list || [];
      setBusinesses(safeList);
      if (safeList.length > 0) {
        if (!activeBusinessId || !safeList.some((b) => b.id === activeBusinessId)) {
          setActiveBusinessId(safeList[0].id);
        }
      } else {
        setActiveBusinessId(null);
      }
      return safeList;
    } catch (e) {
      console.error('[business] Failed to fetch businesses:', e);
      setBusinesses([]);
      setActiveBusinessId(null);
      return [];
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isDemo, activeBusinessId, setActiveBusinessId]);

  // Purge and reload on authentication/user changes or demo mode
  useEffect(() => {
    // Never purge while initial session authentication is in flight
    if (authLoading) return;

    if (prevUserIdRef.current !== userId || !isAuthenticated || isDemo) {
      prevUserIdRef.current = userId;
      setBusinesses([]);
      setActiveBusinessId(null);
      try {
        localStorage.removeItem(ACTIVE_BIZ_KEY);
      } catch { /* optional */ }

      if (isDemo || !isAuthenticated) {
        setModeState('personal');
        try {
          localStorage.setItem(MODE_STORAGE_KEY, 'personal');
        } catch { /* optional */ }
      }
    }

    if (isAuthenticated && !isDemo) {
      refreshBusinesses();
    }
  }, [userId, isAuthenticated, isDemo, authLoading, refreshBusinesses, setActiveBusinessId]);

  const activeBusiness = useMemo(() => {
    if (!activeBusinessId) return null;
    return businesses.find((b) => b.id === activeBusinessId) || null;
  }, [businesses, activeBusinessId]);

  const validatedActiveBusinessId = activeBusiness ? activeBusiness.id : null;

  const value = useMemo(
    () => ({
      mode: isDemo ? 'personal' : mode,
      setMode,
      isBusinessMode: !isDemo && mode === 'business',
      businesses,
      activeBusiness,
      activeBusinessId: validatedActiveBusinessId,
      setActiveBusinessId,
      loading,
      refreshBusinesses,
      onboardingOpen,
      openOnboarding: () => {
        if (!isDemo) setOnboardingOpen(true);
      },
      closeOnboarding: () => setOnboardingOpen(false),
    }),
    [
      isDemo,
      mode,
      setMode,
      businesses,
      activeBusiness,
      validatedActiveBusinessId,
      setActiveBusinessId,
      loading,
      refreshBusinesses,
      onboardingOpen,
    ]
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
