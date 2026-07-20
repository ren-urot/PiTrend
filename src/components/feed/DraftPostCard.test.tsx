import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftPostCard } from './DraftPostCard';
import { retryDraft } from '../../lib/offlineQueue';
import type { DraftPost } from '../../lib/db';

vi.mock('../../lib/offlineQueue', () => ({
  retryDraft: vi.fn(),
}));

const mockRetryDraft = vi.mocked(retryDraft);

const baseDraft: DraftPost = {
  id: 'draft-1',
  authorId: 'user-1',
  cityId: 'city-1',
  channelId: null,
  postType: 'text',
  body: 'Hello offline',
  status: 'queued',
  lastError: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('DraftPostCard', () => {
  it('shows "Waiting to send…" for a queued draft', () => {
    render(<DraftPostCard draft={baseDraft} />);
    expect(screen.getByText('Hello offline')).toBeInTheDocument();
    expect(screen.getByText('Waiting to send…')).toBeInTheDocument();
  });

  it('shows "Sending…" for a syncing draft', () => {
    render(<DraftPostCard draft={{ ...baseDraft, status: 'syncing' }} />);
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

  it('shows the error and a Retry button for a failed draft, which calls retryDraft when clicked', async () => {
    render(<DraftPostCard draft={{ ...baseDraft, status: 'failed', lastError: 'network error' }} />);

    expect(screen.getByText("Couldn't send: network error")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mockRetryDraft).toHaveBeenCalledWith('draft-1');
  });
});
