import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicProfilePage } from './PublicProfilePage';
import { supabase } from '../lib/supabase';

const mockProfileRow = {
  id: 'user-1',
  username: 'renz',
  display_name: 'Ren',
  avatar_url: null,
  created_at: '2026-01-01',
};

let mockSessionUserId: string | undefined = 'viewer-1';
let mockPostsData: any[] = [];
let mockConnectionsData: any[] = [];
const mockConnectionsInsert = vi.fn().mockResolvedValue({ error: null });
const mockConnectionsDeleteEq = vi.fn().mockResolvedValue({ error: null });

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: mockSessionUserId ? { user: { id: mockSessionUserId } } : null,
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockProfileRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'posts') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: mockPostsData, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'connections') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: mockConnectionsData, error: null }) }),
          insert: mockConnectionsInsert,
          delete: () => ({ eq: () => ({ eq: mockConnectionsDeleteEq }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [] }) }) }),
      };
    }),
  },
}));

function renderAt(path: string) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/u/:username" element={<PublicProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PublicProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionUserId = 'viewer-1';
    mockPostsData = [];
    mockConnectionsData = [];
    mockConnectionsInsert.mockResolvedValue({ error: null });
    mockConnectionsDeleteEq.mockResolvedValue({ error: null });
  });

  it('renders a profile by username with no auth required', async () => {
    mockSessionUserId = undefined;
    mockPostsData = [];
    renderAt('/u/renz');
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());
    expect(screen.getByText('@renz')).toBeInTheDocument();
  });

  it('shows a not-found message when no profile matches the username', async () => {
    vi.mocked(supabase.from).mockImplementationOnce(
      () =>
        ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }) as never
    );

    renderAt('/u/nobody');
    await waitFor(() => expect(screen.getByText('No profile found for @nobody.')).toBeInTheDocument());
  });

  it("shows the user's posts when the viewer is signed in", async () => {
    mockSessionUserId = 'viewer-1';
    mockPostsData = [
      {
        id: 'post-1',
        author_id: 'user-1',
        city_id: 'city-1',
        channel_id: null,
        post_type: 'text',
        body: 'Hello from Ren',
        shared_post_id: null,
        created_at: '2026-01-03T00:00:00Z',
        author: { username: 'renz', display_name: 'Ren', avatar_url: null },
        post_media: null,
        poll_options: [],
        post_buy_sell: null,
        shared_post: null,
        likes: [{ count: 0 }],
        comments: [{ count: 0 }],
      },
    ];

    renderAt('/u/renz');
    await waitFor(() => expect(screen.getByText('Hello from Ren')).toBeInTheDocument());
  });

  it('shows an empty state when the user has no posts', async () => {
    mockSessionUserId = 'viewer-1';
    mockPostsData = [];

    renderAt('/u/renz');
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('No posts yet.')).toBeInTheDocument());
  });

  it('does not attempt to show posts for an anonymous viewer', async () => {
    mockSessionUserId = undefined;
    mockPostsData = [];

    renderAt('/u/renz');
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());
    expect(screen.queryByText('No posts yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading posts…')).not.toBeInTheDocument();
  });

  it('shows a Connect button and follows on click when not yet connected', async () => {
    renderAt('/u/renz');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() =>
      expect(mockConnectionsInsert).toHaveBeenCalledWith({ follower_id: 'viewer-1', followed_id: 'user-1' })
    );
  });

  it('shows a Connected button and unfollows on click when already connected', async () => {
    mockConnectionsData = [{ followed_id: 'user-1' }];

    renderAt('/u/renz');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connected' })).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Connected' }));

    await waitFor(() => expect(mockConnectionsDeleteEq).toHaveBeenCalledWith('followed_id', 'user-1'));
  });

  it('does not show a Connect button for an anonymous viewer', async () => {
    mockSessionUserId = undefined;
    renderAt('/u/renz');
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Connect/ })).not.toBeInTheDocument();
  });
});
