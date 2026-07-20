import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const mockSignInWithEmail = vi.fn().mockResolvedValue({ error: null });
const mockVerifyOtp = vi.fn().mockResolvedValue({ error: null });

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    signInWithEmail: mockSignInWithEmail,
    verifyOtp: mockVerifyOtp,
    signOut: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithEmail.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ error: null });
  });

  it('sends a magic link and shows the code-entry screen', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@example.com'), 'ren@example.com');
    await user.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => expect(screen.getByText('Enter your code')).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('ren@example.com');
  });

  it('lets a user reach code entry directly, without a successful send first', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Already have a code?' }));

    expect(screen.getByText('Enter your code')).toBeInTheDocument();
    expect(mockSignInWithEmail).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'ren@example.com');
    await user.type(screen.getByPlaceholderText('Code from your email'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));

    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith('ren@example.com', '123456'));
  });
});
