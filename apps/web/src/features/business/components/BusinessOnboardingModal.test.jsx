import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BusinessOnboardingModal from './BusinessOnboardingModal';
import businessApi from '../api/businessApi';
import { UUID_V4_PATTERN } from '../../../shared/utils/uuid';

const mockRefreshBusinesses = vi.fn().mockResolvedValue([]);
const mockSetActiveBusinessId = vi.fn();
const mockSetMode = vi.fn();

vi.mock('../BusinessContext', () => ({
  useBusiness: () => ({
    refreshBusinesses: mockRefreshBusinesses,
    setActiveBusinessId: mockSetActiveBusinessId,
    setMode: mockSetMode,
  }),
}));

vi.mock('../api/businessApi', () => ({
  default: {
    createBusiness: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('BusinessOnboardingModal - Idempotency & Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits onboarding with a valid RFC 4122 v4 UUID Idempotency-Key', async () => {
    businessApi.createBusiness.mockResolvedValueOnce({ id: 'biz-new-123', name: 'Karachi Mart' });

    render(<BusinessOnboardingModal open={true} onClose={() => {}} />);

    // Step 1: Identity
    const nameInput = screen.getByPlaceholderText(/Al-Madina Kiryana/i);
    fireEvent.change(nameInput, { target: { value: 'Karachi Mart' } });

    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    // Step 2: Opening Balances
    fireEvent.click(screen.getByRole('button', { name: /review/i }));

    // Step 3: Launch
    const launchBtn = screen.getByRole('button', { name: /launch business mode/i });
    fireEvent.click(launchBtn);

    await waitFor(() => {
      expect(businessApi.createBusiness).toHaveBeenCalledTimes(1);
    });

    const [payload, options] = businessApi.createBusiness.mock.calls[0];
    expect(payload.name).toBe('Karachi Mart');
    expect(options).toBeDefined();
    expect(options.headers).toBeDefined();
    const key = options.headers['Idempotency-Key'];
    expect(key).toBeDefined();
    expect(UUID_V4_PATTERN.test(key)).toBe(true);
    expect(mockSetActiveBusinessId).toHaveBeenCalledWith('biz-new-123');
    expect(mockSetMode).toHaveBeenCalledWith('business');
  });

  it('reuses the exact same UUID Idempotency-Key on network retry without form edit', async () => {
    // 1st attempt fails with network error (status 500 or network timeout)
    const netError = new Error('Network timeout');
    netError.response = { status: 500, data: { message: 'Gateway timeout' } };
    businessApi.createBusiness.mockRejectedValueOnce(netError);

    // 2nd attempt succeeds
    businessApi.createBusiness.mockResolvedValueOnce({ id: 'biz-new-456', name: 'Lahore Sweets' });

    render(<BusinessOnboardingModal open={true} onClose={() => {}} />);

    const nameInput = screen.getByPlaceholderText(/Al-Madina Kiryana/i);
    fireEvent.change(nameInput, { target: { value: 'Lahore Sweets' } });

    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.click(screen.getByRole('button', { name: /review/i }));

    const launchBtn = screen.getByRole('button', { name: /launch business mode/i });

    // First click -> fails with 500
    fireEvent.click(launchBtn);

    await waitFor(() => {
      expect(businessApi.createBusiness).toHaveBeenCalledTimes(1);
    });

    const firstKey = businessApi.createBusiness.mock.calls[0][1].headers['Idempotency-Key'];
    expect(UUID_V4_PATTERN.test(firstKey)).toBe(true);

    // Second click (retry)
    fireEvent.click(launchBtn);

    await waitFor(() => {
      expect(businessApi.createBusiness).toHaveBeenCalledTimes(2);
    });

    const secondKey = businessApi.createBusiness.mock.calls[1][1].headers['Idempotency-Key'];
    // Must be the identical key to prevent duplicate creation
    expect(secondKey).toBe(firstKey);
  });
});
