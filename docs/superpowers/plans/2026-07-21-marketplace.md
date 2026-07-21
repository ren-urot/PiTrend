# Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MarketplacePage`'s "Coming soon" placeholder with a full Marketplace: a dedicated `marketplace_listings`/`marketplace_listing_photos` schema, a browse grid with search/category/scope filters, a Sell dialog with multi-photo upload, and a "Message Seller" action that reuses the existing Messaging system.

**Architecture:** New schema, independent from Feed's `posts`/`post_buy_sell` tables, following the same RLS shape already used across the project (authenticated read-all, insert/update/delete restricted to the owning row). Listings reference the existing `cities` table for location. There's no dedicated detail route — tapping a grid card expands it in place. See `docs/superpowers/specs/2026-07-21-marketplace-design.md` for the full design rationale.

**Tech Stack:** Same as prior sub-projects — see `docs/superpowers/plans/2026-07-19-foundation.md`'s Tech Stack section for exact versions. No new npm dependencies this plan.

## Global Constraints

- **Fixed category enum, exact values:** `electronics`, `vehicles`, `property`, `home_furniture`, `jobs`, `other`. Human-readable labels: `Electronics`, `Vehicles`, `Property & Rentals`, `Home & Furniture`, `Jobs`, `Other`.
- **Currencies, exact values:** `USD`, `PHP`, `PI` — same set already used by Feed's `post_buy_sell.price_currency`.
- **Price display format, exact:** `formatListingPrice` (Task 3) renders `₱2,500` for PHP, `$99` for USD, `π10` for PI — currency symbol directly prefixed, no space, amount comma-grouped via `Number.prototype.toLocaleString()`. This is new to the project (Feed's `buy_sell` post type shows `PHP 2500 · Category` as plain text) — Marketplace intentionally looks different.
- **Scope control is a three-way, mutually-exclusive selector**, not independent checkboxes: `'nearby' | 'all' | 'mine'`, exactly one active. `'nearby'` filters to the viewer's own `profiles.city_id` and `status = 'active'`. `'all'` is every city, `status = 'active'`. `'mine'` filters to `seller_id = viewer`, both `active` and `sold` included — this is the only place a sold listing is visible again after being marked sold. Category and search filters apply within whichever scope is active, `'mine'` included.
- **No dedicated detail route.** Tapping a grid card expands it in place: the card's own `className` gains `col-span-2` (full width in the 2-column grid) and reveals the remaining photos, full description, and the seller/buyer action row. Exactly one card is expanded at a time — a single `expandedId` state lives in `MarketplacePage` (Task 9), not in each card.
- **`.select('id').single()` on the `marketplace_listings` insert is safe** (Task 5), unlike `useCreateConversation`'s client-generated-id workaround elsewhere in this project: `marketplace_listings`' SELECT RLS policy is unrestricted read-all for any authenticated user (see Task 1), so there is no "creator isn't a participant yet" race — reading back the just-inserted row never 403s.
- **FK embed hints use the constraint-name form** (`profiles!marketplace_listings_seller_id_fkey`, `cities!marketplace_listings_city_id_fkey`), matching `usePosts.ts`'s convention for `author:profiles!posts_author_id_fkey(...)`. This is *not* the self-referential case documented in project memory (`feedback_pimesh_postgrest_embed_hints`, which is specifically about `posts` embedding `posts`) — `marketplace_listings` embedding `profiles`/`cities` (different tables) is the ordinary case, so the constraint-name hint is correct here, not the column-name hint.
- **No debounce utility exists anywhere in this codebase.** `useSearchProfiles` (used by Messaging's "New message" search) re-runs its query on every keystroke via TanStack Query's query-key change, with no `setTimeout`/debounce wrapper. `useMarketplaceListings`' search filter (Task 4) follows this same established convention — don't introduce a new debounce helper for this plan.
- Every task with runtime logic ships with a Vitest test; the schema and Storage-bucket tasks verify via the Supabase SQL Editor, matching the pattern from every prior sub-project.
- Manual Supabase-dashboard steps (applying the migration, creating the Storage bucket) require the user's action — the implementer cannot do these programmatically.
- **`MarketplacePage.tsx` currently renders `<ComingSoon title="Marketplace" />` and nothing else references it** — checked: `routes.test.tsx` does not assert the placeholder text, and no other file imports `MarketplacePage`. Task 9's rewrite is a clean replacement with no anticipated hidden-consumer breakage.

---

### Task 1: Marketplace schema migration

**Files:**
- Create: `supabase/migrations/0017_create_marketplace_schema.sql`

**Interfaces:**
- Consumes: `public.profiles`, `public.cities` (both already exist).
- Produces: `public.marketplace_listings`, `public.marketplace_listing_photos` — both RLS-enabled. Relied on by every later task in this plan.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0017_create_marketplace_schema.sql`:

```sql
create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  city_id uuid not null references public.cities(id),
  category text not null check (category in (
    'electronics', 'vehicles', 'property', 'home_furniture', 'jobs', 'other'
  )),
  title text not null,
  description text,
  price_amount numeric not null,
  price_currency text not null check (price_currency in ('USD', 'PHP', 'PI')),
  status text not null default 'active' check (status in ('active', 'sold')),
  created_at timestamptz not null default now()
);

alter table public.marketplace_listings enable row level security;

create policy "Authenticated users can read all marketplace listings"
  on public.marketplace_listings for select
  to authenticated
  using (true);

create policy "Users can insert their own marketplace listings"
  on public.marketplace_listings for insert
  to authenticated
  with check (auth.uid() = seller_id);

create policy "Users can update their own marketplace listings"
  on public.marketplace_listings for update
  to authenticated
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

create policy "Users can delete their own marketplace listings"
  on public.marketplace_listings for delete
  to authenticated
  using (auth.uid() = seller_id);

create index marketplace_listings_browse_idx
  on public.marketplace_listings (city_id, status, created_at desc);

create table public.marketplace_listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  photo_url text not null,
  display_order integer not null
);

alter table public.marketplace_listing_photos enable row level security;

create policy "Authenticated users can read all marketplace listing photos"
  on public.marketplace_listing_photos for select
  to authenticated
  using (true);

create policy "Users can insert photos for their own marketplace listings"
  on public.marketplace_listing_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.marketplace_listings
      where marketplace_listings.id = listing_id
        and marketplace_listings.seller_id = auth.uid()
    )
  );

create index marketplace_listing_photos_listing_idx
  on public.marketplace_listing_photos (listing_id, display_order);
```

- [ ] **Step 2: Apply it to the Supabase project (manual dashboard step)**

Open the Supabase dashboard for `https://puqakbajkmlwohuznxut.supabase.co` → SQL Editor → paste the contents of `supabase/migrations/0017_create_marketplace_schema.sql` → Run.

- [ ] **Step 3: Verify the tables and policies**

In the SQL Editor, run:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
and table_name in ('marketplace_listings', 'marketplace_listing_photos')
order by table_name;
```

Expected: both table names listed.

Then run:

```sql
select tablename, policyname from pg_policies
where tablename in ('marketplace_listings', 'marketplace_listing_photos')
order by tablename, policyname;
```

Expected: 4 policies for `marketplace_listings` (select/insert/update/delete) and 2 for `marketplace_listing_photos` (select/insert).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0017_create_marketplace_schema.sql
git commit -m "feat: add marketplace schema migration (listings, listing photos)"
```

---

### Task 2: marketplace-media Storage bucket

**Files:** None (Supabase dashboard configuration only — no files change).

**Interfaces:**
- Consumes: nothing from earlier tasks (the upload policy checks the uploader's own id against the path prefix, not a referenced table).
- Produces: a `marketplace-media` Storage bucket, public read, authenticated write restricted to the uploader's own `{seller_id}/...` path prefix — matching `post-media`'s existing security model exactly. Relied on by Task 5 (`useCreateListing`).

- [ ] **Step 1: Create the bucket (manual dashboard step)**

In the Supabase dashboard: Storage → New bucket → name it `marketplace-media` → set it **Public**.

- [ ] **Step 2: Add the upload and read policies (manual dashboard step)**

In the SQL Editor, run:

```sql
create policy "Users can upload their own marketplace media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'marketplace-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Anyone can read marketplace media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'marketplace-media');
```

This restricts uploads to paths starting with the uploader's own user id (e.g. `marketplace-media/<seller-id>/<listing-id>/<index>.<ext>`), matching the path convention `useCreateListing` (Task 5) uses — same shape as `post-media`'s `<author-id>/<post-id>.<ext>` convention.

- [ ] **Step 3: Verify**

In the SQL Editor, run:

```sql
select policyname from pg_policies where tablename = 'objects' and policyname like '%marketplace media%';
```

Expected: both policy names listed.

- [ ] **Step 4: No commit needed**

This task has no file changes — it's a Supabase-dashboard-only configuration step. Note its completion in the progress ledger as usual, but skip the git commit.

---

### Task 3: Marketplace types and display helper

**Files:**
- Create: `src/types/marketplace.ts`
- Create: `src/lib/marketplaceDisplay.ts`
- Test: `src/lib/marketplaceDisplay.test.ts`

**Interfaces:**
- Produces: `MarketplaceCategory`, `MarketplaceListingStatus`, `MarketplaceSeller`, `MarketplaceListingPhoto`, `MarketplaceListing` types; `formatListingPrice(amount, currency)`, `MARKETPLACE_CATEGORY_LABELS`. Relied on by every later task in this plan.

- [ ] **Step 1: Write the types**

Create `src/types/marketplace.ts`:

```ts
export type MarketplaceCategory =
  | 'electronics'
  | 'vehicles'
  | 'property'
  | 'home_furniture'
  | 'jobs'
  | 'other';

export type MarketplaceListingStatus = 'active' | 'sold';

export interface MarketplaceSeller {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface MarketplaceListingPhoto {
  id: string;
  photo_url: string;
  display_order: number;
}

export interface MarketplaceListing {
  id: string;
  seller: MarketplaceSeller;
  city_id: string;
  city_name: string;
  category: MarketplaceCategory;
  title: string;
  description: string | null;
  price_amount: number;
  price_currency: 'USD' | 'PHP' | 'PI';
  status: MarketplaceListingStatus;
  created_at: string;
  photos: MarketplaceListingPhoto[];
}
```

- [ ] **Step 2: Write the failing test for the display helper**

Create `src/lib/marketplaceDisplay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatListingPrice, MARKETPLACE_CATEGORY_LABELS } from './marketplaceDisplay';

describe('formatListingPrice', () => {
  it('formats PHP with a peso sign and thousands separators', () => {
    expect(formatListingPrice(2500, 'PHP')).toBe('₱2,500');
  });

  it('formats USD with a dollar sign', () => {
    expect(formatListingPrice(99, 'USD')).toBe('$99');
  });

  it('formats PI with a pi sign', () => {
    expect(formatListingPrice(10, 'PI')).toBe('π10');
  });
});

describe('MARKETPLACE_CATEGORY_LABELS', () => {
  it('has a human-readable label for every category', () => {
    expect(MARKETPLACE_CATEGORY_LABELS.electronics).toBe('Electronics');
    expect(MARKETPLACE_CATEGORY_LABELS.vehicles).toBe('Vehicles');
    expect(MARKETPLACE_CATEGORY_LABELS.property).toBe('Property & Rentals');
    expect(MARKETPLACE_CATEGORY_LABELS.home_furniture).toBe('Home & Furniture');
    expect(MARKETPLACE_CATEGORY_LABELS.jobs).toBe('Jobs');
    expect(MARKETPLACE_CATEGORY_LABELS.other).toBe('Other');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/marketplaceDisplay.test.ts`
Expected: FAIL with "Cannot find module './marketplaceDisplay'" (file doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `src/lib/marketplaceDisplay.ts`:

```ts
import type { MarketplaceCategory } from '../types/marketplace';

const CURRENCY_SYMBOLS: Record<'USD' | 'PHP' | 'PI', string> = {
  USD: '$',
  PHP: '₱',
  PI: 'π',
};

export function formatListingPrice(amount: number, currency: 'USD' | 'PHP' | 'PI'): string {
  return `${CURRENCY_SYMBOLS[currency]}${amount.toLocaleString()}`;
}

export const MARKETPLACE_CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  electronics: 'Electronics',
  vehicles: 'Vehicles',
  property: 'Property & Rentals',
  home_furniture: 'Home & Furniture',
  jobs: 'Jobs',
  other: 'Other',
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/lib/marketplaceDisplay.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/marketplace.ts src/lib/marketplaceDisplay.ts src/lib/marketplaceDisplay.test.ts
git commit -m "feat: add marketplace types and price/category display helper"
```

---

### Task 4: useMarketplaceListings hook

**Files:**
- Create: `src/hooks/useMarketplaceListings.ts`
- Test: `src/hooks/useMarketplaceListings.test.tsx`

**Interfaces:**
- Consumes: `MarketplaceListing`, `MarketplaceCategory` (Task 3).
- Produces: `MarketplaceScope` (`'nearby' | 'all' | 'mine'`), `useMarketplaceListings({ scope, cityId, category, search, viewerId })` returning a TanStack Query result of `MarketplaceListing[]`. Relied on by Task 9 (`MarketplacePage`).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useMarketplaceListings.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMarketplaceListings } from './useMarketplaceListings';

const mockRow = {
  id: 'listing-1',
  city_id: 'city-1',
  category: 'electronics',
  title: 'Noise-cancelling headphones',
  description: 'Barely used',
  price_amount: 2500,
  price_currency: 'PHP',
  status: 'active',
  created_at: '2026-07-01T00:00:00Z',
  seller: { id: 'user-1', username: 'renz', display_name: 'Ren', avatar_url: null },
  city: { name: 'Liloan' },
  photos: [
    { id: 'photo-2', photo_url: 'https://example.com/2.jpg', display_order: 1 },
    { id: 'photo-1', photo_url: 'https://example.com/1.jpg', display_order: 0 },
  ],
};

function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.order = vi.fn().mockResolvedValue(result);
  return builder;
}

let builder = makeBuilder({ data: [mockRow], error: null });
const mockFrom = vi.fn(() => builder);

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMarketplaceListings', () => {
  it('fetches active nearby listings with photos sorted by display_order', async () => {
    builder = makeBuilder({ data: [mockRow], error: null });
    mockFrom.mockImplementation(() => builder);

    const { result } = renderHook(
      () =>
        useMarketplaceListings({
          scope: 'nearby',
          cityId: 'city-1',
          category: null,
          search: '',
          viewerId: 'user-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].city_name).toBe('Liloan');
    expect(result.current.data![0].photos.map((photo) => photo.id)).toEqual(['photo-1', 'photo-2']);
    expect(builder.eq).toHaveBeenCalledWith('status', 'active');
    expect(builder.eq).toHaveBeenCalledWith('city_id', 'city-1');
  });

  it('filters by seller when scope is mine, without a status filter', async () => {
    builder = makeBuilder({ data: [mockRow], error: null });
    mockFrom.mockImplementation(() => builder);

    const { result } = renderHook(
      () =>
        useMarketplaceListings({
          scope: 'mine',
          cityId: undefined,
          category: null,
          search: '',
          viewerId: 'user-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith('seller_id', 'user-1');
    expect(builder.eq).not.toHaveBeenCalledWith('status', 'active');
  });

  it('applies a category filter and a text search across title and description', async () => {
    builder = makeBuilder({ data: [], error: null });
    mockFrom.mockImplementation(() => builder);

    const { result } = renderHook(
      () =>
        useMarketplaceListings({
          scope: 'all',
          cityId: undefined,
          category: 'electronics',
          search: 'headphones',
          viewerId: 'user-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith('category', 'electronics');
    expect(builder.or).toHaveBeenCalledWith(
      'title.ilike.%headphones%,description.ilike.%headphones%'
    );
  });

  it('returns an empty list without querying when scope is nearby and no cityId is known yet', async () => {
    builder = makeBuilder({ data: [mockRow], error: null });
    mockFrom.mockImplementation(() => builder);

    const { result } = renderHook(
      () =>
        useMarketplaceListings({
          scope: 'nearby',
          cityId: undefined,
          category: null,
          search: '',
          viewerId: 'user-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useMarketplaceListings.test.tsx`
Expected: FAIL with "Cannot find module './useMarketplaceListings'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useMarketplaceListings.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { MarketplaceCategory, MarketplaceListing } from '../types/marketplace';

export type MarketplaceScope = 'nearby' | 'all' | 'mine';

interface UseMarketplaceListingsParams {
  scope: MarketplaceScope;
  cityId: string | undefined;
  category: MarketplaceCategory | null;
  search: string;
  viewerId: string | undefined;
}

export function useMarketplaceListings({
  scope,
  cityId,
  category,
  search,
  viewerId,
}: UseMarketplaceListingsParams) {
  return useQuery({
    queryKey: ['marketplace-listings', scope, cityId, category, search, viewerId],
    queryFn: async (): Promise<MarketplaceListing[]> => {
      if (scope === 'nearby' && !cityId) return [];

      let query = supabase
        .from('marketplace_listings')
        .select(
          'id, city_id, category, title, description, price_amount, price_currency, status, created_at, ' +
            'seller:profiles!marketplace_listings_seller_id_fkey(id, username, display_name, avatar_url), ' +
            'city:cities!marketplace_listings_city_id_fkey(name), ' +
            'photos:marketplace_listing_photos(id, photo_url, display_order)'
        );

      if (scope === 'mine') {
        query = query.eq('seller_id', viewerId);
      } else {
        query = query.eq('status', 'active');
        if (scope === 'nearby' && cityId) {
          query = query.eq('city_id', cityId);
        }
      }

      if (category) {
        query = query.eq('category', category);
      }

      const trimmedSearch = search.trim();
      if (trimmedSearch) {
        query = query.or(`title.ilike.%${trimmedSearch}%,description.ilike.%${trimmedSearch}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        seller: row.seller,
        city_id: row.city_id,
        city_name: row.city?.name ?? '',
        category: row.category,
        title: row.title,
        description: row.description,
        price_amount: row.price_amount,
        price_currency: row.price_currency,
        status: row.status,
        created_at: row.created_at,
        photos: [...(row.photos ?? [])].sort(
          (a: any, b: any) => a.display_order - b.display_order
        ),
      }));
    },
  });
}
```

Note: no `enabled` option here, deliberately — with `enabled: scope !== 'nearby' || !!cityId`, the query would stay permanently pending (never resolving, `isSuccess` never `true`) while `scope === 'nearby'` and `cityId` is still unknown, which is exactly the TanStack Query v5 `enabled:false`-hangs pitfall already hit earlier in this project (see the `nearby`-without-`cityId` test in Step 1). The internal `if (scope === 'nearby' && !cityId) return [];` guard is sufficient on its own.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/useMarketplaceListings.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMarketplaceListings.ts src/hooks/useMarketplaceListings.test.tsx
git commit -m "feat: add useMarketplaceListings hook"
```

---

### Task 5: useCreateListing hook

**Files:**
- Create: `src/hooks/useCreateListing.ts`
- Test: `src/hooks/useCreateListing.test.tsx`

**Interfaces:**
- Consumes: `MarketplaceCategory` (Task 3).
- Produces: `useCreateListing()` — a mutation accepting `{ sellerId, cityId, category, title, description, priceAmount, priceCurrency, photoFiles }` and resolving to the new listing's `id: string`. Relied on by Task 8 (`CreateListingDialog`).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCreateListing.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateListing } from './useCreateListing';

const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockListingInsert = vi.fn(() => ({ select: mockSelect }));
const mockPhotoInsert = vi.fn();

const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/${path}` } }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'marketplace_listings') return { insert: mockListingInsert };
      return { insert: mockPhotoInsert };
    },
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeFile(name: string) {
  return new File(['fake'], name, { type: 'image/jpeg' });
}

describe('useCreateListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { id: 'listing-1' }, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockPhotoInsert.mockResolvedValue({ error: null });
  });

  it('inserts the listing and uploads each photo in order', async () => {
    const { result } = renderHook(() => useCreateListing(), { wrapper });

    result.current.mutate({
      sellerId: 'user-1',
      cityId: 'city-1',
      category: 'electronics',
      title: 'Noise-cancelling headphones',
      description: 'Barely used',
      priceAmount: 2500,
      priceCurrency: 'PHP',
      photoFiles: [makeFile('a.jpg'), makeFile('b.jpg')],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockListingInsert).toHaveBeenCalledWith({
      seller_id: 'user-1',
      city_id: 'city-1',
      category: 'electronics',
      title: 'Noise-cancelling headphones',
      description: 'Barely used',
      price_amount: 2500,
      price_currency: 'PHP',
    });
    expect(mockUpload).toHaveBeenCalledWith('user-1/listing-1/0.jpg', expect.any(File));
    expect(mockUpload).toHaveBeenCalledWith('user-1/listing-1/1.jpg', expect.any(File));
    expect(mockPhotoInsert).toHaveBeenCalledWith({
      listing_id: 'listing-1',
      photo_url: 'https://cdn.example.com/user-1/listing-1/0.jpg',
      display_order: 0,
    });
    expect(mockPhotoInsert).toHaveBeenCalledWith({
      listing_id: 'listing-1',
      photo_url: 'https://cdn.example.com/user-1/listing-1/1.jpg',
      display_order: 1,
    });
    expect(result.current.data).toBe('listing-1');
  });

  it('creates a listing with no photos without touching storage', async () => {
    const { result } = renderHook(() => useCreateListing(), { wrapper });

    result.current.mutate({
      sellerId: 'user-1',
      cityId: 'city-1',
      category: 'other',
      title: 'Free stuff',
      description: null,
      priceAmount: 0,
      priceCurrency: 'PHP',
      photoFiles: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useCreateListing.test.tsx`
Expected: FAIL with "Cannot find module './useCreateListing'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useCreateListing.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/useCreateListing.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCreateListing.ts src/hooks/useCreateListing.test.tsx
git commit -m "feat: add useCreateListing hook"
```

---

### Task 6: useUpdateListingStatus and useDeleteListing hooks

**Files:**
- Create: `src/hooks/useUpdateListingStatus.ts`
- Test: `src/hooks/useUpdateListingStatus.test.tsx`
- Create: `src/hooks/useDeleteListing.ts`
- Test: `src/hooks/useDeleteListing.test.tsx`

**Interfaces:**
- Produces: `useUpdateListingStatus()` — mutation accepting `{ listingId: string; status: 'active' | 'sold' }`. `useDeleteListing()` — mutation accepting a `listingId: string`. Both relied on by Task 7 (`MarketplaceListingCard`).

- [ ] **Step 1: Write the failing test for useUpdateListingStatus**

Create `src/hooks/useUpdateListingStatus.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateListingStatus } from './useUpdateListingStatus';

const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ update: mockUpdate }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useUpdateListingStatus', () => {
  it('updates the listing status by id', async () => {
    const { result } = renderHook(() => useUpdateListingStatus(), { wrapper });

    result.current.mutate({ listingId: 'listing-1', status: 'sold' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'sold' });
    expect(mockEq).toHaveBeenCalledWith('id', 'listing-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useUpdateListingStatus.test.tsx`
Expected: FAIL with "Cannot find module './useUpdateListingStatus'" (file doesn't exist yet).

- [ ] **Step 3: Write the useUpdateListingStatus implementation**

Create `src/hooks/useUpdateListingStatus.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/useUpdateListingStatus.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing test for useDeleteListing**

Create `src/hooks/useDeleteListing.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDeleteListing } from './useDeleteListing';

const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockDelete = vi.fn(() => ({ eq: mockEq }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ delete: mockDelete }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDeleteListing', () => {
  it('deletes the listing by id', async () => {
    const { result } = renderHook(() => useDeleteListing(), { wrapper });

    result.current.mutate('listing-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'listing-1');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/hooks/useDeleteListing.test.tsx`
Expected: FAIL with "Cannot find module './useDeleteListing'" (file doesn't exist yet).

- [ ] **Step 7: Write the useDeleteListing implementation**

Create `src/hooks/useDeleteListing.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDeleteListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listingId: string) => {
      const { error } = await supabase.from('marketplace_listings').delete().eq('id', listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    },
  });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/hooks/useDeleteListing.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useUpdateListingStatus.ts src/hooks/useUpdateListingStatus.test.tsx src/hooks/useDeleteListing.ts src/hooks/useDeleteListing.test.tsx
git commit -m "feat: add useUpdateListingStatus and useDeleteListing hooks"
```

---

### Task 7: MarketplaceListingCard component

**Files:**
- Create: `src/components/marketplace/MarketplaceListingCard.tsx`
- Test: `src/components/marketplace/MarketplaceListingCard.test.tsx`

**Interfaces:**
- Consumes: `MarketplaceListing` (Task 3), `formatListingPrice` (Task 3), `useCreateConversation` (existing, from Messaging), `useUpdateListingStatus`, `useDeleteListing` (Task 6).
- Produces: `MarketplaceListingCard({ listing, viewerId, expanded, onToggleExpand })`. Relied on by Task 9 (`MarketplacePage`).

- [ ] **Step 1: Write the failing test**

Create `src/components/marketplace/MarketplaceListingCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MarketplaceListingCard } from './MarketplaceListingCard';
import { useCreateConversation } from '../../hooks/useCreateConversation';
import { useUpdateListingStatus } from '../../hooks/useUpdateListingStatus';
import { useDeleteListing } from '../../hooks/useDeleteListing';
import type { MarketplaceListing } from '../../types/marketplace';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../hooks/useCreateConversation');
vi.mock('../../hooks/useUpdateListingStatus');
vi.mock('../../hooks/useDeleteListing');

const mockUseCreateConversation = vi.mocked(useCreateConversation);
const mockUseUpdateListingStatus = vi.mocked(useUpdateListingStatus);
const mockUseDeleteListing = vi.mocked(useDeleteListing);

const mockMutateAsync = vi.fn().mockResolvedValue('conversation-1');
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

const listing: MarketplaceListing = {
  id: 'listing-1',
  seller: { id: 'seller-1', username: 'renz', display_name: 'Ren', avatar_url: null },
  city_id: 'city-1',
  city_name: 'Liloan',
  category: 'electronics',
  title: 'Noise-cancelling headphones',
  description: 'Barely used, great condition.',
  price_amount: 2500,
  price_currency: 'PHP',
  status: 'active',
  created_at: '2026-07-01T00:00:00Z',
  photos: [
    { id: 'photo-1', photo_url: 'https://example.com/1.jpg', display_order: 0 },
    { id: 'photo-2', photo_url: 'https://example.com/2.jpg', display_order: 1 },
  ],
};

function renderCard(overrides: {
  listing?: MarketplaceListing;
  viewerId?: string | undefined;
  expanded?: boolean;
} = {}) {
  const onToggleExpand = vi.fn();
  render(
    <MemoryRouter>
      <MarketplaceListingCard
        listing={overrides.listing ?? listing}
        viewerId={overrides.viewerId ?? 'buyer-1'}
        expanded={overrides.expanded ?? false}
        onToggleExpand={onToggleExpand}
      />
    </MemoryRouter>
  );
  return { onToggleExpand };
}

describe('MarketplaceListingCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateConversation.mockReturnValue({ mutateAsync: mockMutateAsync } as any);
    mockUseUpdateListingStatus.mockReturnValue({ mutate: mockUpdateMutate } as any);
    mockUseDeleteListing.mockReturnValue({ mutate: mockDeleteMutate } as any);
  });

  it('shows the cover photo, title, formatted price, and city when collapsed', () => {
    renderCard();
    expect(screen.getByText('Noise-cancelling headphones')).toBeInTheDocument();
    expect(screen.getByText('₱2,500')).toBeInTheDocument();
    expect(screen.getByText('Liloan')).toBeInTheDocument();
    expect(screen.queryByText('Barely used, great condition.')).not.toBeInTheDocument();
  });

  it('calls onToggleExpand when the card is clicked', async () => {
    const { onToggleExpand } = renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Noise-cancelling headphones/ }));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('shows the description and a Message Seller button when expanded for another seller', async () => {
    renderCard({ expanded: true });
    expect(screen.getByText('Barely used, great condition.')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Message Seller/ }));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      creatorId: 'buyer-1',
      participantIds: ['seller-1'],
      isGroup: false,
    });
    expect(mockNavigate).toHaveBeenCalledWith('/messages/conversation-1');
  });

  it('shows Sold/Active and Delete controls, not Message Seller, when expanded for the listing owner', async () => {
    renderCard({ expanded: true, viewerId: 'seller-1' });
    expect(screen.queryByRole('button', { name: /Message Seller/ })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mark as Sold' }));
    expect(mockUpdateMutate).toHaveBeenCalledWith({ listingId: 'listing-1', status: 'sold' });

    await user.click(screen.getByRole('button', { name: /Delete/ }));
    expect(mockDeleteMutate).toHaveBeenCalledWith('listing-1');
  });

  it('shows a Sold badge when the listing is sold', () => {
    renderCard({ listing: { ...listing, status: 'sold' } });
    expect(screen.getByText('Sold')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/marketplace/MarketplaceListingCard.test.tsx`
Expected: FAIL with "Cannot find module './MarketplaceListingCard'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/marketplace/MarketplaceListingCard.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/marketplace/MarketplaceListingCard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/MarketplaceListingCard.tsx src/components/marketplace/MarketplaceListingCard.test.tsx
git commit -m "feat: add MarketplaceListingCard with expand-in-place detail view"
```

---

### Task 8: CreateListingDialog component

**Files:**
- Create: `src/components/marketplace/CreateListingDialog.tsx`
- Test: `src/components/marketplace/CreateListingDialog.test.tsx`

**Interfaces:**
- Consumes: `useCities` (existing), `useCreateListing` (Task 5), `MARKETPLACE_CATEGORY_LABELS` (Task 3).
- Produces: `CreateListingDialog({ open, onOpenChange, sellerId, defaultCityId })`. Relied on by Task 9 (`MarketplacePage`).

- [ ] **Step 1: Write the failing test**

Create `src/components/marketplace/CreateListingDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateListingDialog } from './CreateListingDialog';
import { useCities } from '../../hooks/useCities';
import { useCreateListing } from '../../hooks/useCreateListing';

vi.mock('../../hooks/useCities');
vi.mock('../../hooks/useCreateListing');

const mockUseCities = vi.mocked(useCities);
const mockUseCreateListing = vi.mocked(useCreateListing);

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <CreateListingDialog
      open
      onOpenChange={onOpenChange}
      sellerId="user-1"
      defaultCityId="city-1"
    />
  );
  return { onOpenChange };
}

describe('CreateListingDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCities.mockReturnValue({
      data: [
        { id: 'city-1', name: 'Liloan', slug: 'liloan', country: 'Philippines' },
        { id: 'city-2', name: 'Talisay', slug: 'talisay', country: 'Philippines' },
      ],
    } as any);
  });

  it('submits the listing with the entered fields and resets on success', async () => {
    const mutateAsync = vi.fn().mockResolvedValue('listing-1');
    mockUseCreateListing.mockReturnValue({ mutateAsync, isPending: false } as any);
    const { onOpenChange } = renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Title'), 'Headphones');
    await user.type(screen.getByPlaceholderText('Price'), '2500');
    await user.click(screen.getByRole('button', { name: 'Post listing' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        sellerId: 'user-1',
        cityId: 'city-1',
        category: 'other',
        title: 'Headphones',
        description: null,
        priceAmount: 2500,
        priceCurrency: 'PHP',
        photoFiles: [],
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows an error message when creating the listing fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('nope'));
    mockUseCreateListing.mockReturnValue({ mutateAsync, isPending: false } as any);
    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Title'), 'Headphones');
    await user.type(screen.getByPlaceholderText('Price'), '2500');
    await user.click(screen.getByRole('button', { name: 'Post listing' }));

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't create your listing. Please try again.")
      ).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/marketplace/CreateListingDialog.test.tsx`
Expected: FAIL with "Cannot find module './CreateListingDialog'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/marketplace/CreateListingDialog.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useCities } from '../../hooks/useCities';
import { useCreateListing } from '../../hooks/useCreateListing';
import { MARKETPLACE_CATEGORY_LABELS } from '../../lib/marketplaceDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MarketplaceCategory } from '../../types/marketplace';

const CATEGORY_OPTIONS = Object.entries(MARKETPLACE_CATEGORY_LABELS) as [MarketplaceCategory, string][];

const CURRENCIES: { value: 'USD' | 'PHP' | 'PI'; label: string }[] = [
  { value: 'PHP', label: 'PHP' },
  { value: 'USD', label: 'USD' },
  { value: 'PI', label: 'PI' },
];

interface CreateListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  defaultCityId: string;
}

export function CreateListingDialog({
  open,
  onOpenChange,
  sellerId,
  defaultCityId,
}: CreateListingDialogProps) {
  const { data: cities } = useCities();
  const createListing = useCreateListing();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'PHP' | 'PI'>('PHP');
  const [category, setCategory] = useState<MarketplaceCategory>('other');
  const [cityId, setCityId] = useState(defaultCityId);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [error, setError] = useState('');

  function resetForm() {
    setTitle('');
    setDescription('');
    setPriceAmount('');
    setPriceCurrency('PHP');
    setCategory('other');
    setCityId(defaultCityId);
    setPhotoFiles([]);
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    try {
      await createListing.mutateAsync({
        sellerId,
        cityId,
        category,
        title: title.trim(),
        description: description.trim() || null,
        priceAmount: Number(priceAmount),
        priceCurrency,
        photoFiles,
      });
      resetForm();
      onOpenChange(false);
    } catch {
      setError("Couldn't create your listing. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sell something</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <div className="flex gap-2">
            <Input
              placeholder="Price"
              type="number"
              value={priceAmount}
              onChange={(event) => setPriceAmount(event.target.value)}
              required
            />
            <Select
              value={priceCurrency}
              onValueChange={(value) => setPriceCurrency(value as 'USD' | 'PHP' | 'PI')}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem key={currency.value} value={currency.value}>
                    {currency.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={category} onValueChange={(value) => setCategory(value as MarketplaceCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cityId} onValueChange={setCityId}>
            <SelectTrigger>
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              {cities?.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="text-sm">
            Photos
            <input
              type="file"
              accept="image/*"
              multiple
              aria-label="Photos"
              onChange={(event) => setPhotoFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={createListing.isPending}>
              {createListing.isPending ? 'Posting…' : 'Post listing'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/marketplace/CreateListingDialog.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/CreateListingDialog.tsx src/components/marketplace/CreateListingDialog.test.tsx
git commit -m "feat: add CreateListingDialog with multi-photo upload"
```

---

### Task 9: MarketplacePage

**Files:**
- Modify: `src/routes/MarketplacePage.tsx` (replaces the `ComingSoon` placeholder entirely)
- Test: `src/routes/MarketplacePage.test.tsx` (new file)

**Interfaces:**
- Consumes: `useAuth` (existing), `useProfile` (existing), `useMarketplaceListings` + `MarketplaceScope` (Task 4), `MarketplaceListingCard` (Task 7), `CreateListingDialog` (Task 8), `MARKETPLACE_CATEGORY_LABELS` (Task 3).
- Produces: the `/marketplace` route's page component. Nothing else in this plan depends on it — it's the final integration point.

- [ ] **Step 1: Write the failing test**

Create `src/routes/MarketplacePage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MarketplacePage } from './MarketplacePage';
import { useProfile } from '../hooks/useProfile';
import { useCities } from '../hooks/useCities';
import { useMarketplaceListings } from '../hooks/useMarketplaceListings';
import { useCreateConversation } from '../hooks/useCreateConversation';
import { useUpdateListingStatus } from '../hooks/useUpdateListingStatus';
import { useDeleteListing } from '../hooks/useDeleteListing';
import { useCreateListing } from '../hooks/useCreateListing';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useProfile');
vi.mock('../hooks/useCities');
vi.mock('../hooks/useMarketplaceListings');
vi.mock('../hooks/useCreateConversation');
vi.mock('../hooks/useUpdateListingStatus');
vi.mock('../hooks/useDeleteListing');
vi.mock('../hooks/useCreateListing');

const mockUseProfile = vi.mocked(useProfile);
const mockUseCities = vi.mocked(useCities);
const mockUseMarketplaceListings = vi.mocked(useMarketplaceListings);
const mockUseCreateConversation = vi.mocked(useCreateConversation);
const mockUseUpdateListingStatus = vi.mocked(useUpdateListingStatus);
const mockUseDeleteListing = vi.mocked(useDeleteListing);
const mockUseCreateListing = vi.mocked(useCreateListing);

const listing = {
  id: 'listing-1',
  seller: { id: 'seller-1', username: 'renz', display_name: 'Ren', avatar_url: null },
  city_id: 'city-1',
  city_name: 'Liloan',
  category: 'electronics' as const,
  title: 'Noise-cancelling headphones',
  description: 'Barely used',
  price_amount: 2500,
  price_currency: 'PHP' as const,
  status: 'active' as const,
  created_at: '2026-07-01T00:00:00Z',
  photos: [{ id: 'photo-1', photo_url: 'https://example.com/1.jpg', display_order: 0 }],
};

function renderPage() {
  render(
    <MemoryRouter>
      <MarketplacePage />
    </MemoryRouter>
  );
}

describe('MarketplacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProfile.mockReturnValue({
      data: {
        id: 'user-1',
        username: 'renz',
        display_name: 'Ren',
        avatar_url: null,
        city_id: 'city-1',
        reputation_score: 0,
        created_at: '2026-01-01',
      },
    } as any);
    mockUseCities.mockReturnValue({
      data: [{ id: 'city-1', name: 'Liloan', slug: 'liloan', country: 'Philippines' }],
    } as any);
    mockUseMarketplaceListings.mockReturnValue({ data: [listing], isLoading: false } as any);
    mockUseCreateConversation.mockReturnValue({ mutateAsync: vi.fn() } as any);
    mockUseUpdateListingStatus.mockReturnValue({ mutate: vi.fn() } as any);
    mockUseDeleteListing.mockReturnValue({ mutate: vi.fn() } as any);
    mockUseCreateListing.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
  });

  it('defaults to the Nearby scope, scoped to the viewer city, and lists matching listings', () => {
    renderPage();
    expect(mockUseMarketplaceListings).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'nearby', cityId: 'city-1' })
    );
    expect(screen.getByText('Noise-cancelling headphones')).toBeInTheDocument();
  });

  it('switches scope when the Mine pill is clicked', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mine' }));
    expect(mockUseMarketplaceListings).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'mine' })
    );
  });

  it('updates the search filter as the user types', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search Marketplace'), 'phone');
    expect(mockUseMarketplaceListings).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'phone' })
    );
  });

  it('filters by category from the Categories dropdown', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Categories/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Electronics' }));
    expect(mockUseMarketplaceListings).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'electronics' })
    );
  });

  it('opens the Sell dialog when Sell is clicked', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Sell/ }));
    expect(screen.getByText('Sell something')).toBeInTheDocument();
  });

  it('shows an empty state when there are no listings', () => {
    mockUseMarketplaceListings.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText('No listings yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/routes/MarketplacePage.test.tsx`
Expected: FAIL — the current `MarketplacePage` only renders `<ComingSoon title="Marketplace" />`, so none of the new elements exist yet.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/routes/MarketplacePage.tsx`:

```tsx
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

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Today's picks</h2>
        <div className="flex gap-1">
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
      </div>

      {isLoading && <p className="text-muted-foreground">Loading listings…</p>}
      {!isLoading && listings?.length === 0 && (
        <p className="text-muted-foreground">No listings yet.</p>
      )}

      <div className="grid grid-cols-2 gap-4">
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/routes/MarketplacePage.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every pre-existing test file (no regressions from removing `ComingSoon` from `MarketplacePage`).

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: TypeScript and Vite build both succeed with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/MarketplacePage.tsx src/routes/MarketplacePage.test.tsx
git commit -m "feat: build Marketplace browse page (search, categories, scope, Sell dialog)"
```

---

## Final Whole-Branch Review

After Task 9, dispatch a final whole-branch code review (most capable model) covering the full diff from before Task 1 through Task 9. Pay particular attention to:

- RLS correctness on `marketplace_listings`/`marketplace_listing_photos` (Task 1) — re-verify the `update`/`delete` policies can't be exploited to modify or remove another user's listing.
- The `useMarketplaceListings` scope logic (Task 4) — confirm `'mine'` never leaks another user's `active`-only filtering gap, and that `'nearby'` truly excludes `sold` listings from other users.
- `MarketplaceListingCard`'s owner-vs-buyer branching (Task 7) — confirm there's no path where a non-owner sees the Sold/Active/Delete controls, or an owner is shown "Message Seller" for their own listing.
- Photo upload path construction (Task 5) — confirm the `{sellerId}/{listingId}/{index}.{ext}` path always starts with the authenticated uploader's own id, matching the Storage policy from Task 2.

Once the final review is clean, use `superpowers:finishing-a-development-branch` to wrap up.
