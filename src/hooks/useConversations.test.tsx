import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useConversations, useConversation } from './useConversations';

const { mockParticipantsSelect, mockConversationsSelect, mockMessagesSelect, mockOn, mockChannel, mockRemoveChannel } =
  vi.hoisted(() => {
    const mockOn = vi.fn(() => ({ subscribe: vi.fn() }));
    return {
      mockParticipantsSelect: vi.fn(),
      mockConversationsSelect: vi.fn(),
      mockMessagesSelect: vi.fn(),
      mockOn,
      mockChannel: vi.fn(() => ({ on: mockOn })),
      mockRemoveChannel: vi.fn(),
    };
  });

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'conversation_participants') return { select: mockParticipantsSelect };
      if (table === 'conversations') return { select: mockConversationsSelect };
      if (table === 'messages') return { select: mockMessagesSelect };
      throw new Error(`Unexpected table: ${table}`);
    },
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnValue({ subscribe: vi.fn() });
    mockChannel.mockReturnValue({ on: mockOn });

    mockParticipantsSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [{ conversation_id: 'conv-1', last_read_at: '2026-01-01T00:00:00Z' }],
        error: null,
      }),
    });
    mockConversationsSelect.mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'conv-1',
            is_group: false,
            name: null,
            created_at: '2026-01-01T00:00:00Z',
            conversation_participants: [
              { user_id: 'user-1', last_read_at: '2026-01-01T00:00:00Z', profiles: { username: 'me', display_name: 'Me' } },
              { user_id: 'user-2', last_read_at: '2026-01-01T00:00:00Z', profiles: { username: 'bob', display_name: 'Bob' } },
            ],
          },
        ],
        error: null,
      }),
    });
    mockMessagesSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              sender_id: 'user-2',
              body: 'Hey there',
              media_url: null,
              created_at: '2026-01-02T00:00:00Z',
            },
          ],
          error: null,
        }),
      }),
    });
  });

  it('summarizes a conversation with its other participant, last message, and unread count', async () => {
    const { result } = renderHook(() => useConversations('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    const summary = result.current.data![0];
    expect(summary.participants).toEqual([{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }]);
    expect(summary.lastMessagePreview).toBe('Hey there');
    expect(summary.unreadCount).toBe(1);
  });

  it('does not count the viewer\'s own messages as unread', async () => {
    mockMessagesSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              sender_id: 'user-1',
              body: 'My own message',
              media_url: null,
              created_at: '2026-01-02T00:00:00Z',
            },
          ],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useConversations('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].unreadCount).toBe(0);
  });

  it('subscribes to message inserts and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useConversations('user-1'), { wrapper });

    expect(mockChannel).toHaveBeenCalledWith('conversations:user-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', schema: 'public', table: 'messages' }),
      expect.any(Function)
    );

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('returns an empty array when there is no user', async () => {
    const { result } = renderHook(() => useConversations(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationsSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'conv-1',
            is_group: false,
            name: null,
            created_at: '2026-01-01T00:00:00Z',
            conversation_participants: [
              { user_id: 'user-1', profiles: { username: 'me', display_name: 'Me' } },
              { user_id: 'user-2', profiles: { username: 'bob', display_name: 'Bob' } },
            ],
          },
          error: null,
        }),
      }),
    });
  });

  it("returns the conversation's metadata and other participants, excluding the viewer", async () => {
    const { result } = renderHook(() => useConversation('conv-1', 'user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      id: 'conv-1',
      is_group: false,
      name: null,
      created_at: '2026-01-01T00:00:00Z',
      participants: [{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }],
    });
  });
});
