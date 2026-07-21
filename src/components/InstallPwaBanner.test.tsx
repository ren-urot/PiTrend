import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallPwaBanner } from './InstallPwaBanner';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

vi.mock('../hooks/useInstallPrompt');
const mockUseInstallPrompt = vi.mocked(useInstallPrompt);

describe('InstallPwaBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when the app is not installable', () => {
    mockUseInstallPrompt.mockReturnValue({ canInstall: false, promptInstall: vi.fn() });
    render(<InstallPwaBanner />);
    expect(screen.queryByText('Install Pi Trend')).not.toBeInTheDocument();
  });

  it('shows the banner with the logo when installable', () => {
    mockUseInstallPrompt.mockReturnValue({ canInstall: true, promptInstall: vi.fn() });
    render(<InstallPwaBanner />);
    expect(screen.getByText('Install Pi Trend')).toBeInTheDocument();
    expect(screen.getByAltText('Pi Trend')).toBeInTheDocument();
  });

  it('calls promptInstall when Install is clicked', async () => {
    const promptInstall = vi.fn();
    mockUseInstallPrompt.mockReturnValue({ canInstall: true, promptInstall });
    render(<InstallPwaBanner />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Install' }));
    expect(promptInstall).toHaveBeenCalled();
  });

  it('hides when dismissed, then reappears automatically after 1 minute', () => {
    vi.useFakeTimers();
    mockUseInstallPrompt.mockReturnValue({ canInstall: true, promptInstall: vi.fn() });
    render(<InstallPwaBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Install Pi Trend')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(screen.getByText('Install Pi Trend')).toBeInTheDocument();
  });
});
