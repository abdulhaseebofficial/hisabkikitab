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

it('rejects measurement ids that do not match the GA4 format', () => {
  expect(initializeAnalytics({ enabled: true, measurementId: 'G-TOO-SHORT' })).toBe(false);
  expect(initializeAnalytics({ enabled: true, measurementId: 'G-TEST1234567' })).toBe(false);
  expect(document.querySelector('[src*="googletagmanager"]')).toBeNull();
});

it('initializes once with asynchronous loading and automatic page views disabled', () => {
  expect(initializeAnalytics({ enabled: true, measurementId: 'G-TEST123456' })).toBe(true);
  expect(initializeAnalytics({ enabled: true, measurementId: 'G-TEST123456' })).toBe(false);
  const script = document.getElementById('hkk-ga4-script');
  expect(script.async).toBe(true);
  expect(script.src).toContain('G-TEST123456');
  expect(window.dataLayer).toHaveLength(2);
  expect(window.dataLayer[1][0]).toBe('config');
  expect(window.dataLayer[1][2]).toMatchObject({ send_page_view: false });
});

it('tracks one sanitized page view per SPA path', () => {
  initializeAnalytics({ enabled: true, measurementId: 'G-TEST123456' });
  const gtag = vi.fn();
  window.gtag = gtag;
  expect(trackPageView('/dashboard?private=yes', 'Dashboard')).toBe(true);
  expect(trackPageView('/dashboard', 'Dashboard')).toBe(false);
  expect(gtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({ page_path: '/dashboard' }));
  expect(normalizePage('/reset-password/secret-token')).toBe('/reset-password/:token');
  expect(normalizePage('/')).toBe('/');
});

it('sends only allowlisted event parameters and drops sensitive values', () => {
  initializeAnalytics({ enabled: true, measurementId: 'G-TEST123456' });
  const gtag = vi.fn();
  window.gtag = gtag;
  trackEvent('finance_mode_changed', {
    finance_mode: 'householder', email: 'private@example.com', amount: 17500, note: 'private', id: '123',
  });
  expect(gtag).toHaveBeenCalledWith('event', 'finance_mode_changed', { finance_mode: 'householder' });
});

it('supports public content events with only non-sensitive metadata', () => {
  initializeAnalytics({ enabled: true, measurementId: 'G-TEST123456' });
  const gtag = vi.fn();
  window.gtag = gtag;
  trackEvent('article_view', { content_category: 'saving', amount: 50000 });
  trackEvent('calculator_used', { calculator_name: 'budget-calculator', income: 90000 });
  trackEvent('calculator_completed', { calculator_name: 'budget-calculator', expenses: 45000 });
  trackEvent('core_feature_cta_clicked', { feature_name: 'budget', balance: 25000 });
  trackEvent('related_article_clicked', { content_category: 'budgeting', name: 'Private user input' });
  expect(gtag.mock.calls).toEqual([
    ['event', 'article_view', { content_category: 'saving' }],
    ['event', 'calculator_used', { calculator_name: 'budget-calculator' }],
    ['event', 'calculator_completed', { calculator_name: 'budget-calculator' }],
    ['event', 'core_feature_cta_clicked', { feature_name: 'budget' }],
    ['event', 'related_article_clicked', { content_category: 'budgeting' }],
  ]);
});

it('rejects unknown events and invalid dimensions, and keeps user properties non-identifying', () => {
  initializeAnalytics({ enabled: true, measurementId: 'G-TEST123456' });
  const gtag = vi.fn();
  window.gtag = gtag;
  expect(trackEvent('arbitrary_event', { email: 'private@example.com' })).toBe(false);
  setAnalyticsUserProperties({ financeMode: 'student', language: 'roman_ur', email: 'private@example.com' });
  expect(gtag).toHaveBeenCalledWith('set', 'user_properties', {
    finance_mode: 'student', app_language: 'roman_ur',
  });
});
