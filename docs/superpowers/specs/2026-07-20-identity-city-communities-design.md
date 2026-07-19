# PiMesh — Identity & City Communities Design

Date: 2026-07-20
Status: Approved

## Context

This is sub-project #2 of PiMesh's 8-phase decomposition (see the Foundation
design doc, `docs/superpowers/specs/2026-07-19-foundation-design.md`, for the
full breakdown). The Foundation phase already shipped user profiles, QR
identity sharing, and a navigable app shell with a placeholder Feed tab.
This phase adds city communities: every user joins one Philippine city, can
change it later, and the Feed tab becomes city-aware (still no real posts —
that's sub-project #3, Community Feed & Channels).

## Goals

- A `cities` reference table seeded with the PRD's initial city list.
- City selection folded into the existing onboarding step (`UsernameSetupPage`).
- A city switcher on the profile page.
- `FeedPage` shows which city's feed the user is in (still a placeholder for
  actual content).
- A `reputation_score` field on profiles, per the PRD's account requirements
  (display only — no scoring logic yet, since nothing produces reputation
  until later phases).

## Non-Goals (explicitly deferred)

- Real city feed content, marketplace, public chat, merchant directory,
  events, or city news — each is its own later sub-project (#3 Community
  Feed & Channels, #4 Messaging, #5 Marketplace & Merchant Directory, #6 Pi
  News).
- Reputation *scoring logic* — only the field and its (currently static)
  display exist in this phase.
- Multi-city membership — the PRD says "every user joins a city community"
  (singular); one `city_id` per profile is sufficient until Phase 3 of the
  roadmap (cross-city interactions) is actually built.
- City moderators / city admin roles — belongs to sub-project #8
  (Moderation & Roles).

## Architecture

### Data model

```sql
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  country text not null default 'Philippines',
  created_at timestamptz not null default now()
);
```

Row Level Security: readable by everyone (`anon` and `authenticated`) — this
is non-sensitive reference data (a lookup list), consistent with how the
PRD's own city list is public information, so there's no reason to restrict
reads.

Seeded rows: the PRD's initial city list (Manila, Davao, Iloilo, Bacolod,
Baguio, General Santos) plus an expanded Cebu-area corridor requested during
planning — Cebu City, Mandaue City, Lapu-Lapu City, Cordova, Consolacion,
Liloan, Compostela, Danao City (north boundary), Talisay, Minglanilla, Naga
City, San Fernando, Carcar City (south boundary) — 19 rows total.

`profiles` (from Foundation) gains two columns:

```sql
alter table public.profiles
  add column city_id uuid not null references public.cities(id),
  add column reputation_score integer not null default 0;
```

`city_id` is `not null` — the app enforces "every user joins a city" by
requiring a city selection in the same form that creates the profile row, so
no profile can exist without one.

### Flows

1. **Onboarding**: `UsernameSetupPage` (Foundation) gains a city picker
   (shadcn `Select`, populated via a new `useCities()` query) alongside its
   existing username/display-name fields. The profile insert becomes one
   atomic `{ id, username, display_name, city_id }` — still a single
   onboarding step, no additional screen.
2. **Feed**: `FeedPage` (currently Foundation's bare "Coming soon"
   placeholder) reads the current user's `city_id` via the existing
   `useProfile` hook, resolves the city's display name via `useCities()`,
   and renders `"{City} Feed — coming soon."` through the existing
   `ComingSoon` component — no new placeholder pattern introduced.
3. **Changing city**: `ProfilePage` (Foundation) displays the current city
   name alongside existing profile info, with a city switcher (the same
   `Select` component) that updates `profiles.city_id` and invalidates the
   `['profile', userId]` query-cache key — the same invalidation pattern
   `UsernameSetupPage` already uses after its insert.

### New files / hooks

- `src/types/city.ts` — `City` type (`{ id, name, slug, country }`).
- `src/hooks/useCities.ts` — TanStack Query hook fetching all cities, keyed
  `['cities']`. Small, rarely-changing dataset (~10 rows); used by both the
  onboarding picker and the profile-page switcher.
- `src/components/ui/select.tsx` — new shadcn component (`npx shadcn add
  select`), added the same way Foundation's other shadcn components were.
- `Profile` type (`src/types/profile.ts`, from Foundation) gains
  `city_id: string` and `reputation_score: number`; `useProfile`'s Supabase
  `select()` column list picks up both. This extends an existing,
  already-reviewed hook's return shape rather than introducing a parallel
  one — every current consumer (`ProtectedLayout`, `SessionOnlyLayout`,
  `ProfilePage`) keeps working unchanged since they only destructure the
  fields they already use.

### Testing

Same approach as Foundation: Vitest + mocked Supabase client per
hook/component. `UsernameSetupPage`'s existing test gains a case covering
city selection as part of the insert payload. A new `useCities` test mirrors
`useProfile`'s existing test structure. `ProfilePage`'s test gains a case
for the city switcher's update-and-invalidate flow.

## Open questions / risks

- Seeding the `cities` table is a manual Supabase-dashboard step, same as
  Foundation's `profiles` migration — the implementer cannot apply SQL to
  the live project directly and must hand it to the user to run, then
  verify via the REST API.
- Existing profile rows (if any exist in the live database from Foundation
  testing) predate the `city_id not null` constraint. Before applying the
  `alter table ... add column city_id uuid not null`, the implementation
  plan must check the live row count — if any rows already exist, the
  migration needs a one-time backfill (e.g. defaulting to a specific city)
  before the `not null` constraint can be added; if the table is empty, no
  backfill is needed and the constraint applies directly.
