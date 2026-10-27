import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Navbar from './Navbar';

const mocks = vi.hoisted(() => ({
  isBusinessMode: false,
  logout: vi.fn(),
  install: vi.fn(),
  bell: vi.fn(),
}));

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Ayesha Khan', email: 'ayesha@example.test', financeMode: 'householder' },
    logout: mocks.logout,
  }),
}));
vi.mock('../../features/business', () => ({
  useBusiness: () => ({ isBusinessMode: mocks.isBusinessMode }),
}));
vi.mock('../../features/notifications', () => ({
  NotificationBell: () => <button type="button" onClick={mocks.bell}>Notifications</button>,
}));
vi.mock('../../shared/hooks/usePwaInstall', () => ({
  default: () => ({
    isInstalled: false,
    isPromptAvailable: true,
    isIos: false,
    platform: 'desktop',
    modalOpen: false,
    openModal: vi.fn(),
    closeModal: vi.fn(),
    triggerInstall: mocks.install,
  }),
}));
vi.mock('../../shared/components/pwa/InstallAppModal', () => ({ default: () => null }));

function renderNavbar(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Navbar onOpenMenu={vi.fn()} onOpenFeedback={vi.fn()} {...props} />
      <Routes>
        <Route path="/dashboard" element={null} />
        <Route path="/settings" element={<p>Settings destination</p>} />
        <Route path="/login" element={<p>Login destination</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Navbar mode-switch removal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isBusinessMode = false;
  });

  it.each([false, true])('shows only the brand and utility controls when business mode is %s', async (businessMode) => {
    mocks.isBusinessMode = businessMode;
    const { container } = renderNavbar();
    const header = container.querySelector('header');

    expect(screen.getByRole('link', { name: /hisabki kitab/i })).toHaveAttribute('href', businessMode ? '/business' : '/dashboard');
    expect(header.firstElementChild.children).toHaveLength(3);
    expect(header.querySelector('.ml-auto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^personal$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^business$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Your Businesses')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /install \/ download app/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to (dark|light) theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ayesha/i }));
    expect(screen.getByText('ayesha@example.test')).toBeInTheDocument();
    expect(screen.queryByText('Household Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Switch to Business Mode')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile and settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('keeps settings, feedback, logout, install, theme and notifications working', async () => {
    const onOpenFeedback = vi.fn();
    renderNavbar({ onOpenFeedback });

    await userEvent.click(screen.getByRole('button', { name: /install \/ download app/i }));
    expect(mocks.install).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(mocks.bell).toHaveBeenCalledOnce();
    const themeButton = screen.getByRole('button', { name: /switch to (dark|light) theme/i });
    const oldLabel = themeButton.getAttribute('aria-label');
    await userEvent.click(themeButton);
    expect(themeButton.getAttribute('aria-label')).not.toBe(oldLabel);

    await userEvent.click(screen.getByRole('button', { name: /ayesha/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(onOpenFeedback).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: /ayesha/i }));
    await userEvent.click(screen.getByRole('link', { name: 'Profile and settings' }));
    expect(screen.getByText('Settings destination')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ayesha/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Login destination')).toBeInTheDocument();
  });
});
