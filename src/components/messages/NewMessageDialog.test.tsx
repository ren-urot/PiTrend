import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NewMessageDialog } from './NewMessageDialog';
import { useSearchProfiles } from '../../hooks/useSearchProfiles';
import { useCreateConversation } from '../../hooks/useCreateConversation';

vi.mock('../../hooks/useSearchProfiles');
vi.mock('../../hooks/useCreateConversation');

const mockUseSearchProfiles = vi.mocked(useSearchProfiles);
const mockUseCreateConversation = vi.mocked(useCreateConversation);
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <MemoryRouter>
      <NewMessageDialog open onOpenChange={onOpenChange} currentUserId="user-1" />
    </MemoryRouter>
  );
}

describe('NewMessageDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchProfiles.mockReturnValue({ data: [], isLoading: false } as any);
  });

  it('shows search results and starts a 1:1 conversation on single selection', async () => {
    mockUseSearchProfiles.mockReturnValue({
      data: [{ id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' }],
      isLoading: false,
    } as any);
    const mutateAsync = vi.fn().mockResolvedValue('conv-1');
    mockUseCreateConversation.mockReturnValue({ mutateAsync, isPending: false } as any);
    const onOpenChange = vi.fn();

    renderDialog(onOpenChange);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search by username'), 'bo');
    await user.click(screen.getByText(/Bob/));
    await user.click(screen.getByRole('button', { name: 'Start conversation' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        creatorId: 'user-1',
        participantIds: ['user-2'],
        isGroup: false,
        name: null,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith('/messages/conv-1');
  });

  it('shows an optional group name field once two or more people are selected', async () => {
    mockUseSearchProfiles.mockReturnValue({
      data: [
        { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
        { id: 'user-3', username: 'cara', display_name: 'Cara', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
      ],
      isLoading: false,
    } as any);
    mockUseCreateConversation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search by username'), 'a');
    expect(screen.queryByPlaceholderText('Group name (optional)')).not.toBeInTheDocument();

    await user.click(screen.getByText(/Bob/));
    await user.click(screen.getByText(/Cara/));

    expect(screen.getByPlaceholderText('Group name (optional)')).toBeInTheDocument();
  });

  it('creates a group with the entered name and all selected participants', async () => {
    mockUseSearchProfiles.mockReturnValue({
      data: [
        { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
        { id: 'user-3', username: 'cara', display_name: 'Cara', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
      ],
      isLoading: false,
    } as any);
    const mutateAsync = vi.fn().mockResolvedValue('conv-group');
    mockUseCreateConversation.mockReturnValue({ mutateAsync, isPending: false } as any);

    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search by username'), 'a');
    await user.click(screen.getByText(/Bob/));
    await user.click(screen.getByText(/Cara/));
    await user.type(screen.getByPlaceholderText('Group name (optional)'), 'Weekend Hikers');
    await user.click(screen.getByRole('button', { name: 'Start conversation' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        creatorId: 'user-1',
        participantIds: ['user-2', 'user-3'],
        isGroup: true,
        name: 'Weekend Hikers',
      })
    );
  });

  it('disables the start button until at least one person is selected', () => {
    mockUseCreateConversation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    renderDialog();
    expect(screen.getByRole('button', { name: 'Start conversation' })).toBeDisabled();
  });
});
