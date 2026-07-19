import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsernameSetupPage } from './UsernameSetupPage';

// jsdom doesn't implement the Pointer Events APIs that Radix UI's Select
// relies on for its interactions; polyfill them so userEvent clicks work.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture ??= () => false;
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  window.HTMLElement.prototype.scrollIntoView ??= () => {};
});

const mockInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useCities', () => ({
  useCities: () => ({
    data: [{ id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' }],
    isLoading: false,
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
  it('requires a city to be selected before the form can submit', async () => {
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('submits the chosen username, display name, and city', async () => {
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Cebu City' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(mockInsert).toHaveBeenCalledWith({
        id: 'user-1',
        username: 'renz',
        display_name: 'renz',
        city_id: 'city-1',
      })
    );
  });

  it('shows a friendly message when the username is already taken', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('username'), 'renz');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Cebu City' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(screen.getByText('That username is already taken.')).toBeInTheDocument()
    );
  });
});
