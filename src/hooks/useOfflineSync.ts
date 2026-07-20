import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from './useOnlineStatus';
import { processQueue } from '../lib/offlineQueue';

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    processQueue().then(() => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    });
  }, [isOnline, queryClient]);
}
