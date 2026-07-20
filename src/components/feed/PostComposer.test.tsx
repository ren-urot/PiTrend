import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostComposer } from './PostComposer';
import { queueDraftPost, processQueue } from '../../lib/offlineQueue';
import { getVideoDuration } from '../../lib/media';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../lib/offlineQueue', () => ({
  queueDraftPost: vi.fn(),
  processQueue: vi.fn(),
}));

vi.mock('../../lib/media', () => ({
  getVideoDuration: vi.fn(),
}));

const mockQueueDraftPost = vi.mocked(queueDraftPost);
const mockProcessQueue = vi.mocked(processQueue);
const mockGetVideoDuration = vi.mocked(getVideoDuration);

function renderComposer(channelId?: string | null) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PostComposer cityId="city-1" channelId={channelId} />
    </QueryClientProvider>
  );
}

async function selectMoreType(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: 'More post types' }));
  await user.click(await screen.findByRole('menuitem', { name: label }));
}

describe('PostComposer', () => {
  beforeEach(() => {
    mockQueueDraftPost.mockReset().mockResolvedValue('draft-1');
    mockProcessQueue.mockReset().mockResolvedValue(undefined);
  });

  it('queues a text post as a draft and triggers an immediate sync attempt', async () => {
    renderComposer();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("What's happening?"), 'Hello Cebu!');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith({
        authorId: 'user-1',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'Hello Cebu!',
        mediaBlob: undefined,
        pollOptions: undefined,
        buySell: undefined,
      })
    );
    await waitFor(() => expect(mockProcessQueue).toHaveBeenCalled());
  });

  it('passes a real channelId through when composing inside a channel', async () => {
    renderComposer('channel-1');

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("What's happening?"), 'Channel post');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith(
        expect.objectContaining({ channelId: 'channel-1' })
      )
    );
  });

  it('shows a file picker only when the photo type is selected', async () => {
    renderComposer();

    expect(screen.queryByLabelText('Photo')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Photo post' }));

    expect(screen.getByLabelText('Photo')).toBeInTheDocument();
  });

  it('queues a photo post with the media file as a blob', async () => {
    renderComposer();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Photo post' }));

    const file = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Photo'), file);
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'photo',
          mediaBlob: { blob: file, mediaType: 'photo' },
        })
      )
    );
  });

  it('queues poll options for a poll post', async () => {
    renderComposer();

    const user = userEvent.setup();
    await selectMoreType(user, 'Poll');

    const optionInputs = screen.getAllByPlaceholderText('Option');
    await user.type(optionInputs[0], 'CnT');
    await user.type(optionInputs[1], "Rico's");
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'poll',
          pollOptions: ['CnT', "Rico's"],
        })
      )
    );
  });

  it('queues price/currency/category for a buy & sell post', async () => {
    renderComposer();

    const user = userEvent.setup();
    await selectMoreType(user, 'Buy & Sell');

    await user.type(screen.getByPlaceholderText('Price'), '3500');
    await user.type(screen.getByPlaceholderText('Category'), 'Vehicles');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockQueueDraftPost).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'buy_sell',
          buySell: { priceAmount: 3500, priceCurrency: 'PHP', category: 'Vehicles' },
        })
      )
    );
  });

  it('blocks submission when a video exceeds the 60-second cap', async () => {
    mockGetVideoDuration.mockResolvedValue(90);
    renderComposer();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Video post' }));

    const file = new File(['fake-video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    await user.upload(screen.getByLabelText('Video'), file);
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(screen.getByText('Videos must be 60 seconds or shorter.')).toBeInTheDocument()
    );
    expect(mockQueueDraftPost).not.toHaveBeenCalled();
  });
});
