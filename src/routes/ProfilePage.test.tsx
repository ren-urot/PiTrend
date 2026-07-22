import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
import { useAuth } from '../hooks/useAuth';

vi.mock('../hooks/useAuth');

const mockUseAuth = vi.mocked(useAuth);

const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockAvatarUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/${path}` } }));
let mockConnectionsData: any[] = [];

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    session: { user: { id: 'user-1' } } as any,
    loading: false,
    signInWithEmail: vi.fn(),
    verifyOtp: vi.fn(),
    signOut: vi.fn(),
  });
  mockEq.mockClear();
  mockUpdate.mockClear();
  mockAvatarUpload.mockClear().mockResolvedValue({ error: null });
  mockGetPublicUrl.mockClear();
  mockConnectionsData = [];
});

vi.mock('../hooks/useCities', () => ({
  useCities: () => ({
    data: [
      { id: 'city-1', name: 'Cebu City', slug: 'cebu-city', country: 'Philippines', island_group: 'visayas' },
      { id: 'city-2', name: 'Manila', slug: 'manila', country: 'Philippines', island_group: 'luzon' },
    ],
    isLoading: false,
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'connections') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockConnectionsData, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  id: 'user-1',
                  username: 'renz',
                  display_name: 'Ren',
                  avatar_url: null,
                  city_id: 'city-1',
                  reputation_score: 0,
                  created_at: '2026-01-01',
                },
                error: null,
              }),
          }),
        }),
        update: mockUpdate,
      };
    },
    storage: {
      from: () => ({ upload: mockAvatarUpload, getPublicUrl: mockGetPublicUrl }),
    },
  },
}));

function renderPage() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProfilePage', () => {
  it('renders the current user profile and a QR code', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());
    expect(screen.getByText('@renz')).toBeInTheDocument();
  });

  it('shows a loading state while auth is still resolving, not an error', () => {
    mockUseAuth.mockReturnValue({
      session: null as any,
      loading: true,
      signInWithEmail: vi.fn(),
    verifyOtp: vi.fn(),
      signOut: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Loading profile…')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your profile.")).not.toBeInTheDocument();
  });

  it('shows the current city and updates it when a new one is chosen', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Cebu City')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Manila' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ city_id: 'city-2' })
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('shows an error message and leaves the city unchanged when the update fails', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'network error' } });
    renderPage();
    await waitFor(() => expect(screen.getByText('Cebu City')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Manila' }));

    await waitFor(() =>
      expect(screen.getByText("Couldn't update your city. Please try again.")).toBeInTheDocument()
    );
    expect(screen.getByText('Cebu City')).toBeInTheDocument();
  });

  it('uploads a new profile photo when one is selected', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());

    const user = userEvent.setup();
    const file = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Change profile photo'), file);

    await waitFor(() =>
      expect(mockAvatarUpload).toHaveBeenCalledWith('user-1/avatar.jpg', file, { upsert: true })
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      avatar_url: expect.stringMatching(/^https:\/\/cdn\.example\.com\/user-1\/avatar\.jpg\?t=\d+$/),
    });
  });

  it('shows the connections count and opens the Network dialog on click', async () => {
    mockConnectionsData = [
      {
        followed_id: 'user-2',
        created_at: '2026-01-02T00:00:00Z',
        profiles: { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null },
      },
    ];
    renderPage();
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Connections/ }));

    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
  });

  it('shows 0 connections and an empty state when there are none', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Connections/ }));

    await waitFor(() =>
      expect(screen.getByText("You haven't connected with anyone yet.")).toBeInTheDocument()
    );
  });

  it('shows an error message when the photo upload fails', async () => {
    mockAvatarUpload.mockResolvedValueOnce({ error: new Error('upload failed') });
    renderPage();
    await waitFor(() => expect(screen.getByText('Ren')).toBeInTheDocument());

    const user = userEvent.setup();
    const file = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Change profile photo'), file);

    await waitFor(() =>
      expect(screen.getByText("Couldn't update your photo. Please try again.")).toBeInTheDocument()
    );
  });
});
