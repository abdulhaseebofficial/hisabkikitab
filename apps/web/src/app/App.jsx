import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../features/auth/index';
import { ThemeProvider } from './providers/ThemeProvider';
import LanguageProvider from './providers/LanguageProvider';
import ProtectedRoute, { PublicOnlyRoute } from './routes/ProtectedRoute';
import { PageSpinner } from '../shared/components/ui/Spinner';
import AnalyticsObserver from './providers/AnalyticsObserver';
import SeoBoundary from './routes/SeoBoundary';
import ConsentBanner from '../shared/analytics/ConsentBanner';

// Auth screens load eagerly - they are the first thing most visitors see.
const Login = lazy(() => import('../features/auth/pages/LoginPage'));
const Register = lazy(() => import('../features/auth/pages/RegisterPage'));
const ForgotPassword = lazy(() => import('../features/auth/pages/ForgotPasswordPage'));
const ResetPassword = lazy(() => import('../features/auth/pages/ResetPasswordPage'));
const AppLayout = lazy(() => import('./layout/AppLayout'));

// The rest is code-split so the initial bundle stays small on a phone.
const Onboarding = lazy(() => import('../features/onboarding/pages/OnboardingPage'));
const Dashboard = lazy(() => import('../features/dashboard/pages/DashboardPage'));
const Expenses = lazy(() => import('../features/expenses/pages/ExpensesPage'));
const Income = lazy(() => import('../features/income/pages/IncomePage'));
const Goals = lazy(() => import('../features/goals/pages/GoalsPage'));
const Debts = lazy(() => import('../features/debts/pages/DebtsPage'));
const Budget = lazy(() => import('../features/budgets/pages/BudgetPage'));
const AIAdvisor = lazy(() => import('../features/advisor/pages/AdvisorPage'));
const Reports = lazy(() => import('../features/reports/pages/ReportsPage'));
const SettingsPage = lazy(() => import('../features/settings/pages/SettingsPage'));
const NotFound = lazy(() => import('./routes/NotFoundPage'));
let initialPublicRoute;
const LazyLearnPage = lazy(() => import('../features/learn/LearnPage'));
const LazyToolsPage = lazy(() => import('../features/tools/pages/ToolsPage'));
const LazyTrustPage = lazy(() => import('../features/trust/TrustPage'));
const LearnPage = (props) => { const Component = initialPublicRoute?.kind === 'learn' ? initialPublicRoute.Component : LazyLearnPage; return <Component {...props} />; };
const ToolsPage = (props) => { const Component = initialPublicRoute?.kind === 'tools' ? initialPublicRoute.Component : LazyToolsPage; return <Component {...props} />; };
const TrustPage = (props) => { const Component = initialPublicRoute?.kind === 'trust' ? initialPublicRoute.Component : LazyTrustPage; return <Component {...props} />; };

export async function prepareInitialRoute(path) {
  if (path === '/' || /^\/learn(?:\/|$)/.test(path)) {
    const { default: Component } = await import('../features/learn/LearnPage');
    initialPublicRoute = { kind: 'learn', Component };
  } else if (/^\/tools(?:\/|$)/.test(path)) {
    const { default: Component } = await import('../features/tools/pages/ToolsPage');
    initialPublicRoute = { kind: 'tools', Component };
  } else if (/^\/(about|contact|privacy|terms|disclaimer)\/?$/.test(path)) {
    const { default: Component } = await import('../features/trust/TrustPage');
    initialPublicRoute = { kind: 'trust', Component };
  }
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
            <AnalyticsObserver />
            <ConsentBanner />
            <SeoBoundary />
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                {/* Signed out only */}
                <Route element={<PublicOnlyRoute />}>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password/:token" element={<ResetPassword />} />
                </Route>

                {/* Signed in, but before the wizard is finished */}
                <Route element={<ProtectedRoute requireOnboarding={false} />}>
                  <Route path="/onboarding" element={<Onboarding />} />
                </Route>

                {/* The app proper */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/expenses" element={<Expenses />} />
                    <Route path="/income" element={<Income />} />
                    <Route path="/goals" element={<Goals />} />
                    <Route path="/debts" element={<Debts />} />
                    <Route path="/budget" element={<Budget />} />
                    <Route path="/advisor" element={<AIAdvisor />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Route>

                <Route path="/" element={<LearnPage />} />
                <Route path="/learn/*" element={<LearnPage />} />
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/tools/:tool" element={<ToolsPage />} />
                <Route path="/about" element={<TrustPage />} />
                <Route path="/contact" element={<TrustPage />} />
                <Route path="/privacy" element={<TrustPage />} />
                <Route path="/terms" element={<TrustPage />} />
                <Route path="/disclaimer" element={<TrustPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>

            <Toaster
              position="top-center"
              toastOptions={{
                duration: 3500,
                className:
                  '!bg-canvas-card !text-slate-800 !border !border-slate-200 !rounded-xl !text-sm !shadow-lift !max-w-md dark:!bg-canvas-darkCard dark:!text-slate-100 dark:!border-slate-800',
                success: { iconTheme: { primary: '#2f7d4f', secondary: '#fff' } },
                error: { iconTheme: { primary: '#b3261e', secondary: '#fff' }, duration: 5000 },
              }}
            />
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
