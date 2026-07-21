import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewsPage } from './NewsPage';
import { useNews } from '../hooks/useNews';

vi.mock('../hooks/useNews');
const mockUseNews = vi.mocked(useNews);

const article = {
  id: 'a1',
  title: 'PI Network price nears $0.10',
  url: 'https://crypto.news/example',
  source: 'crypto.news',
  summary: 'PI climbed over 11%.',
  published_at: '2026-07-21T00:00:00Z',
};

describe('NewsPage', () => {
  it('shows an empty state when there are no articles', () => {
    mockUseNews.mockReturnValue({ data: [], isLoading: false } as any);
    render(<NewsPage />);
    expect(screen.getByText('No news articles yet.')).toBeInTheDocument();
  });

  it('lists articles with title, summary, source, and a link', () => {
    mockUseNews.mockReturnValue({ data: [article], isLoading: false } as any);
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

    beforeEach(() => {
      mockUseNews.mockReturnValue({ data: [article], isLoading: false } as any);
    });

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
