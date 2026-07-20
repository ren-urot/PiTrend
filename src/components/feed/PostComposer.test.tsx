import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostComposer } from './PostComposer';

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

describe('PostComposer', () => {
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
});
