import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChannelPage } from './ChannelPage';
import { useChannels } from '../hooks/useChannels';
import { usePosts } from '../hooks/usePosts';
import { useQueuedDrafts } from '../hooks/useQueuedDrafts';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile', () => ({
  useProfile: () => ({
    data: {
      id: 'user-1',
      username: 'renz',
      display_name: 'Ren',
      avatar_url: null,
      city_id: 'city-1',
      reputation_score: 0,
      created_at: '2026-01-01',
    },
    isLoading: false,
  }),
}));

vi.mock('../hooks/useChannels');
vi.mock('../hooks/usePosts');
vi.mock('../hooks/useQueuedDrafts');

const mockUseChannels = vi.mocked(useChannels);
const mockUsePosts = vi.mocked(usePosts);
const mockUseQueuedDrafts = vi.mocked(useQueuedDrafts);

beforeEach(() => {
  mockUseQueuedDrafts.mockReturnValue({ data: [], isLoading: false } as any);
});

function renderAt(path: string) {
  mockUseChannels.mockReturnValue({
    data: [{ id: 'ch-1', name: 'Pi Official', slug: 'pi-official', city_id: null, description: null }],
    isLoading: false,
  } as any);
  mockUsePosts.mockReturnValue({ data: [], isLoading: false } as any);

  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/channels/:slug" element={<ChannelPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ChannelPage', () => {
  it('shows the channel name and composer once the channel resolves', async () => {
    renderAt('/channels/pi-official');
    await waitFor(() => expect(screen.getByText('Pi Official')).toBeInTheDocument());
    expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument();
  });

  it('queries posts scoped to the resolved channel id, not the null city-feed scope', async () => {
    renderAt('/channels/pi-official');
    await waitFor(() =>
      expect(mockUsePosts).toHaveBeenCalledWith(
        expect.objectContaining({ channelId: 'ch-1', viewerId: 'user-1' })
      )
    );
  });

  it('shows a queued draft scoped to this channel above the real posts', async () => {
    mockUseQueuedDrafts.mockReturnValue({
      data: [
        {
          id: 'draft-1',
          authorId: 'user-1',
          cityId: 'city-1',
          channelId: 'ch-1',
          postType: 'text',
          body: 'Channel draft',
          status: 'queued',
          lastError: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
    } as any);

    renderAt('/channels/pi-official');
    await waitFor(() => expect(screen.getByText('Channel draft')).toBeInTheDocument());
  });
});
