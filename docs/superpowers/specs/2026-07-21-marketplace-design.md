# PiMesh — Marketplace Design

Date: 2026-07-21
Status: Approved

## Context

`/marketplace` currently renders a "Coming soon" placeholder
(`MarketplacePage.tsx`), same as `/news` did before that sub-project was
built. The Feed already has a `buy_sell` post type (`price_amount`,
`price_currency`, free-text `category`) that appears mixed into the regular
feed, but Marketplace was explicitly scoped as its own dedicated
listings system with its own schema — not a filtered view over `buy_sell`
posts — so it can grow its own fields (multi-photo, fixed categories,
sold/active status) without touching Feed. Requested directly by the user
from a reference screenshot (Facebook-Marketplace-style: search bar,
Sell/Categories pills, "Today's picks" grid of cards with photo, title,
price, location).

The existing `cities` table (from Identity & City Communities — Cebu-province
cities like Liloan, Talisay, Cebu City) is reused as-is for listing location;
no new location schema is introduced.

## Goals

- **Dedicated `marketplace_listings` schema**, independent of Feed's
  `posts`/`post_buy_sell` tables.
- **Fixed category taxonomy**: `electronics`, `vehicles`, `property`,
  `home_furniture`, `jobs`, `other` — powers a real category filter, unlike
  Feed's free-text `buy_sell.category`.
- **Listings are tied to a city** (existing `cities` table). Browsing
  defaults to the viewer's own city community first ("Nearby"), with the
  option to browse all cities.
- **Multiple photos per listing**, uploaded to a new `marketplace-media`
  storage bucket, mirroring the existing `post-media`/`message-media`
  bucket pattern.
- **Active/sold status**: sellers can mark their own listing sold, which
  hides it from normal browse (Nearby/All) but keeps it visible in their own
  "Mine" view — sold listings are not deleted, just filtered out of public
  browse.
- **Contact via existing Messaging**: a "Message Seller" action reuses
  `useCreateConversation` (finds-or-creates a 1:1 conversation with the
  seller) and navigates to the resulting conversation — no separate contact
  mechanism.
- **Search**: a debounced `ilike` text search over listing `title` and
  `description`, client-triggered, no separate search infrastructure.
- **No dedicated detail route** — tapping a listing card expands it in
  place (spanning the full grid width, pushing later cards down) to reveal
  the photo carousel, full description, and the Message Seller button (or,
  for the listing's own seller, a Sold/Active toggle and Delete button).

## Non-Goals (explicitly deferred)

- **Editing listing fields** (title, price, description, photos) after
  creation — v1 only supports create, toggle sold/active, and delete.
- **Offers/bidding, saved searches, or favoriting listings.**
- **In-app payments or escrow** — Message Seller is the entire transaction
  flow; payment happens outside the app, consistent with the rest of
  PiMesh's Pi-community focus.
- **Push notifications for new listings matching a search/category** —
  belongs to sub-project #7, Notifications & Search.
- **Reporting/moderation of listings** — belongs to sub-project #8,
  Moderation & Roles.
- **A city-independent global "featured" ranking** — Nearby-first is the
  only ranking; no popularity/recency-boost algorithm beyond
  `created_at desc`.

## Architecture

### Data model

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

create table public.marketplace_listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  photo_url text not null,
  display_order integer not null
);
```

`seller_id` references `public.profiles(id)` (not `auth.users(id)`), matching
`posts.author_id` and `messages.sender_id` elsewhere in this project — so
PostgREST can embed seller username/avatar in one query.

### RLS

Both tables follow the same authenticated-read-all / insert-own pattern
already established for `posts`/`comments`/`likes`:

- `marketplace_listings`: `select` — any authenticated user, no restriction
  (browse needs to see everyone's active listings; "Mine" filtering happens
  client-side by `seller_id = viewer`, same as how Feed's bookmarks/likes are
  scoped client-side over an unrestricted read policy). `insert` requires
  `auth.uid() = seller_id`. `update` restricted to `auth.uid() = seller_id`
  (used only for the `status` toggle — no other column is ever
  client-updated). `delete` restricted to `auth.uid() = seller_id`.
- `marketplace_listing_photos`: `select` — any authenticated user. `insert`
  requires the referenced listing to belong to the inserting user
  (`exists (select 1 from marketplace_listings where id = listing_id and
  seller_id = auth.uid())`), matching the `post_media` insert-policy pattern.
  No `update`/`delete` policy — photos are only ever removed via the
  listing's own cascade delete.

### Storage

New `marketplace-media` bucket, policies mirrored from
`0007_post_media_storage_policies.sql`: authenticated users can upload to
their own `{user_id}/...` prefix, anyone can read (public bucket), matching
how `post-media`/`message-media` are configured.

### UI / Routes

- `/marketplace` (replaces the `ComingSoon` placeholder) — the browse page:
  - Search bar (debounced `ilike` on title+description).
  - "Sell" pill — opens a create-listing dialog (title, description, price +
    currency, category select, city select, multi-photo picker). On submit:
    insert the listing (`.select('id').single()` is safe here — unlike
    conversations, the read-all SELECT policy has no participant
    restriction, so reading back the inserted row never 403s), then upload
    each selected photo to `marketplace-media` and insert one
    `marketplace_listing_photos` row per photo.
  - "Categories" pill — a dropdown/filter menu over the fixed category enum
    plus "All".
  - A three-way scope control — "Nearby" (viewer's own city, the default),
    "All cities", or "Mine" (viewer's own listings, active and sold both
    included — the only place sold listings are visible again after being
    marked sold) — mutually exclusive, exactly one active at a time.
    Category and search filters apply within whichever scope is selected,
    including "Mine".
  - "Today's picks" grid (2 columns), each card showing the first photo
    (`display_order = 0`), title, price, and city name.
  - Tapping a card expands it: the card becomes full-width (`col-span-2`),
    revealing the remaining photos as a simple carousel, the full
    description, and either a "Message Seller" button (reuses
    `useCreateConversation` with `{ creatorId: viewer, participantIds:
    [seller_id], isGroup: false }`, then `navigate('/messages/' +
    conversationId)`) or, when the viewer is the seller, a Sold/Active
    toggle button (`useUpdateListingStatus`) and a Delete button
    (`useDeleteListing`). Only one card is expanded at a time (single piece
    of state in the parent `MarketplacePage`/grid component) — expanding a
    second card collapses the first.

### Hooks

- `useMarketplaceListings({ cityId, category, search, mine, viewerId })` —
  fetches listings with embedded seller (`username`, `display_name`,
  `avatar_url`) and photos (ordered by `display_order`), filtered
  server-side by `status = 'active'` unless `mine` is true (in which case
  filtered by `seller_id = viewerId` instead, both statuses included),
  further filtered by `city_id` (when not "All cities"), `category` (when
  not "All"), and `title.ilike/description.ilike` (when `search` is
  non-empty), ordered by `created_at desc`.
- `useCreateListing()` — mutation: insert the listing row, then upload
  each photo file and insert its `marketplace_listing_photos` row, mirroring
  `useCreatePost`'s single-photo upload pattern extended to a loop over
  multiple files.
- `useUpdateListingStatus()` — mutation: updates `status` for a listing the
  viewer owns.
- `useDeleteListing()` — mutation: deletes a listing the viewer owns
  (photos cascade).
- `useCreateConversation` (existing, unchanged) — reused directly for
  Message Seller.

### Types

```ts
export type MarketplaceCategory =
  | 'electronics' | 'vehicles' | 'property' | 'home_furniture' | 'jobs' | 'other';

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
  status: 'active' | 'sold';
  created_at: string;
  photos: MarketplaceListingPhoto[];
}
```

## Testing

Same conventions as News and Messaging: Vitest + Testing Library for
components/hooks, mocked `supabase` client for select/insert/update/delete
chains. The expand-in-place grid interaction is tested by asserting only one
card's detail content is present at a time and that expanding a second card
removes the first's. `useCreateConversation`'s existing test coverage is
unchanged — Marketplace's Message Seller button is tested by asserting it
calls the existing hook with the expected arguments, not by re-testing the
hook itself.

## Open Questions Resolved During Brainstorming

- Separate `marketplace_listings` schema, not a filtered view over Feed's
  `buy_sell` posts.
- Listings tied to the existing `cities` table; Nearby-first browsing.
- Fixed category enum, not free text.
- Contact via existing Messaging (`useCreateConversation`), with an
  active/sold status toggle.
- Multiple photos per listing.
- No dedicated detail route — expand-in-place on the grid instead.
- Search is `ilike` over title + description.
