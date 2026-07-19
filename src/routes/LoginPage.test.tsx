import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const mockSignInWithEmail = vi.fn().mockResolvedValue({ error: null });

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    signInWithEmail: mockSignInWithEmail,
    signOut: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  it('sends a magic link and shows a confirmation', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@example.com'), 'ren@example.com');
    await user.click(screen.getByRole('button', { name: 'Send magic link' }));

    await waitFor(() => expect(screen.getByText('Check your email')).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('ren@example.com');
  });
});
