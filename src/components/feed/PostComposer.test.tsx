import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostComposer } from './PostComposer';
import { getVideoDuration } from '../../lib/media';

const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'post-1' });

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useCreatePost', () => ({
  useCreatePost: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

vi.mock('../../lib/media', () => ({
  getVideoDuration: vi.fn(),
}));

const mockGetVideoDuration = vi.mocked(getVideoDuration);

describe('PostComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ id: 'post-1' });
  });

  it('submits a text post with the default type', async () => {
    render(<PostComposer cityId="city-1" />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("What's happening?"), 'Hello Cebu!');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        authorId: 'user-1',
        cityId: 'city-1',
        channelId: null,
        postType: 'text',
        body: 'Hello Cebu!',
        mediaFile: undefined,
      })
    );
  });

  it('shows a file picker only when the photo type is selected', async () => {
    render(<PostComposer cityId="city-1" />);

    expect(screen.queryByLabelText('Photo')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Photo' }));

    expect(screen.getByLabelText('Photo')).toBeInTheDocument();
  });

  it('submits poll options for a poll post', async () => {
    render(<PostComposer cityId="city-1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Poll' }));

    const optionInputs = screen.getAllByPlaceholderText('Option');
    await user.type(optionInputs[0], 'CnT');
    await user.type(optionInputs[1], "Rico's");
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'poll',
          pollOptions: ['CnT', "Rico's"],
        })
      )
    );
  });

  it('submits price/currency/category for a buy & sell post', async () => {
    render(<PostComposer cityId="city-1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Buy & Sell' }));

    await user.type(screen.getByPlaceholderText('Price'), '3500');
    await user.type(screen.getByPlaceholderText('Category'), 'Vehicles');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'buy_sell',
          buySell: { priceAmount: 3500, priceCurrency: 'PHP', category: 'Vehicles' },
        })
      )
    );
  });

  it('blocks submission when a video exceeds the 60-second cap', async () => {
    mockGetVideoDuration.mockResolvedValue(90);
    render(<PostComposer cityId="city-1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Video' }));

    const file = new File(['fake-video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    await user.upload(screen.getByLabelText('Video'), file);
    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(screen.getByText('Videos must be 60 seconds or shorter.')).toBeInTheDocument()
    );
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
