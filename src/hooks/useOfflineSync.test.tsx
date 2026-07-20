import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOfflineSync } from './useOfflineSync';
import { useOnlineStatus } from './useOnlineStatus';
import { processQueue } from '../lib/offlineQueue';

vi.mock('./useOnlineStatus');
vi.mock('../lib/offlineQueue', () => ({
  processQueue: vi.fn(),
}));

const mockUseOnlineStatus = vi.mocked(useOnlineStatus);
const mockProcessQueue = vi.mocked(processQueue);

function TestComponent() {
  useOfflineSync();
  return null;
}

function renderInProvider() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TestComponent />
    </QueryClientProvider>
  );
}

describe('useOfflineSync', () => {
  beforeEach(() => {
    mockProcessQueue.mockReset().mockResolvedValue(undefined);
  });

  it('runs processQueue on mount when online', () => {
    mockUseOnlineStatus.mockReturnValue(true);
    renderInProvider();
    expect(mockProcessQueue).toHaveBeenCalledTimes(1);
  });

  it('does not run processQueue on mount when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    renderInProvider();
    expect(mockProcessQueue).not.toHaveBeenCalled();
  });
});
