import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOfflineSync } from './useOfflineSync';
import { useOnlineStatus } from './useOnlineStatus';
import { processQueue } from '../lib/offlineQueue';
import { processMessageQueue } from '../lib/messageQueue';

vi.mock('./useOnlineStatus');
vi.mock('../lib/offlineQueue', () => ({
  processQueue: vi.fn(),
}));
vi.mock('../lib/messageQueue', () => ({
  processMessageQueue: vi.fn(),
}));

const mockUseOnlineStatus = vi.mocked(useOnlineStatus);
const mockProcessQueue = vi.mocked(processQueue);
const mockProcessMessageQueue = vi.mocked(processMessageQueue);

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
    mockProcessMessageQueue.mockReset().mockResolvedValue(undefined);
  });

  it('runs processQueue and processMessageQueue on mount when online', () => {
    mockUseOnlineStatus.mockReturnValue(true);
    renderInProvider();
    expect(mockProcessQueue).toHaveBeenCalledTimes(1);
    expect(mockProcessMessageQueue).toHaveBeenCalledTimes(1);
  });

  it('does not run either queue on mount when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    renderInProvider();
    expect(mockProcessQueue).not.toHaveBeenCalled();
    expect(mockProcessMessageQueue).not.toHaveBeenCalled();
  });
});
