import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface UpdateListingStatusInput {
  listingId: string;
  status: 'active' | 'sold';
}

export function useUpdateListingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateListingStatusInput) => {
      const { error } = await supabase
        .from('marketplace_listings')
        .update({ status: input.status })
        .eq('id', input.listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    },
  });
}
