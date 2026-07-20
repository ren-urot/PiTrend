import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => false,
}));

vi.mock('../../lib/offlineQueue', () => ({
  processQueue: vi.fn().mockResolvedValue(undefined),
}));

describe('AppShell', () => {
  it('renders all six nav tabs and the active route content', () => {
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

    expect(screen.getAllByText('Feed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Channels').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Marketplace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('News').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getByText('Feed content')).toBeInTheDocument();
  });
});
