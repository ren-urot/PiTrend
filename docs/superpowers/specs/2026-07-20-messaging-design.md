# PiMesh — Messaging Design

Date: 2026-07-20
Status: Approved

## Context

This is sub-project #4 of PiMesh's 8-phase decomposition. Foundation,
Identity & City Communities, and Community Feed & Channels are complete —
the app has auth, profiles with mandatory `city_id`, and a fully-built
community feed with an offline-first "draft-first" post queue (Dexie +
`processQueue`, session-scoped, crash-recoverable — see
`docs/superpowers/plans/2026-07-20-community-feed-04-offline-drafting.md`
for the pattern this sub-project reuses). `/messages` currently renders a
"Coming soon" placeholder (`MessagesPage.tsx`), same as `/marketplace` and
`/news` still do.

The original PRD's messaging requirements weren't preserved verbatim
between sessions, so this design's scope was re-established directly with
the user rather than re-derived from a stored document.

Given the resulting scope (schema + RLS + realtime + 1:1/group UI + unread
badges + username search, plus a full offline-drafting layer on top), the
implementation is expected to span two sequential plan documents under this
one design — Plan 1 covering the full synchronous chat experience, Plan 2
layering offline-first message queueing on top — mirroring the sequencing
that worked well for Community Feed & Channels (build the synchronous
experience first, then offline-first as the final layer). Confirmed with
the user during brainstorming; finalized at the writing-plans stage.

## Goals

- **1:1 direct messages and group chats**, both modeled as one kind of
  `conversation` (a 1:1 is simply a conversation with exactly two
  participants) rather than two parallel schemas.
- **Text and photo messages** — no video, voice, or file attachments.
- **Any authenticated user can message any other authenticated user** — no
  city-scoping restriction on who can be messaged, unlike the feed.
- **Live delivery via Supabase Realtime** while a conversation is open —
  this is the first use of Realtime anywhere in PiMesh; everything built so
  far uses TanStack Query polling/refetch-on-mount instead.
- **Offline-first sending**, matching the feed's "always draft-first"
  model: composing a message — online or offline — queues it locally first,
  then a background sync process delivers it. This sub-project's queue is
  built with the session-scoping and stuck-status recovery already learned
  the hard way in Community Feed & Channels Plan 4 (see
  `feedback_pimesh_async_background_writes` in project memory), not
  re-discovered from scratch.
- **Unread message counts**, shown as a badge on the Messages nav tab and
  per-conversation in the conversation list. Driven by a per-participant
  `last_read_at` timestamp, not a separate read-tracking table.
- **Group membership is flat** — any member can add or remove any other
  member; there is no owner/admin role.
- **Starting a conversation** happens via a "New message" compose flow with
  username search (single-select for 1:1, multi-select for a group) — a new
  capability, since no username-search query exists in the codebase yet.

## Non-Goals (explicitly deferred)

- **Read receipts** — no per-message "seen by" state, only the
  conversation-level unread count.
- **Typing indicators** — no realtime presence/typing signal.
- **Message deletion or editing** — messages are permanent once sent.
- **Push notifications** — new-message alerts are in-app only (the unread
  badge). Actual push notification delivery belongs to sub-project #7,
  Notifications & Search.
- **End-to-end encryption, voice messages, file sharing** — carried
  forward from the Foundation design doc's original non-goals; still out of
  scope here.
- **Group admin roles / ownership** — flat membership only, per the Goals
  section above; no permission tiers within a group.
- **Blocking/muting a user or conversation** — no moderation controls yet;
  belongs to sub-project #8, Moderation & Roles.
- **City-scoping of who can be messaged** — explicitly rejected in favor of
  open messaging (see Goals).

## Architecture

### Data model

A unified schema for both 1:1 and group conversations:

```sql
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  media_url text,
  created_at timestamptz not null default now(),
  check (body is not null or media_url is not null)
);
```

`sender_id`/`user_id` reference `public.profiles(id)` rather than
`auth.users(id)` — same reason as `posts.author_id` in Community Feed &
Channels: PostgREST can then embed sender/participant profile info
(username, avatar) in one query instead of a second round trip.

`name` is only meaningful when `is_group = true`; a 1:1 conversation's
display name is derived client-side from the other participant's profile.
`last_read_at` on `conversation_participants` is the entire mechanism for
unread counts — no separate `message_reads` table: a message is unread for
a participant if `messages.created_at > conversation_participants.last_read_at`
for that participant's row.

There's no `check` constraint forcing exactly 2 participants for
`is_group = false` — enforcing that in the database adds complexity for a
property the application code already guarantees at creation time (the
"New message" flow either creates a 1:1 with exactly one other recipient or
a group with `is_group = true`), consistent with how `posts.post_type`
extension-table pairing is enforced app-side elsewhere in this project.

### RLS

- `conversations`: a user can `select` a conversation only if they have a
  matching row in `conversation_participants`. `insert` is permissive for
  any authenticated user (`with check (true)`) — a conversation row alone
  identifies no one, so the meaningful access check is the
  `conversation_participants` insert that immediately follows it (see
  "Conversation creation" below), not the conversation row itself. No
  `update`/`delete` policy (conversations aren't renamed or removed in this
  build — renaming is deferred, matching the flat-membership/no-admin
  non-goal).
- `conversation_participants`: a user can `select` rows for any
  conversation they're a participant in (so they can see who else is in
  it). `insert` is allowed for creating a conversation (inserting yourself
  plus the other participant(s) at creation time) or for adding a member to
  an existing group you already belong to. `update` is restricted to a
  user's own row (for bumping their own `last_read_at`). `delete` is
  allowed for removing yourself (leaving) or removing another participant,
  restricted to conversations you're currently a participant in.
- `messages`: `select`/`insert` restricted to participants of the
  message's `conversation_id`, `insert` additionally requires
  `auth.uid() = sender_id`. No `update`/`delete` (matches the "no
  editing/deletion" non-goal).

### Realtime

First use of Supabase Realtime in this project. Two subscriptions:

1. **Conversation list** (`MessagesPage`): subscribes to `postgres_changes`
   on `messages` (insert) with no filter beyond what RLS already restricts
   the payload to, used to invalidate the conversation-list TanStack Query
   cache so previews and unread counts update live without a fixed poll
   interval.
2. **Open thread** (`ConversationPage`): subscribes to `postgres_changes`
   on `messages` filtered to `conversation_id=eq.<id>`, appending new
   messages directly to the query cache as they arrive.

Both subscriptions are torn down on unmount. This mirrors the shape of
`useOfflineSync`/`useQueuedDrafts` in spirit (a hook that keeps a query
cache fresh from a source TanStack Query can't observe on its own) but uses
Realtime instead of polling, since sub-second latency is the point of a
chat UI in a way it wasn't for the feed's offline queue.

### Offline-first sending

Reuses the `draftPosts`/`offlineQueue` pattern from Community Feed &
Channels Plan 4, with the two lessons from that plan's final review applied
from the start instead of re-discovered:

- A new Dexie table, `draftMessages` (schema version 3 in `db.ts`), holding
  `{ id, conversationId, senderId, body, mediaBlob?, status, lastError,
  createdAt }` — same shape philosophy as `DraftPost`, one optional
  `mediaBlob: { blob: Blob; mediaType: 'photo' }` (no video for messages,
  per Goals).
- A `messageQueue.ts` module (`queueDraftMessage`, `processMessageQueue`,
  `retryDraftMessage`) mirroring `offlineQueue.ts`'s shape, but written
  with session-scoping (`processMessageQueue` only ever touches drafts
  where `senderId === the current session's user id`) and orphan recovery
  (queries `status in ('queued', 'syncing')`, not just `'queued'`) as
  first-class requirements, plus the same `isProcessing` in-flight guard
  against concurrent invocation.
- `useOfflineSync` (already exists, called once from `AppShell`) is
  extended to also call `processMessageQueue()` alongside `processQueue()`
  — one hook driving both the post queue and the message queue, since both
  fire on the same mount/reconnect triggers.

This is a separate Dexie table and a separate queue module from posts —
not a shared generic "draft" abstraction — because messages and posts sync
to different tables with different shapes (`conversation_id`/`sender_id`
vs. `city_id`/`channel_id`/`post_type`), and forcing a shared abstraction
across them now would be speculative generality for a resemblance that's
only skin-deep at the field-name level.

### UI / Routes

- `/messages` (replaces the `ComingSoon` placeholder) — conversation list:
  each row shows the other participant's (or group's) name/avatar, the
  latest message preview, a relative timestamp, and an unread-count badge
  if applicable. A "New message" button opens the compose flow.
- `/messages/:conversationId` (new route) — the open thread: scrollable
  message history (oldest to newest), a composer at the bottom (text input
  + photo picker, matching the feed composer's file-input pattern), and
  queued/failed local drafts rendered inline among the real messages the
  same way `DraftPostCard` renders inline in `FeedPage`/`ChannelPage`.
- New-message compose (likely a dialog/sheet, not a separate route): a
  username search input (new `useSearchProfiles(query)` hook, querying
  `profiles` with an `ilike` filter on `username`) with single-select
  (immediately creates/opens a 1:1) or multi-select-then-confirm (creates a
  group). The group name field is optional, not required — if left blank,
  `conversations.name` stays `null` and the UI derives a display name
  client-side from the member list (comma-separated usernames, truncated
  with "+N more" past a few names), the same convention most chat apps use
  for unnamed groups. This avoids forcing the creator through an extra
  required step just to start a group.
- Messages nav tab in `AppShell`: gains an unread-count badge, computed
  from a new `useUnreadCount(userId)` hook (a lightweight aggregate query
  summing unread messages across all of a user's conversations).

### Conversation creation

Creating a conversation is two writes (the `conversations` row, then one
`conversation_participants` row per participant including the creator) that
need to succeed or fail together from the user's perspective. Following
this project's established pattern (posts + extension tables are already
multiple sequential inserts with no database transaction, accepted in
Community Feed & Channels Plans 1-2 as a deferred non-blocking gap): insert
the conversation, then the participant rows, in sequence from the client,
accepting the same small non-atomicity risk already present elsewhere in
this codebase rather than introducing a new pattern (an RPC/stored
procedure) for this one case.

Before creating a new 1:1 conversation, the app checks whether one already
exists between the two users (query `conversation_participants` for
conversations where both user IDs appear and `is_group = false`) and opens
the existing one instead of creating a duplicate — groups have no such
dedup check, since two groups with the same members but created separately
are legitimately different conversations (e.g. one could be renamed, or
have members added independently later).

## Testing

Same conventions as Community Feed & Channels: Vitest + Testing Library for
components/hooks, `fake-indexeddb/auto` (already globally configured) for
real Dexie behavior in queue tests, mocked `supabase` client for
insert/select/realtime-subscribe chains. Realtime subscriptions are tested
by mocking `supabase.channel(...).on(...).subscribe()` and manually
invoking the registered callback to simulate an incoming message, rather
than standing up a real WebSocket connection in tests.

## Open Questions Resolved During Brainstorming

- 1:1 + group (not 1:1-only) — user chose to include groups from the start.
- Text + photos (not text-only).
- Open messaging, not city-scoped.
- Realtime (not polling) for live delivery.
- Offline-first queueing, matching the feed's pattern.
- Unread badges only — no read receipts, typing indicators, or deletion.
- Flat group membership — no admin/owner role.
- "New message" button + username search — not profile-page-only.
