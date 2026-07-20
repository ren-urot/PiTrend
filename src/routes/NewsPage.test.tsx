import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewsPage } from './NewsPage';
import { useNews } from '../hooks/useNews';

vi.mock('../hooks/useNews');
const mockUseNews = vi.mocked(useNews);

describe('NewsPage', () => {
  it('shows an empty state when there are no articles', () => {
    mockUseNews.mockReturnValue({ data: [], isLoading: false } as any);
    render(<NewsPage />);
    expect(screen.getByText('No news articles yet.')).toBeInTheDocument();
  });

  it('lists articles with title, summary, source, and a link', () => {
    mockUseNews.mockReturnValue({
      data: [
        {
          id: 'a1',
          title: 'PI Network price nears $0.10',
          url: 'https://crypto.news/example',
          source: 'crypto.news',
          summary: 'PI climbed over 11%.',
          published_at: '2026-07-21T00:00:00Z',
        },
      ],
      isLoading: false,
    } as any);
    render(<NewsPage />);

    expect(screen.getByText('PI Network price nears $0.10')).toBeInTheDocument();
    expect(screen.getByText('PI climbed over 11%.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PI Network price nears/ })).toHaveAttribute(
      'href',
      'https://crypto.news/example'
    );
  });
});
