import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { MarketplaceCategory } from '../types/marketplace';

interface CreateListingInput {
  sellerId: string;
  cityId: string;
  category: MarketplaceCategory;
  title: string;
  description: string | null;
  priceAmount: number;
  priceCurrency: 'USD' | 'PHP' | 'PI';
  photoFiles: File[];
}

export function useCreateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateListingInput): Promise<string> => {
      const { data: listing, error: listingError } = await supabase
        .from('marketplace_listings')
        .insert({
          seller_id: input.sellerId,
          city_id: input.cityId,
          category: input.category,
          title: input.title,
          description: input.description,
          price_amount: input.priceAmount,
          price_currency: input.priceCurrency,
        })
        .select('id')
        .single();
      if (listingError) throw listingError;

      for (let index = 0; index < input.photoFiles.length; index += 1) {
        const file = input.photoFiles[index];
        const extension = file.name.split('.').pop();
        const path = `${input.sellerId}/${listing.id}/${index}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('marketplace-media')
          .upload(path, file);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('marketplace-media').getPublicUrl(path);

        const { error: photoError } = await supabase.from('marketplace_listing_photos').insert({
          listing_id: listing.id,
          photo_url: publicUrlData.publicUrl,
          display_order: index,
        });
        if (photoError) throw photoError;
      }

      return listing.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    },
  });
}
