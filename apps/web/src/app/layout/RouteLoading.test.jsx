import { lazy, Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import AppLayout from './AppLayout';

vi.mock('../../features/auth/AuthContext', () => ({ useAuth: () => ({ user: { financeMode: 'shared_living' } }) }));
vi.mock('./Navbar', () => ({ default: () => <header>App navigation</header> }));
vi.mock('./Footer', () => ({ default: () => null }));

it('keeps the app navigation visible while a route is still loading', async () => {
  const PendingPage = lazy(() => new Promise(() => {}));
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Suspense fallback={<p>Entire app loading</p>}>
        <Routes><Route element={<AppLayout />}><Route path="/settings" element={<PendingPage />} /></Route></Routes>
      </Suspense>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  expect(screen.getByText('App navigation')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Manage Space/ })).toBeInTheDocument();
  expect(screen.queryByText('Entire app loading')).not.toBeInTheDocument();
});
