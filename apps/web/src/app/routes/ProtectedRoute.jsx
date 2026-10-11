import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/index';
import { PageSpinner } from '../../shared/components/ui/Spinner';
import useT from '../../shared/i18n/I18nProvider';

/**
 * Gate for every authenticated route.
 *  - while the session is being restored, show a spinner (never a flash of
 *    the login page for an already-signed-in student);
 *  - not signed in -> /login, remembering where they were headed;
 *  - signed in but onboarding unfinished -> /onboarding.
 */
export default function ProtectedRoute({ requireOnboarding = true }) {
  const { isAuthenticated, loading, needsOnboarding } = useAuth();
  const location = useLocation();
  const { t } = useT();

  if (loading) return <PageSpinner label={t('app.gettingReady')} />;

  if (!isAuthenticated) {
    return <Navigate to="/login/" state={{ from: location }} replace />;
  }

  if (requireOnboarding && needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

/** Inverse gate: keeps a signed-in student off /login and /register. */
export function PublicOnlyRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <PageSpinner label="Loading" />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
