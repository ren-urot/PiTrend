import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MessagesPage } from './MessagesPage';
import { useConversations } from '../hooks/useConversations';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useConversations');
vi.mock('../components/messages/NewMessageDialog', () => ({
  NewMessageDialog: ({ open }: { open: boolean }) => (open ? <div>New message dialog open</div> : null),
}));

const mockUseConversations = vi.mocked(useConversations);

function renderPage() {
  render(
    <MemoryRouter>
      <MessagesPage />
    </MemoryRouter>
  );
}

describe('MessagesPage', () => {
  it('shows an empty state when there are no conversations', () => {
    mockUseConversations.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText('No conversations yet — start one!')).toBeInTheDocument();
  });

  it('lists conversations with their display name, preview, and unread badge', () => {
    mockUseConversations.mockReturnValue({
      data: [
        {
          id: 'conv-1',
          is_group: false,
          name: null,
          created_at: '2026-01-01T00:00:00Z',
          participants: [{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }],
          lastMessagePreview: 'Hey there',
          lastMessageAt: '2026-01-02T00:00:00Z',
          unreadCount: 3,
          lastReadAt: '2026-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
    } as any);
    renderPage();

    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Hey there')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bob/ })).toHaveAttribute('href', '/messages/conv-1');
  });

  it('does not show a badge for a conversation with no unread messages', () => {
    mockUseConversations.mockReturnValue({
      data: [
        {
          id: 'conv-1',
          is_group: false,
          name: null,
          created_at: '2026-01-01T00:00:00Z',
          participants: [{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }],
          lastMessagePreview: null,
          lastMessageAt: null,
          unreadCount: 0,
          lastReadAt: '2026-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
    } as any);
    renderPage();

    expect(screen.getByText('No messages yet')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('opens the new-message dialog when the button is clicked', async () => {
    mockUseConversations.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();

    expect(screen.queryByText('New message dialog open')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New message' }));
    expect(screen.getByText('New message dialog open')).toBeInTheDocument();
  });
});
