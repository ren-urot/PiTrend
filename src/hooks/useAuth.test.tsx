import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './useAuth';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

function TestComponent() {
  const { session, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{session ? 'signed-in' : 'signed-out'}</div>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('renders signed-out state once the initial session check resolves', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument());
  });
});
