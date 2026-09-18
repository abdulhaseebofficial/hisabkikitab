import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetAnalyticsForTests,
  initializeAnalytics,
  normalizePage,
  setAnalyticsUserProperties,
  trackEvent,
  trackPageView,
} from './analytics';

beforeEach(() => {
  __resetAnalyticsForTests();
  delete window.gtag;
  delete window.dataLayer;
  document.getElementById('hkk-ga4-script')?.remove();
});

it('does nothing safely without a measurement id', () => {
  expect(initializeAnalytics({ enabled: true, measurementId: '' })).toBe(false);
  expect(trackEvent('expense_created')).toBe(false);
  expect(document.querySelector('[src*="googletagmanager"]')).toBeNull();
});

it('initializes once with asynchronous loading and automatic page views disabled', () => {
  expect(initializeAnalytics({ enabled: true, measurementId: 'G-TEST123' })).toBe(true);
  expect(initializeAnalytics({ enabled: true, measurementId: 'G-TEST123' })).toBe(false);
  const script = document.getElementById('hkk-ga4-script');
  expect(script.async).toBe(true);
  expect(script.src).toContain('G-TEST123');
  expect(window.dataLayer).toHaveLength(2);
  expect(window.dataLayer[1][0]).toBe('config');
  expect(window.dataLayer[1][2]).toMatchObject({ send_page_view: false });
});

it('tracks one sanitized page view per SPA path', () => {
  initializeAnalytics({ enabled: true, measurementId: 'G-TEST123' });
  const gtag = vi.fn();
  window.gtag = gtag;
  expect(trackPageView('/dashboard?private=yes', 'Dashboard')).toBe(true);
  expect(trackPageView('/dashboard', 'Dashboard')).toBe(false);
  expect(gtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({ page_path: '/dashboard' }));
  expect(normalizePage('/reset-password/secret-token')).toBe('/reset-password/:token');
});

it('sends only allowlisted event parameters and drops sensitive values', () => {
  initializeAnalytics({ enabled: true, measurementId: 'G-TEST123' });
  const gtag = vi.fn();
  window.gtag = gtag;
  trackEvent('finance_mode_changed', {
    finance_mode: 'householder', email: 'private@example.com', amount: 17500, note: 'private', id: '123',
  });
  expect(gtag).toHaveBeenCalledWith('event', 'finance_mode_changed', { finance_mode: 'householder' });
});

it('rejects unknown events and invalid dimensions, and keeps user properties non-identifying', () => {
  initializeAnalytics({ enabled: true, measurementId: 'G-TEST123' });
  const gtag = vi.fn();
  window.gtag = gtag;
  expect(trackEvent('arbitrary_event', { email: 'private@example.com' })).toBe(false);
  setAnalyticsUserProperties({ financeMode: 'student', language: 'roman_ur', email: 'private@example.com' });
  expect(gtag).toHaveBeenCalledWith('set', 'user_properties', {
    finance_mode: 'student', app_language: 'roman_ur',
  });
});

