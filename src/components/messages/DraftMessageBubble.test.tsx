import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftMessageBubble } from './DraftMessageBubble';
import { retryDraftMessage } from '../../lib/messageQueue';
import type { DraftMessage } from '../../lib/db';

vi.mock('../../lib/messageQueue', () => ({
  retryDraftMessage: vi.fn(),
}));

const mockRetryDraftMessage = vi.mocked(retryDraftMessage);

const baseDraft: DraftMessage = {
  id: 'draft-msg-1',
  conversationId: 'conv-1',
  senderId: 'user-1',
  body: 'Hello offline',
  status: 'queued',
  lastError: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('DraftMessageBubble', () => {
  it('shows the message body and "Sending…" for a queued draft', () => {
    render(<DraftMessageBubble draft={baseDraft} />);
    expect(screen.getByText('Hello offline')).toBeInTheDocument();
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

  it('shows "Sending…" for a syncing draft too', () => {
    render(<DraftMessageBubble draft={{ ...baseDraft, status: 'syncing' }} />);
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

  it('shows the error and a Retry button for a failed draft, which calls retryDraftMessage when clicked', async () => {
    render(<DraftMessageBubble draft={{ ...baseDraft, status: 'failed', lastError: 'network error' }} />);

    expect(screen.getByText("Couldn't send: network error")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mockRetryDraftMessage).toHaveBeenCalledWith('draft-msg-1');
  });
});
