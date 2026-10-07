import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import authService from './api/authApi';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('./api/authApi', () => ({ default: { me: vi.fn(), login: vi.fn(), register: vi.fn(), google: vi.fn(), logout: vi.fn() } }));
vi.mock('../../shared/api/client', () => ({ setSessionExpiredHandler: vi.fn(), getErrorMessage: vi.fn(), bumpSessionEpoch: vi.fn() }));
vi.mock('../../shared/analytics/analytics', () => ({ trackEvent: vi.fn() }));

function Probe() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  return <><span data-testid="session">{loading ? 'loading' : user ? 'signed in' : 'anonymous'}</span><button onClick={() => navigate('/dashboard')}>Open dashboard</button></>;
}

const showAt = (path) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><Probe /></AuthProvider></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  authService.me.mockResolvedValue({ id: 'user-1', name: 'Test User', currency: 'PKR' });
});

describe('session restoration by route', () => {
  it.each(['/', '/learn/budgeting', '/tools/budget-calculator', '/about', '/privacy', '/login'])('does not probe auth on %s', async (path) => {
    showAt(path);
    expect(screen.getByTestId('session')).toHaveTextContent('anonymous');
    await waitFor(() => expect(authService.me).not.toHaveBeenCalled());
  });

  it('restores the cookie session when a public visitor opens a protected route', async () => {
    showAt('/learn');
    expect(authService.me).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open dashboard' }));
    await waitFor(() => expect(authService.me).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed in'));
  });

  it('restores the cookie session on a direct protected-page load', async () => {
    showAt('/dashboard');
    expect(screen.getByTestId('session')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed in'));
    expect(authService.me).toHaveBeenCalledTimes(1);
  });
});
