import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from './useOnlineStatus';
import { processQueue } from '../lib/offlineQueue';
import { processMessageQueue } from '../lib/messageQueue';

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    processQueue().then(() => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    });
    processMessageQueue().then(() => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['message-drafts'] });
    });
  }, [isOnline, queryClient]);
}
