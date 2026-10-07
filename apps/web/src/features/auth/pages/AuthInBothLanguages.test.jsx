/**
 * The signed-out screens, in the reader's language.
 *
 * These are the hardest pages to get right, because there is no profile to ask.
 * Someone who chose Roman Urdu, logged out, and came back must not be handed an
 * English login form - the one screen where a reader cannot navigate their way
 * out if they cannot read it.
 *
 * So the provider falls back to what this browser last stored, and these tests
 * render the real pages with nothing but that.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider, STORAGE_KEY } from '../../../shared/i18n/I18nProvider';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';
import authService from '../api/authApi';

// The pages call the API for their config; none of that is what is under test.
vi.mock('../api/authApi', () => ({
  default: {
    config: () => Promise.resolve({ google: { enabled: false }, passwordReset: { enabled: true } }),
    forgotPassword: () => Promise.resolve({}),
    resetPassword: () => Promise.resolve({}),
  },
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    register: vi.fn(),
    loginWithGoogle: vi.fn(),
    user: null,
    isAuthenticated: false,
  }),
}));

/**
 * Renders a signed-out page with NO profile - only what the browser stored.
 * That is exactly the state a returning visitor is in.
 */
const signedOut = (storedLanguage, ui) => {
  if (storedLanguage) window.localStorage.setItem(STORAGE_KEY, storedLanguage);
  return render(
    <MemoryRouter>
      <I18nProvider language={null}>{ui}</I18nProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('the login screen', () => {
  it('reads in English by default', () => {
    signedOut(null, <LoginPage />);
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('reads in Roman Urdu for someone who chose it before logging out', () => {
    signedOut('roman_ur', <LoginPage />);
    expect(screen.getByText('Khush aamdeed')).toBeInTheDocument();
  });

  it('translates the fields, not just the heading', () => {
    signedOut('roman_ur', <LoginPage />);
    expect(screen.getByText('Password bhool gaye?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log in karein/ })).toBeInTheDocument();
  });

  it('translates the panel a signed-out visitor reads first', () => {
    // The pitch used to describe hostel life to everybody, including people
    // who came to track an electricity bill.
    signedOut('roman_ur', <LoginPage />);
    expect(screen.getByText(/Paise poora mahina chalayein/)).toBeInTheDocument();
  });
});

describe('the sign-up screen', () => {
  it('reads in Roman Urdu', () => {
    signedOut('roman_ur', <RegisterPage />);
    expect(screen.getByText('Apna account banayein')).toBeInTheDocument();
    expect(screen.getByLabelText('Poora naam')).toBeInTheDocument();
  });

  it('asks for consent in the reader\'s language', () => {
    // Consent nobody can read is not consent.
    signedOut('roman_ur', <RegisterPage />);
    expect(
      screen.getByText(/Main istemal ki shara-it aur privacy policy se ittefaq karta hoon/)
    ).toBeInTheDocument();
  });
});

describe('the password screens', () => {
  it('forgot-password reads in Roman Urdu', () => {
    signedOut('roman_ur', <ForgotPasswordPage />);
    expect(screen.getByText('Password bhool gaye?')).toBeInTheDocument();
  });

  it('does not promise a reset email when delivery is unavailable', async () => {
    const config = vi.spyOn(authService, 'config').mockResolvedValueOnce({ google: { enabled: false }, passwordReset: { enabled: false } });
    signedOut(null, <ForgotPasswordPage />);
    expect(await screen.findByText('Password reset is unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/contact');
    config.mockRestore();
  });

  it('reset-password reads in Roman Urdu', () => {
    signedOut('roman_ur', <ResetPasswordPage />);
    expect(screen.getByText('Naya password rakhein')).toBeInTheDocument();
  });
});

describe('the password field itself', () => {
  it('labels its show/hide toggle in the reader\'s language', () => {
    // A shared UI component with an English default is the quiet way a screen
    // stays half-translated for a screen-reader user.
    signedOut('roman_ur', <LoginPage />);
    expect(screen.getByRole('button', { name: 'Password dikhayein' })).toBeInTheDocument();
  });
});
