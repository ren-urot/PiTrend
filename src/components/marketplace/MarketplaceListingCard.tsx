import { useNavigate } from 'react-router-dom';
import { MessageCircle, Trash2 } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCreateConversation } from '../../hooks/useCreateConversation';
import { useUpdateListingStatus } from '../../hooks/useUpdateListingStatus';
import { useDeleteListing } from '../../hooks/useDeleteListing';
import { formatListingPrice } from '../../lib/marketplaceDisplay';
import type { MarketplaceListing } from '../../types/marketplace';

interface MarketplaceListingCardProps {
  listing: MarketplaceListing;
  viewerId: string | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function MarketplaceListingCard({
  listing,
  viewerId,
  expanded,
  onToggleExpand,
}: MarketplaceListingCardProps) {
  const navigate = useNavigate();
  const createConversation = useCreateConversation();
  const updateStatus = useUpdateListingStatus();
  const deleteListing = useDeleteListing();

  const isOwnListing = viewerId === listing.seller.id;
  const coverPhoto = listing.photos[0];

  async function handleMessageSeller() {
    if (!viewerId) return;
    const conversationId = await createConversation.mutateAsync({
      creatorId: viewerId,
      participantIds: [listing.seller.id],
      isGroup: false,
    });
    navigate(`/messages/${conversationId}`);
  }

  return (
    <Card className={expanded ? 'col-span-2' : ''}>
      <button type="button" onClick={onToggleExpand} className="block w-full text-left">
        <CardContent className="p-4">
          {expanded ? (
            <div className="mb-2 flex gap-2 overflow-x-auto">
              {listing.photos.map((photo) => (
                <img
                  key={photo.id}
                  src={photo.photo_url}
                  alt=""
                  className="h-48 w-48 shrink-0 rounded-md object-cover"
                />
              ))}
            </div>
          ) : (
            coverPhoto && (
              <img
                src={coverPhoto.photo_url}
                alt=""
                className="mb-2 aspect-square w-full rounded-md object-cover"
              />
            )
          )}

          {listing.status === 'sold' && <Badge className="mb-2">Sold</Badge>}
          <p className="truncate font-medium">{listing.title}</p>
          <p className="font-semibold text-mesh-teal">
            {formatListingPrice(listing.price_amount, listing.price_currency)}
          </p>
          <p className="text-sm text-muted-foreground">{listing.city_name}</p>

          {expanded && listing.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm">{listing.description}</p>
          )}
        </CardContent>
      </button>

      {expanded && (
        <CardFooter className="gap-2 border-t p-4">
          {isOwnListing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateStatus.mutate({
                    listingId: listing.id,
                    status: listing.status === 'active' ? 'sold' : 'active',
                  })
                }
              >
                Mark as {listing.status === 'active' ? 'Sold' : 'Active'}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => deleteListing.mutate(listing.id)}
              >
                <Trash2 size={16} className="mr-1" />
                Delete
              </Button>
            </>
          ) : (
            viewerId && (
              <Button type="button" size="sm" onClick={handleMessageSeller}>
                <MessageCircle size={16} className="mr-1" />
                Message Seller
              </Button>
            )
          )}
        </CardFooter>
      )}
    </Card>
  );
}
