import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnalyticsObserver from './AnalyticsObserver';
import * as analyticsModule from '../../shared/analytics/analytics';

vi.mock('../../features/auth', () => ({
  useAuth: () => ({ user: { financeMode: 'householder' } }),
}));

vi.mock('../../shared/i18n/I18nProvider', () => ({
  default: () => ({ language: 'en' }),
}));

vi.mock('../../shared/analytics/consent', () => ({
  analyticsConsent: () => 'granted',
  initializeConsent: vi.fn(),
  CONSENT_EVENT: 'hkk-consent-change',
}));

describe('AnalyticsObserver', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves correct title and canonical path for /templates/', async () => {
    const trackSpy = vi.spyOn(analyticsModule, 'trackPageView').mockImplementation(() => true);

    render(
      <MemoryRouter initialEntries={['/templates/']}>
        <AnalyticsObserver />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(trackSpy).toHaveBeenCalledWith(
        '/templates/',
        'Free Financial Planning & Budget Templates | HisabKi Kitab'
      );
    });
  });

  it('resolves correct title and canonical path for /features/', async () => {
    const trackSpy = vi.spyOn(analyticsModule, 'trackPageView').mockImplementation(() => true);

    render(
      <MemoryRouter initialEntries={['/features/']}>
        <AnalyticsObserver />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(trackSpy).toHaveBeenCalledWith(
        '/features/',
        'Product Features & Workspaces | HisabKi Kitab'
      );
    });
  });

  it('resolves feature sub-page title for /features/expense-tracker/', async () => {
    const trackSpy = vi.spyOn(analyticsModule, 'trackPageView').mockImplementation(() => true);

    render(
      <MemoryRouter initialEntries={['/features/expense-tracker/']}>
        <AnalyticsObserver />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(trackSpy).toHaveBeenCalledWith(
        '/features/expense-tracker/',
        'Personal Expense Tracker App | HisabKi Kitab'
      );
    });
  });

  it('does not send Page not found for valid public routes', async () => {
    const trackSpy = vi.spyOn(analyticsModule, 'trackPageView').mockImplementation(() => true);

    render(
      <MemoryRouter initialEntries={['/templates']}>
        <AnalyticsObserver />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(trackSpy).toHaveBeenCalled();
      const calledTitle = trackSpy.mock.calls[0][1];
      expect(calledTitle).not.toBe('Page not found');
      expect(calledTitle).toContain('HisabKi Kitab');
    });
  });
});
