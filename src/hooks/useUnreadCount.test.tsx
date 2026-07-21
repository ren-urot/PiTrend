import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUnreadCount } from './useUnreadCount';
import { playNotificationSound } from '../lib/notificationSound';

const { mockParticipantsSelect, mockMessagesSelect, mockOn, mockChannel, mockRemoveChannel } = vi.hoisted(() => {
  const mockOn = vi.fn((..._args: unknown[]) => ({ subscribe: vi.fn() }));
  return {
    mockParticipantsSelect: vi.fn(),
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
      if (table === 'messages') return { select: mockMessagesSelect };
      throw new Error(`Unexpected table: ${table}`);
    },
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('../lib/notificationSound', () => ({
  playNotificationSound: vi.fn(),
}));

const mockPlayNotificationSound = vi.mocked(playNotificationSound);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useUnreadCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnValue({ subscribe: vi.fn() });
    mockChannel.mockReturnValue({ on: mockOn });
    mockPlayNotificationSound.mockClear();
  });

  it('sums messages newer than each conversation\'s last_read_at, excluding the viewer\'s own', async () => {
    mockParticipantsSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          { conversation_id: 'conv-1', last_read_at: '2026-01-01T00:00:00Z' },
          { conversation_id: 'conv-2', last_read_at: '2026-01-05T00:00:00Z' },
        ],
        error: null,
      }),
    });
    mockMessagesSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        neq: vi.fn().mockResolvedValue({
          data: [
            { conversation_id: 'conv-1', sender_id: 'user-2', created_at: '2026-01-02T00:00:00Z' },
            { conversation_id: 'conv-1', sender_id: 'user-2', created_at: '2026-01-03T00:00:00Z' },
            { conversation_id: 'conv-2', sender_id: 'user-2', created_at: '2026-01-01T00:00:00Z' },
          ],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useUnreadCount('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(2);
  });

  it('returns 0 when there is no user', async () => {
    const { result } = renderHook(() => useUnreadCount(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });

  it("plays a notification sound for another user's message in one of the viewer's conversations", async () => {
    mockParticipantsSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [{ conversation_id: 'conv-1', last_read_at: '2026-01-01T00:00:00Z' }],
        error: null,
      }),
    });
    mockMessagesSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    });

    const { result } = renderHook(() => useUnreadCount('user-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const realtimeHandler = mockOn.mock.calls[0][2] as (payload: { new: { conversation_id: string; sender_id: string } }) => void;
    realtimeHandler({ new: { conversation_id: 'conv-1', sender_id: 'user-2' } });

    expect(mockPlayNotificationSound).toHaveBeenCalledTimes(1);
  });

  it('does not play a sound for the viewer\'s own message', async () => {
    mockParticipantsSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [{ conversation_id: 'conv-1', last_read_at: '2026-01-01T00:00:00Z' }],
        error: null,
      }),
    });
    mockMessagesSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    });

    const { result } = renderHook(() => useUnreadCount('user-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const realtimeHandler = mockOn.mock.calls[0][2] as (payload: { new: { conversation_id: string; sender_id: string } }) => void;
    realtimeHandler({ new: { conversation_id: 'conv-1', sender_id: 'user-1' } });

    expect(mockPlayNotificationSound).not.toHaveBeenCalled();
  });

  it('does not play a sound for a message in a conversation the viewer is not part of', async () => {
    mockParticipantsSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [{ conversation_id: 'conv-1', last_read_at: '2026-01-01T00:00:00Z' }],
        error: null,
      }),
    });
    mockMessagesSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    });

    const { result } = renderHook(() => useUnreadCount('user-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const realtimeHandler = mockOn.mock.calls[0][2] as (payload: { new: { conversation_id: string; sender_id: string } }) => void;
    realtimeHandler({ new: { conversation_id: 'conv-unrelated', sender_id: 'user-2' } });

    expect(mockPlayNotificationSound).not.toHaveBeenCalled();
  });
});
