import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChannelPage } from './ChannelPage';
import { useChannels } from '../hooks/useChannels';
import { usePosts } from '../hooks/usePosts';

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
vi.mock('../hooks/useCreatePost', () => ({
  useCreatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const mockUseChannels = vi.mocked(useChannels);
const mockUsePosts = vi.mocked(usePosts);

function renderAt(path: string) {
  mockUseChannels.mockReturnValue({
    data: [{ id: 'ch-1', name: 'Pi Official', slug: 'pi-official', city_id: null, description: null }],
    isLoading: false,
  } as any);
  mockUsePosts.mockReturnValue({ data: [], isLoading: false } as any);

  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/channels/:slug" element={<ChannelPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ChannelPage', () => {
  it('shows the channel name and composer once the channel resolves', async () => {
    renderAt('/channels/pi-official');
    await waitFor(() => expect(screen.getByText('Pi Official')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('queries posts scoped to the resolved channel id, not the null city-feed scope', async () => {
    renderAt('/channels/pi-official');
    await waitFor(() =>
      expect(mockUsePosts).toHaveBeenCalledWith(
        expect.objectContaining({ channelId: 'ch-1', viewerId: 'user-1' })
      )
    );
  });
});
