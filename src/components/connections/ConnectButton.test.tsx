import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectButton } from './ConnectButton';
import { useToggleConnection } from '../../hooks/useToggleConnection';

vi.mock('../../hooks/useToggleConnection');
const mockUseToggleConnection = vi.mocked(useToggleConnection);
const mockMutate = vi.fn();

describe('ConnectButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToggleConnection.mockReturnValue({ mutate: mockMutate, isPending: false } as any);
  });

  it('shows "Connect" when not already following, and connects on click', async () => {
    render(<ConnectButton viewerId="user-1" targetUserId="user-2" isFollowing={false} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(mockMutate).toHaveBeenCalledWith({
      followerId: 'user-1',
      followedId: 'user-2',
      isFollowing: false,
    });
  });

  it('shows "Connected" when already following, and disconnects on click', async () => {
    render(<ConnectButton viewerId="user-1" targetUserId="user-2" isFollowing />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Connected' }));

    expect(mockMutate).toHaveBeenCalledWith({
      followerId: 'user-1',
      followedId: 'user-2',
      isFollowing: true,
    });
  });

  it('renders nothing when there is no viewer', () => {
    const { container } = render(<ConnectButton viewerId={undefined} targetUserId="user-2" isFollowing={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when viewing your own profile', () => {
    const { container } = render(<ConnectButton viewerId="user-1" targetUserId="user-1" isFollowing={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
