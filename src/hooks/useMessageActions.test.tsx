import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSendMessage, useMarkAsRead } from './useMessageActions';

const mockMessagesInsert = vi.fn();
const mockParticipantsUpdate = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'messages') return { insert: mockMessagesInsert };
      if (table === 'conversation_participants') return { update: mockParticipantsUpdate };
      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessagesInsert.mockResolvedValue({ error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/message-media/conv-1/msg.jpg' } });
  });

  it('sends a text-only message', async () => {
    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await waitFor(() =>
      result.current.mutateAsync({ conversationId: 'conv-1', senderId: 'user-1', body: 'Hi there' })
    );

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockMessagesInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-1',
        sender_id: 'user-1',
        body: 'Hi there',
        media_url: null,
      })
    );
  });

  it('uploads a photo before inserting, using the same generated id for the storage path', async () => {
    const file = new File(['fake-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await waitFor(() =>
      result.current.mutateAsync({ conversationId: 'conv-1', senderId: 'user-1', body: null, mediaFile: file })
    );

    expect(mockUpload).toHaveBeenCalled();
    const [uploadPath] = mockUpload.mock.calls[0];
    expect(uploadPath).toMatch(/^conv-1\/.+\.jpeg$/);

    const insertedRow = mockMessagesInsert.mock.calls[0][0];
    expect(insertedRow.media_url).toBe('https://example.com/message-media/conv-1/msg.jpg');
    expect(uploadPath).toContain(insertedRow.id);
  });
});

describe('useMarkAsRead', () => {
  it("bumps the participant's last_read_at to now", async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null });
    const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
    mockParticipantsUpdate.mockReturnValue({ eq: mockEq1 });

    const { result } = renderHook(() => useMarkAsRead(), { wrapper });
    await waitFor(() => result.current.mutateAsync({ conversationId: 'conv-1', userId: 'user-1' }));

    expect(mockParticipantsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ last_read_at: expect.any(String) })
    );
    expect(mockEq1).toHaveBeenCalledWith('conversation_id', 'conv-1');
    expect(mockEq2).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
