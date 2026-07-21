import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewsPage } from './NewsPage';
import { useNews } from '../hooks/useNews';

vi.mock('../hooks/useNews');
const mockUseNews = vi.mocked(useNews);

const piArticle = {
  id: 'a1',
  title: 'PI Network price nears $0.10',
  url: 'https://crypto.news/example',
  source: 'crypto.news',
  summary: 'PI climbed over 11%.',
  published_at: '2026-07-21T00:00:00Z',
  category: 'pi_network' as const,
};

const cryptoArticle = {
  id: 'c1',
  title: 'Bitcoin holds above $60k amid ETF inflows',
  url: 'https://example.com/btc-etf',
  source: 'example.com',
  summary: 'Institutional demand keeps BTC steady.',
  published_at: '2026-07-20T00:00:00Z',
  category: 'crypto_update' as const,
};

function mockByCategory() {
  mockUseNews.mockImplementation((category: string) =>
    ({
      data: category === 'pi_network' ? [piArticle] : [cryptoArticle],
      isLoading: false,
    }) as any
  );
}

describe('NewsPage', () => {
  beforeEach(() => {
    mockByCategory();
  });

  it('shows Pi News by default', () => {
    render(<NewsPage />);
    expect(screen.getByText('PI Network price nears $0.10')).toBeInTheDocument();
    expect(screen.queryByText('Bitcoin holds above $60k amid ETF inflows')).not.toBeInTheDocument();
  });

  it('switches to Crypto Update when that tab is clicked', async () => {
    render(<NewsPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Crypto Update' }));

    expect(screen.getByText('Bitcoin holds above $60k amid ETF inflows')).toBeInTheDocument();
  });

  it('shows an empty state when a category has no articles', () => {
    mockUseNews.mockReturnValue({ data: [], isLoading: false } as any);
    render(<NewsPage />);
    expect(screen.getByText('No news articles yet.')).toBeInTheDocument();
  });

  it('lists an article with title, summary, source, and a link', () => {
    render(<NewsPage />);

    expect(screen.getByText('PI Network price nears $0.10')).toBeInTheDocument();
    expect(screen.getByText('PI climbed over 11%.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PI Network price nears/ })).toHaveAttribute(
      'href',
      'https://crypto.news/example'
    );
  });

  describe('sharing an article', () => {
    const originalShare = navigator.share;

    afterEach(() => {
      Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
      vi.restoreAllMocks();
    });

    it("uses the native share sheet when the browser supports it", async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', { value: mockShare, configurable: true });

      render(<NewsPage />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Share' }));

      expect(mockShare).toHaveBeenCalledWith({
        title: 'PI Network price nears $0.10',
        url: 'https://crypto.news/example',
      });
    });

    it('falls back to copying the link when navigator.share is unavailable', async () => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

      render(<NewsPage />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Share' }));

      await waitFor(() => expect(screen.getByText('Link copied')).toBeInTheDocument());
      expect(writeTextSpy).toHaveBeenCalledWith('https://crypto.news/example');
    });
  });
});
