import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';
import { useUnreadCount } from '../../hooks/useUnreadCount';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => false,
}));

vi.mock('../../lib/offlineQueue', () => ({
  processQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useUnreadCount');
const mockUseUnreadCount = vi.mocked(useUnreadCount);

function renderShell() {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [{ path: '/feed', element: <div>Feed content</div> }],
      },
    ],
    { initialEntries: ['/feed'] }
  );

  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe('AppShell', () => {
  it('renders all six nav tabs and the active route content', () => {
    mockUseUnreadCount.mockReturnValue({ data: 0 } as any);
    renderShell();

    expect(screen.getAllByText('Feed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Channels').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Marketplace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('News').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getByText('Feed content')).toBeInTheDocument();
  });

  it('shows an unread badge on the Messages tab when there are unread messages', () => {
    mockUseUnreadCount.mockReturnValue({ data: 3 } as any);
    renderShell();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('shows no badge when there are no unread messages', () => {
    mockUseUnreadCount.mockReturnValue({ data: 0 } as any);
    renderShell();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('caps the badge at "9+" for large counts', () => {
    mockUseUnreadCount.mockReturnValue({ data: 42 } as any);
    renderShell();
    expect(screen.getAllByText('9+').length).toBeGreaterThan(0);
  });
});
