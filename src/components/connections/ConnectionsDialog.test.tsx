import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectionsDialog } from './ConnectionsDialog';
import { useConnections } from '../../hooks/useConnections';

vi.mock('../../hooks/useConnections');
const mockUseConnections = vi.mocked(useConnections);

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <MemoryRouter>
      <ConnectionsDialog userId="user-1" open onOpenChange={onOpenChange} />
    </MemoryRouter>
  );
}

describe('ConnectionsDialog', () => {
  it('lists connected profiles with a link to their public profile', () => {
    mockUseConnections.mockReturnValue({
      data: [{ id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null }],
      isLoading: false,
    } as any);

    renderDialog();

    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bob/ })).toHaveAttribute('href', '/u/bob');
  });

  it('shows an empty state when there are no connections', () => {
    mockUseConnections.mockReturnValue({ data: [], isLoading: false } as any);
    renderDialog();
    expect(screen.getByText("You haven't connected with anyone yet.")).toBeInTheDocument();
  });
});
