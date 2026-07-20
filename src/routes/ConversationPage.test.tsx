import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConversationPage } from './ConversationPage';
import { useMessages } from '../hooks/useMessages';
import { useConversation } from '../hooks/useConversations';
import { useSendMessage, useMarkAsRead } from '../hooks/useMessageActions';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useMessages');
vi.mock('../hooks/useConversations');
vi.mock('../hooks/useMessageActions');

const mockUseMessages = vi.mocked(useMessages);
const mockUseConversation = vi.mocked(useConversation);
const mockUseSendMessage = vi.mocked(useSendMessage);
const mockUseMarkAsRead = vi.mocked(useMarkAsRead);

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/messages/:conversationId" element={<ConversationPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ConversationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConversation.mockReturnValue({
      data: {
        id: 'conv-1',
        is_group: false,
        name: null,
        created_at: '2026-01-01T00:00:00Z',
        participants: [{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }],
      },
      isLoading: false,
    } as any);
    mockUseMessages.mockReturnValue({ data: [], isLoading: false } as any);
    mockUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    mockUseMarkAsRead.mockReturnValue({ mutate: vi.fn() } as any);
  });

  it('shows the conversation display name as the header', async () => {
    renderAt('/messages/conv-1');
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
  });

  it("labels messages from other participants with their name, but not the viewer's own", async () => {
    mockUseMessages.mockReturnValue({
      data: [
        { id: 'm1', conversation_id: 'conv-1', sender_id: 'user-2', body: 'Hey', media_url: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'm2', conversation_id: 'conv-1', sender_id: 'user-1', body: 'Hi back', media_url: null, created_at: '2026-01-01T00:01:00Z' },
      ],
      isLoading: false,
    } as any);
    renderAt('/messages/conv-1');

    await waitFor(() => expect(screen.getByText('Hey')).toBeInTheDocument());
    expect(screen.getByText('Bob', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Hi back')).toBeInTheDocument();
  });

  it('marks the conversation as read on mount', async () => {
    const mutate = vi.fn();
    mockUseMarkAsRead.mockReturnValue({ mutate } as any);
    renderAt('/messages/conv-1');
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ conversationId: 'conv-1', userId: 'user-1' }));
  });

  it('sends a text message and clears the input', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockUseSendMessage.mockReturnValue({ mutateAsync, isPending: false } as any);
    renderAt('/messages/conv-1');

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Message…');
    await user.type(input, 'Hello!');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        senderId: 'user-1',
        body: 'Hello!',
        mediaFile: undefined,
      })
    );
    expect(input).toHaveValue('');
  });

  it('does not send an empty message with no text and no photo', async () => {
    const mutateAsync = vi.fn();
    mockUseSendMessage.mockReturnValue({ mutateAsync, isPending: false } as any);
    renderAt('/messages/conv-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
