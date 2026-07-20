import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FeedPage } from './FeedPage';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { usePosts } from '../hooks/usePosts';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile');
vi.mock('../hooks/useCities');
vi.mock('../hooks/usePosts');
vi.mock('../hooks/useCreatePost', () => ({
  useCreatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const mockUseProfile = vi.mocked(useProfile);
const mockUseCities = vi.mocked(useCities);
const mockUsePosts = vi.mocked(usePosts);

beforeEach(() => {
  mockUseProfile.mockReturnValue({
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
  } as any);

  mockUseCities.mockReturnValue({
    data: [{ id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines' }],
    isLoading: false,
  } as any);

  mockUsePosts.mockReturnValue({ data: [], isLoading: false } as any);
});

function renderPage() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <FeedPage />
    </QueryClientProvider>
  );
}

describe('FeedPage', () => {
  it('shows the city feed heading and composer once profile/cities have loaded', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Cebu City Feed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no posts yet', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('No posts yet — be the first to post!')).toBeInTheDocument());
  });

  it('renders post cards when posts are returned', async () => {
    mockUsePosts.mockReturnValue({
      data: [
        {
          id: 'post-1',
          author_id: 'user-1',
          city_id: 'city-1',
          channel_id: null,
          post_type: 'text',
          body: 'Hello Cebu!',
          shared_post_id: null,
          created_at: '2026-01-01T00:00:00Z',
          author: { username: 'renz', display_name: 'Ren', avatar_url: null },
          post_media: null,
          like_count: 0,
          comment_count: 0,
          viewer_has_liked: false,
          viewer_has_bookmarked: false,
        },
      ],
      isLoading: false,
    } as any);

    renderPage();
    await waitFor(() => expect(screen.getByText('Hello Cebu!')).toBeInTheDocument());
  });
});
