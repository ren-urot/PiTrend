# PiMesh — Foundation Phase Design

Date: 2026-07-19
Status: Approved

## Context

PiMesh is an offline-first PWA for the Pi Network community, combining city-based
communities, messaging, Pi Network news, and local marketplaces (full product vision:
see the original PRD supplied by the user). The full PRD spans many independent
subsystems, so the work is split into sub-projects, each with its own design → plan →
build cycle:

1. **Foundation** (this document)
2. Identity & City Communities
3. Community Feed & Channels
4. Messaging
5. Marketplace & Merchant Directory
6. Pi News
7. Notifications & Search
8. Moderation & Roles

This document covers only **#1, Foundation** — the scaffold, auth, PWA/offline
plumbing, and a navigable app shell that later phases plug into.

## Goals

- Vite + React + TypeScript + Tailwind CSS project scaffold, deployable to Vercel.
- Supabase wired as the backend (Postgres + Auth + Storage) using an existing,
  already-created Supabase project.
- Username-based public identity, decoupled from the private email used for login.
- Installable PWA: manifest, service worker, offline shell caching.
- A navigable app shell (routing + nav + placeholder screens) that subsequent
  sub-projects build their real screens into.
- Foundational offline data layer (structured client-side storage for drafts/cache)
  that later phases (messaging drafts, cached feeds, etc.) build on.

## Non-Goals (explicitly deferred to later phases)

- Real feed, messaging, marketplace, or news content — this phase ships placeholder
  screens only for those tabs.
- Push notifications, global search, moderation tools, roles/permissions.
- End-to-end encryption, voice messages, file sharing in chat.
- QR code *scanning* or any peer-connection flow — this phase only generates a QR
  code encoding a profile URL; nothing exists yet to scan it into.
- Any peer-to-peer / mesh networking (explicitly future-roadmap Phase 2+ in the PRD,
  and not implementable with today's standard web APIs).

## Architecture

### Stack

- **Frontend**: Vite, React, TypeScript, Tailwind CSS.
- **UI components**: shadcn/ui primitives (button, input, dialog, avatar, tabs, nav),
  themed via Tailwind.
- **Routing**: React Router. Route groups: `/login`, `/feed`, `/messages`,
  `/marketplace`, `/news`, `/profile`, `/u/:username` (public profile view).
- **Backend**: Supabase (Postgres + Auth + Storage). Project already created by the
  user; client is wired via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` read from
  a gitignored `.env.local`. The anon key is safe to ship client-side by Supabase's
  design (access is governed by Row Level Security policies, not key secrecy).
- **Server state**: TanStack Query wraps all Supabase calls, giving cache-first reads
  and background refetch on reconnect — the mechanism that makes "read cached data
  while offline" work without bespoke caching code.
- **Offline data**: Dexie.js (a Promise-based wrapper over IndexedDB) stores the
  user's session/profile snapshot and any drafts created while offline. Workbox (via
  `vite-plugin-pwa`) precaches the app shell and static assets, and runtime-caches GET
  requests, and generates the web app manifest for installability.
- **Deployment**: Vercel.

### Data model (this phase)

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
```

Row Level Security: any authenticated user can read all profiles (public directory);
a user can only insert/update their own row (`auth.uid() = id`).

### Auth flow

1. Unauthenticated user lands on `/login`, enters their email.
2. Supabase sends a magic link; clicking it redirects back into the app and
   establishes a session (no password to remember, no phone number required, per the
   PRD's account requirements).
3. If the authenticated user has no `profiles` row yet, they're routed to a one-time
   username-selection screen (uniqueness checked against the `profiles` table) before
   reaching the app shell.
4. Once a profile exists, the user lands on the app shell.

### App shell

- Bottom-tab navigation on mobile, sidebar on desktop (same route set, responsive
  layout via Tailwind breakpoints).
- Tabs: Feed, Messages, Marketplace, News, Profile.
- Feed / Messages / Marketplace / News render a "Coming soon" placeholder screen.
- Profile renders the current user's username, display name, avatar, and a QR code
  encoding `https://<deployed-domain>/u/<username>`.

### Offline behavior

- Service worker (Workbox, via `vite-plugin-pwa`) precaches the built app shell and
  static assets on install, so the app loads with zero network once visited.
- TanStack Query's cache is persisted through a Dexie-backed persister, so the last
  successfully fetched profile data renders immediately offline instead of a loading
  spinner or error.
- Screens the user has never successfully loaded while online show an explicit
  "you're offline" empty state rather than an error boundary.
- When connectivity returns, TanStack Query's background refetch brings data current
  automatically — no manual "sync" action required from the user in this phase.

### Testing

- Vitest + React Testing Library for component/unit tests.
- One end-to-end smoke test covering: unauthenticated → login → username creation →
  shell renders, against a mocked Supabase client.

## Open questions / risks

- iOS Safari has known PWA limitations (no Web Push at all on older iOS versions,
  stricter storage eviction policies for installed web apps) — acceptable per the
  PRD's own acknowledgment ("Safari PWA limitations apply"); no mitigation attempted
  in this phase beyond standard manifest/service-worker setup.
- Vercel's redirect URL for Supabase magic links must be configured in the Supabase
  Auth dashboard settings once the Vercel deployment URL is known — a manual step for
  the user during implementation, not something this plan can automate.
