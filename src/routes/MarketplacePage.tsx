import { useState } from 'react';
import { Store, Search, Plus, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useMarketplaceListings, type MarketplaceScope } from '../hooks/useMarketplaceListings';
import { MarketplaceListingCard } from '../components/marketplace/MarketplaceListingCard';
import { CreateListingDialog } from '../components/marketplace/CreateListingDialog';
import { MARKETPLACE_CATEGORY_LABELS } from '../lib/marketplaceDisplay';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import type { MarketplaceCategory } from '../types/marketplace';

const SCOPE_LABELS: Record<MarketplaceScope, string> = {
  nearby: 'Nearby',
  all: 'All cities',
  mine: 'Mine',
};

export function MarketplacePage() {
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<MarketplaceScope>('nearby');
  const [category, setCategory] = useState<MarketplaceCategory | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sellOpen, setSellOpen] = useState(false);

  const { data: listings, isLoading } = useMarketplaceListings({
    scope,
    cityId: profile?.city_id,
    category,
    search,
    viewerId: session?.user.id,
  });

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 flex items-center gap-2 text-base font-semibold md:text-xl">
        <Store size={22} />
        Marketplace
      </h1>

      <div className="relative mb-3">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search Marketplace"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="rounded-full pl-9"
        />
      </div>

      <div className="mb-4 flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 rounded-full"
          disabled={!session}
          onClick={() => setSellOpen(true)}
        >
          <Plus size={18} className="mr-1" />
          Sell
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="flex-1 rounded-full">
              <SlidersHorizontal size={18} className="mr-1" />
              Categories
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setCategory(null)}>All categories</DropdownMenuItem>
            {(Object.entries(MARKETPLACE_CATEGORY_LABELS) as [MarketplaceCategory, string][]).map(
              ([value, label]) => (
                <DropdownMenuItem key={value} onSelect={() => setCategory(value)}>
                  {label}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-4 flex gap-1">
        {(Object.keys(SCOPE_LABELS) as MarketplaceScope[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setScope(value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              scope === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {SCOPE_LABELS[value]}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading listings…</p>}
      {!isLoading && listings?.length === 0 && (
        <p className="text-muted-foreground">No listings yet.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {listings?.map((listing) => (
          <MarketplaceListingCard
            key={listing.id}
            listing={listing}
            viewerId={session?.user.id}
            expanded={expandedId === listing.id}
            onToggleExpand={() =>
              setExpandedId((current) => (current === listing.id ? null : listing.id))
            }
          />
        ))}
      </div>

      {session && (
        <CreateListingDialog
          open={sellOpen}
          onOpenChange={setSellOpen}
          sellerId={session.user.id}
          defaultCityId={profile?.city_id ?? ''}
        />
      )}
    </div>
  );
}
