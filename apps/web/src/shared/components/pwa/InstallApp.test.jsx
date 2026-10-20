import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InstallAppModal from './InstallAppModal';

describe('PWA Install Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders InstallAppModal with device instruction tabs', () => {
    const handleClose = vi.fn();
    const handleInstall = vi.fn();

    render(
      <InstallAppModal
        open={true}
        onClose={handleClose}
        isInstalled={false}
        isPromptAvailable={true}
        isIos={false}
        onTriggerInstall={handleInstall}
      />
    );

    expect(screen.getByText('Download & Install App')).toBeInTheDocument();
    expect(screen.getByText('HisabKi Kitab App')).toBeInTheDocument();
    expect(screen.getByText('Android')).toBeInTheDocument();
    expect(screen.getByText('iPhone / iOS')).toBeInTheDocument();
    expect(screen.getByText('PC / Laptop')).toBeInTheDocument();

    // Click on iPhone / iOS tab
    fireEvent.click(screen.getByText('iPhone / iOS'));
    expect(screen.getByText(/Open in Safari/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Add to Home Screen/i).length).toBeGreaterThan(0);

    // Click on PC / Laptop tab
    fireEvent.click(screen.getByText('PC / Laptop'));
    expect(screen.getByText(/Use Chrome or Edge/i)).toBeInTheDocument();
  });

  it('triggers install callback when Install Now button is clicked in modal', () => {
    const handleClose = vi.fn();
    const handleInstall = vi.fn();

    render(
      <InstallAppModal
        open={true}
        onClose={handleClose}
        isInstalled={false}
        isPromptAvailable={true}
        isIos={false}
        onTriggerInstall={handleInstall}
      />
    );

    const installButtons = screen.getAllByRole('button', { name: /install/i });
    expect(installButtons.length).toBeGreaterThan(0);
    fireEvent.click(installButtons[0]);
    expect(handleInstall).toHaveBeenCalled();
  });

  it('renders Install Now button even when isPromptAvailable is false and guides the user', () => {
    const handleClose = vi.fn();
    const handleInstall = vi.fn();

    render(
      <InstallAppModal
        open={true}
        onClose={handleClose}
        isInstalled={false}
        isPromptAvailable={false}
        isIos={false}
        onTriggerInstall={handleInstall}
      />
    );

    const installButtons = screen.getAllByRole('button', { name: /install/i });
    expect(installButtons.length).toBeGreaterThan(0);
    fireEvent.click(installButtons[0]);
    // When native prompt is not available, user is given guided feedback
    expect(handleInstall).not.toHaveBeenCalled();
  });
});
