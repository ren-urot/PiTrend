import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMessages } from './useMessages';

let capturedCallback: ((payload: { new: unknown }) => void) | undefined;

const { mockSelect, mockOn, mockChannel, mockRemoveChannel } = vi.hoisted(() => {
  return {
    mockSelect: vi.fn(),
    mockOn: vi.fn(),
    mockChannel: vi.fn(),
    mockRemoveChannel: vi.fn(),
  };
});

mockOn.mockImplementation((_event: string, _config: unknown, callback: (payload: { new: unknown }) => void) => {
  capturedCallback = callback;
  return { subscribe: vi.fn() };
});
mockChannel.mockImplementation(() => ({ on: mockOn }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = undefined;
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              sender_id: 'user-2',
              body: 'Hi',
              media_url: null,
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
          error: null,
        }),
      }),
    });
  });

  it('fetches messages for the conversation, oldest first', async () => {
    const { result } = renderHook(() => useMessages('conv-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].body).toBe('Hi');
  });

  it('appends a new message received over realtime, without duplicating an already-known id', async () => {
    const { result } = renderHook(() => useMessages('conv-1'), {
      wrapper: ({ children }: { children: ReactNode }) => {
        const client = new QueryClient();
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);

    const newMessage = {
      id: 'msg-2',
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      body: 'Hello back',
      media_url: null,
      created_at: '2026-01-01T00:01:00Z',
    };

    capturedCallback!({ new: newMessage });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.data![1].body).toBe('Hello back');

    capturedCallback!({ new: newMessage });
    expect(result.current.data).toHaveLength(2);
  });

  it('subscribes filtered to the conversation and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useMessages('conv-1'), { wrapper });

    expect(mockChannel).toHaveBeenCalledWith('messages:conv-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'conversation_id=eq.conv-1',
      }),
      expect.any(Function)
    );

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('returns an empty array when there is no conversation id', async () => {
    const { result } = renderHook(() => useMessages(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
