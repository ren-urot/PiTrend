import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ChannelsPage } from './ChannelsPage';
import { useChannels } from '../hooks/useChannels';
import { useChannelSubscriptions } from '../hooks/useChannelSubscriptions';
import { useToggleChannelSubscription } from '../hooks/useToggleChannelSubscription';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile', () => ({
  useProfile: () => ({
    data: {
      id: 'user-1',
      username: 'renz',
      display_name: 'Ren',
      avatar_url: null,
      city_id: 'city-1',
      reputation_score: 0,
      created_at: '2026-01-01',
    },
    isLoading: false,
  }),
}));

vi.mock('../hooks/useChannels');
vi.mock('../hooks/useChannelSubscriptions');
vi.mock('../hooks/useToggleChannelSubscription');

const mockUseChannels = vi.mocked(useChannels);
const mockUseChannelSubscriptions = vi.mocked(useChannelSubscriptions);
const mockUseToggleChannelSubscription = vi.mocked(useToggleChannelSubscription);
const mockToggleMutate = vi.fn();

function renderPage() {
  mockUseChannels.mockReturnValue({
    data: [
      { id: 'ch-1', name: 'Pi Official', slug: 'pi-official', city_id: null, description: null },
      { id: 'ch-2', name: 'Cebu Community', slug: 'cebu-community', city_id: 'city-1', description: null },
      { id: 'ch-3', name: 'Manila Events', slug: 'manila-events', city_id: 'city-manila', description: null },
    ],
    isLoading: false,
  } as any);
  mockUseChannelSubscriptions.mockReturnValue({ data: ['ch-1'], isLoading: false } as any);
  mockUseToggleChannelSubscription.mockReturnValue({ mutate: mockToggleMutate } as any);

  render(
    <MemoryRouter>
      <ChannelsPage />
    </MemoryRouter>
  );
}

describe('ChannelsPage', () => {
  it('shows global channels and the viewer\'s own city\'s channels, not other cities\'', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Pi Official')).toBeInTheDocument());
    expect(screen.getByText('Cebu Community')).toBeInTheDocument();
    expect(screen.queryByText('Manila Events')).not.toBeInTheDocument();
  });

  it('shows Subscribed for a channel the viewer is already subscribed to', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Subscribed')).toBeInTheDocument());
    expect(screen.getByText('Subscribe')).toBeInTheDocument();
  });

  it('toggles a subscription when the button is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Subscribe')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByText('Subscribe'));

    expect(mockToggleMutate).toHaveBeenCalledWith({
      channelId: 'ch-2',
      userId: 'user-1',
      isSubscribed: false,
    });
  });
});
