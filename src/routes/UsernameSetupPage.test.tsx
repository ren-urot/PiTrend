import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsernameSetupPage } from './UsernameSetupPage';

const mockInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: mockInsert }),
  },
}));

function renderPage() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsernameSetupPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UsernameSetupPage', () => {
  it('submits the chosen username and display name', async () => {
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(mockInsert).toHaveBeenCalledWith({
        id: 'user-1',
        username: 'renz',
        display_name: 'renz',
      })
    );
  });

  it('shows a friendly message when the username is already taken', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(screen.getByText('That username is already taken.')).toBeInTheDocument()
    );
  });
});
