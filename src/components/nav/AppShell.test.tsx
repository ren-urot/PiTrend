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

vi.mock('../../hooks/useProfile', () => ({
  useProfile: () => ({
    data: {
      id: 'user-1',
      username: 'ren',
      display_name: 'Ren Urot',
      avatar_url: null,
      city_id: 'city-1',
      reputation_score: 0,
      created_at: '2026-01-01',
    },
    isLoading: false,
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

  it('shows a mobile header with the Pi Trend logo and a link to the profile', () => {
    mockUseUnreadCount.mockReturnValue({ data: 0 } as any);
    renderShell();

    expect(screen.getAllByAltText('Pi Trend').length).toBeGreaterThan(0);
    const profileLinks = screen.getAllByRole('link', { name: 'Profile' });
    expect(profileLinks.length).toBeGreaterThan(0);
    profileLinks.forEach((link) => expect(link).toHaveAttribute('href', '/profile'));
  });

  it('shows a Search link in both the sidebar and mobile header', () => {
    mockUseUnreadCount.mockReturnValue({ data: 0 } as any);
    renderShell();

    const searchLinks = screen.getAllByRole('link', { name: 'Search' });
    expect(searchLinks.length).toBeGreaterThan(0);
    searchLinks.forEach((link) => expect(link).toHaveAttribute('href', '/search'));
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
