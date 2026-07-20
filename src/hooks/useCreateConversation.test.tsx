import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateConversation } from './useCreateConversation';

const mockParticipantsSelect = vi.fn();
const mockConversationsSelect = vi.fn();
const mockConversationsInsert = vi.fn();
const mockParticipantsInsert = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'conversation_participants') {
        return { select: mockParticipantsSelect, insert: mockParticipantsInsert };
      }
      if (table === 'conversations') {
        return { select: mockConversationsSelect, insert: mockConversationsInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCreateConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationsInsert.mockResolvedValue({ error: null });
    mockParticipantsInsert.mockResolvedValue({ error: null });
  });

  it('creates a new 1:1 conversation with a client-generated id and a two-step participant insert when none exists yet', async () => {
    mockParticipantsSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const { result } = renderHook(() => useCreateConversation(), { wrapper });
    let conversationId: string | undefined;
    await waitFor(async () => {
      conversationId = await result.current.mutateAsync({
        creatorId: 'user-1',
        participantIds: ['user-2'],
        isGroup: false,
      });
    });

    // Id is generated client-side (crypto.randomUUID()), not returned by
    // the insert, so assert it's a valid UUID and that the SAME id was
    // used consistently across the conversation insert and both
    // participant inserts, rather than hardcoding a mock-returned value.
    expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockConversationsInsert).toHaveBeenCalledWith({
      id: conversationId,
      is_group: false,
      name: null,
    });
    expect(mockParticipantsInsert).toHaveBeenNthCalledWith(1, {
      conversation_id: conversationId,
      user_id: 'user-1',
    });
    expect(mockParticipantsInsert).toHaveBeenNthCalledWith(2, [
      { conversation_id: conversationId, user_id: 'user-2' },
    ]);
  });

  it('reuses an existing 1:1 conversation instead of creating a duplicate', async () => {
    mockParticipantsSelect.mockImplementation(() => ({
      eq: vi.fn((_column: string, value: string) => {
        if (value === 'user-1') return Promise.resolve({ data: [{ conversation_id: 'conv-existing' }], error: null });
        return Promise.resolve({ data: [{ conversation_id: 'conv-existing' }], error: null });
      }),
    }));
    mockConversationsSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [{ id: 'conv-existing' }], error: null }),
      }),
    });

    const { result } = renderHook(() => useCreateConversation(), { wrapper });
    let conversationId: string | undefined;
    await waitFor(async () => {
      conversationId = await result.current.mutateAsync({
        creatorId: 'user-1',
        participantIds: ['user-2'],
        isGroup: false,
      });
    });

    expect(conversationId).toBe('conv-existing');
    expect(mockConversationsInsert).not.toHaveBeenCalled();
  });

  it('creates a group conversation with a name and all participants', async () => {
    const { result } = renderHook(() => useCreateConversation(), { wrapper });
    let conversationId: string | undefined;
    await waitFor(async () => {
      conversationId = await result.current.mutateAsync({
        creatorId: 'user-1',
        participantIds: ['user-2', 'user-3'],
        isGroup: true,
        name: 'Weekend Hikers',
      });
    });

    expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockConversationsInsert).toHaveBeenCalledWith({
      id: conversationId,
      is_group: true,
      name: 'Weekend Hikers',
    });
    expect(mockParticipantsInsert).toHaveBeenNthCalledWith(2, [
      { conversation_id: conversationId, user_id: 'user-2' },
      { conversation_id: conversationId, user_id: 'user-3' },
    ]);
  });
});
