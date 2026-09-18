import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../features/auth/index';
import { ThemeProvider } from './providers/ThemeProvider';
import LanguageProvider from './providers/LanguageProvider';
import ProtectedRoute, { PublicOnlyRoute } from './routes/ProtectedRoute';
import AppLayout from './layout/AppLayout';
import { PageSpinner } from '../shared/components/ui/Spinner';
import AnalyticsObserver from './providers/AnalyticsObserver';

// Auth screens load eagerly - they are the first thing most visitors see.
import Login from '../features/auth/pages/LoginPage';
import Register from '../features/auth/pages/RegisterPage';
import ForgotPassword from '../features/auth/pages/ForgotPasswordPage';
import ResetPassword from '../features/auth/pages/ResetPasswordPage';

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

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
            <AnalyticsObserver />
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

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
