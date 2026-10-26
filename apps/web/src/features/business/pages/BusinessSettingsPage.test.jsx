import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BusinessSettingsPage from './BusinessSettingsPage';

const mocks = vi.hoisted(() => ({
  activeBusinessId: 'biz-1',
  setActiveBusinessId: vi.fn(),
  openOnboarding: vi.fn(),
}));

vi.mock('../BusinessContext', () => ({
  useBusiness: () => ({
    activeBusiness: { id: mocks.activeBusinessId, name: 'First Business' },
    activeBusinessId: mocks.activeBusinessId,
    businesses: [
      { id: 'biz-1', name: 'First Business' },
      { id: 'biz-2', name: 'Second Business' },
    ],
    setActiveBusinessId: mocks.setActiveBusinessId,
    refreshBusinesses: vi.fn(),
    openOnboarding: mocks.openOnboarding,
  }),
}));

describe('Business Settings account selection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves switching businesses and opening the business setup flow outside the header', async () => {
    render(<BusinessSettingsPage />);

    const selector = screen.getByRole('combobox', { name: 'Your Businesses' });
    expect(selector).toHaveValue('biz-1');
    await userEvent.selectOptions(selector, 'biz-2');
    expect(mocks.setActiveBusinessId).toHaveBeenCalledWith('biz-2');

    await userEvent.click(screen.getByRole('button', { name: 'Add New Business' }));
    expect(mocks.openOnboarding).toHaveBeenCalledOnce();
  });
});
