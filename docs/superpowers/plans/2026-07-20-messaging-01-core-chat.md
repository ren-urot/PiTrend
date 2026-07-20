# Messaging — Plan 1 of 2: Core Chat Experience

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MessagesPage`'s placeholder with a full synchronous 1:1 + group chat experience: conversation list, thread view, sending text/photo messages, live delivery via Supabase Realtime, unread badges, and starting new conversations via username search. Offline-first message queueing (matching Community Feed & Channels' "draft-first" pattern) is Plan 2, built after this plan is reviewed and working.

**Architecture:** A unified schema (`conversations` + `conversation_participants` + `messages`) handles both 1:1 and group chats the same way — a 1:1 is just a conversation with exactly two participants. This is the first use of Supabase Realtime anywhere in PiMesh; two subscriptions (conversation list, open thread) keep TanStack Query caches live. `sender_id`/`user_id` reference `public.profiles(id)` (not `auth.users(id)`), matching `posts.author_id`'s convention, so PostgREST can embed sender/participant display info in one query.

**Tech Stack:** Same as prior sub-projects — see `docs/superpowers/plans/2026-07-19-foundation.md`'s Tech Stack section for exact versions. No new npm dependencies this plan (Supabase Realtime ships in `@supabase/supabase-js`, already installed).

## Global Constraints

- **This is the first use of Supabase Realtime in PiMesh.** The schema migration (Task 1) must explicitly add `messages` to the `supabase_realtime` publication (`alter publication supabase_realtime add table public.messages;`) — this can't be inferred from RLS alone, mocked tests can't catch a missing publication, and it must be verified live (query `pg_publication_tables`) during Task 1.
- **`conversation_participants`' RLS policies self-reference their own table** via correlated `EXISTS` subqueries (checking whether the current user is already a participant of the same conversation). This is standard, safe Postgres RLS practice — a different mechanism from the earlier PostgREST self-referential *embed hint* issue (`feedback_pimesh_postgrest_embed_hints` in project memory) — but it has a real consequence: **the INSERT policy requires participant rows to be inserted in two sequential statements** (the creator's own row first, then the other participants' rows in a second statement), not one batched multi-row insert, because a single multi-row INSERT's `WITH CHECK` subqueries aren't guaranteed to see other rows from the same statement. `useCreateConversation` (Task 7) implements this as two sequential inserts — do not "optimize" this into one batched insert without re-verifying live against the real Supabase project first.
- **Realtime `postgres_changes` payloads carry only the changed row's own columns — no embedded/joined data.** `useMessages`' realtime handler therefore receives a `Message` with no sender display name attached. Rather than re-fetching per incoming message, sender display names are resolved separately via `useConversation`'s embedded participant list (Task 4), which both the initial fetch and realtime-appended messages can look up from the same map. Keep `Message`'s shape (Task 3) limited to raw `messages` columns for this reason — don't add an embedded `sender` field to it.
- **`message-media` is a public-read Storage bucket**, matching `post-media`'s existing security model exactly (write restricted, read open to anyone with the URL) — this is a deliberate, disclosed trade-off, not an oversight. True per-conversation private access would need signed URLs with expiry/refresh handling, which is out of scope for this MVP; if this needs revisiting later, it's a follow-up, not a blocker for this plan.
- Every task with runtime logic ships with a Vitest test; migration/storage tasks verify via the Supabase dashboard + a REST/SQL check, matching the pattern from prior sub-projects.
- Manual Supabase-dashboard steps (applying migrations, creating the Storage bucket) require the user's action — the implementer cannot do these programmatically.
- **This plan changes `MessagesPage` from a placeholder to a real page and adds a new route (`/messages/:conversationId`).** No existing test currently asserts `MessagesPage`'s placeholder text (checked: neither `routes.test.tsx` nor any other test references "Messages — coming soon"), so this is a clean replacement with no anticipated hidden-consumer breakage — still, grep before each task that touches a shared file, per `feedback_pimesh_hidden_consumers`.
- **`AppShell.tsx` gains a new `useAuth()` call** (Task 13, for the unread badge) that it doesn't currently make — `AppShell.test.tsx` will need a `useAuth` mock added alongside its existing `useOnlineStatus`/`offlineQueue` mocks, anticipated here rather than discovered mid-task.

---

### Task 1: Messaging schema migration

**Files:**
- Create: `supabase/migrations/0010_create_messaging_schema.sql`

**Interfaces:**
- Produces: `public.conversations`, `public.conversation_participants`, `public.messages` — all with RLS enabled, `messages` added to the `supabase_realtime` publication. Relied on by every later task in this plan.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_create_messaging_schema.sql`:

```sql
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "Participants can read their conversations"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants
      where conversation_participants.conversation_id = conversations.id
      and conversation_participants.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create conversations"
  on public.conversations for insert
  to authenticated
  with check (true);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_participants enable row level security;

create policy "Participants can read their conversations' participant lists"
  on public.conversation_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants as self
      where self.conversation_id = conversation_participants.conversation_id
      and self.user_id = auth.uid()
    )
  );

create policy "Users can add themselves or be added by a fellow participant"
  on public.conversation_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversation_participants as self
      where self.conversation_id = conversation_participants.conversation_id
      and self.user_id = auth.uid()
    )
  );

create policy "Participants can update their own row"
  on public.conversation_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Participants can remove themselves or others from conversations they're in"
  on public.conversation_participants for delete
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants as self
      where self.conversation_id = conversation_participants.conversation_id
      and self.user_id = auth.uid()
    )
  );

create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  media_url text,
  created_at timestamptz not null default now(),
  check (body is not null or media_url is not null)
);

alter table public.messages enable row level security;

create policy "Participants can read messages in their conversations"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants
      where conversation_participants.conversation_id = messages.conversation_id
      and conversation_participants.user_id = auth.uid()
    )
  );

create policy "Participants can send messages in their conversations"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversation_participants
      where conversation_participants.conversation_id = messages.conversation_id
      and conversation_participants.user_id = auth.uid()
    )
  );

create index messages_conversation_idx on public.messages (conversation_id, created_at);

alter publication supabase_realtime add table public.messages;
```

- [ ] **Step 2: Apply it to the Supabase project (manual dashboard step)**

Open the Supabase dashboard for `https://puqakbajkmlwohuznxut.supabase.co` → SQL Editor → paste the contents of `supabase/migrations/0010_create_messaging_schema.sql` → Run.

- [ ] **Step 3: Verify the tables and the realtime publication**

In the same SQL Editor, run:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
and table_name in ('conversations', 'conversation_participants', 'messages')
order by table_name;
```

Expected: all 3 table names listed.

Then run:

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'messages';
```

Expected: one row, `messages`. If this returns no rows, Realtime will silently never deliver events for this table — do not proceed to later tasks until this returns a row.

- [ ] **Step 4: Verify the two-step participant insert live**

In the SQL Editor, run (this simulates `useCreateConversation`'s two-step insert as a sanity check that the RLS policy shape works before any app code depends on it — replace the two UUIDs with any two real `profiles.id` values from your project, and run this as a superuser/service-role connection since the SQL Editor doesn't carry an `auth.uid()` JWT context the same way the app does; the goal here is just confirming the statements execute without a syntax/logic error, not exercising RLS itself, which the app's own tests and live manual testing in Task 12 will cover):

```sql
select id, username from public.profiles limit 2;
```

Note two ids from the result, then confirm the migration's tables accept the shape of insert `useCreateConversation` will perform (a `conversations` row, then one `conversation_participants` row, then a second insert for the remaining rows) — this is a read-only sanity check of the schema shape, not a full RLS exercise (that happens with real auth in Task 12).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0010_create_messaging_schema.sql
git commit -m "feat: add messaging schema migration (conversations, participants, messages)"
```

---

### Task 2: message-media Storage bucket

**Files:** None (Supabase dashboard configuration only — no files change).

**Interfaces:**
- Consumes: `public.conversation_participants` (Task 1) — the upload policy's `EXISTS` check requires this table to already exist.
- Produces: a `message-media` Storage bucket, public read, authenticated write restricted to participants of the conversation encoded in the upload path. Relied on by Task 8 (`useSendMessage`).

- [ ] **Step 1: Create the bucket (manual dashboard step)**

In the Supabase dashboard: Storage → New bucket → name it `message-media` → set it **Public**.

- [ ] **Step 2: Add the upload and read policies (manual dashboard step)**

In the SQL Editor, run:

```sql
create policy "Participants can upload media to their conversations"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-media'
    and exists (
      select 1 from public.conversation_participants
      where conversation_participants.conversation_id = ((storage.foldername(name))[1])::uuid
      and conversation_participants.user_id = auth.uid()
    )
  );

create policy "Anyone can read message media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'message-media');
```

This restricts uploads to paths starting with the conversation id (e.g. `message-media/<conversation-id>/<message-id>.<ext>`), matching the path convention `useSendMessage` (Task 8) will use. Per this plan's Global Constraints, read access is intentionally public (matching `post-media`'s existing model), not participant-restricted.

- [ ] **Step 3: Verify**

In the SQL Editor, run:

```sql
select policyname from pg_policies where tablename = 'objects' and policyname like '%message media%';
```

Expected: both policy names listed.

- [ ] **Step 4: No commit needed**

This task has no file changes — it's a Supabase-dashboard-only configuration step. Note its completion in the progress ledger as usual, but skip the git commit.

---

### Task 3: Conversation/Message types and display-name helper

**Files:**
- Create: `src/types/conversation.ts`
- Create: `src/lib/conversationDisplay.ts`
- Test: `src/lib/conversationDisplay.test.ts`

**Interfaces:**
- Produces: `ConversationParticipantProfile`, `ConversationSummary`, `ConversationDetail`, `Message` types; `getConversationDisplayName(conversation)`. Relied on by every later task in this plan.

- [ ] **Step 1: Write the types**

Create `src/types/conversation.ts`:

```ts
export interface ConversationParticipantProfile {
  user_id: string;
  username: string;
  display_name: string;
}

export interface ConversationSummary {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  participants: ConversationParticipantProfile[];
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  lastReadAt: string;
}

export interface ConversationDetail {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  participants: ConversationParticipantProfile[];
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  media_url: string | null;
  created_at: string;
}
```

`ConversationSummary.participants` and `ConversationDetail.participants` both exclude the current user — every consumer of these types (list rows, thread headers, sender-name lookups) only ever needs "the other people," never the viewer themself.

- [ ] **Step 2: Write the failing test for the display-name helper**

Create `src/lib/conversationDisplay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getConversationDisplayName } from './conversationDisplay';

describe('getConversationDisplayName', () => {
  it("returns the group's name when one is set", () => {
    const name = getConversationDisplayName({
      is_group: true,
      name: 'Weekend Hikers',
      participants: [{ user_id: 'u1', username: 'a', display_name: 'Alice' }],
    });
    expect(name).toBe('Weekend Hikers');
  });

  it('returns the other participant for a 1:1 conversation', () => {
    const name = getConversationDisplayName({
      is_group: false,
      name: null,
      participants: [{ user_id: 'u1', username: 'bob', display_name: 'Bob' }],
    });
    expect(name).toBe('Bob');
  });

  it('joins up to three participant names for an unnamed group', () => {
    const name = getConversationDisplayName({
      is_group: true,
      name: null,
      participants: [
        { user_id: 'u1', username: 'a', display_name: 'Alice' },
        { user_id: 'u2', username: 'b', display_name: 'Bob' },
        { user_id: 'u3', username: 'c', display_name: 'Cara' },
      ],
    });
    expect(name).toBe('Alice, Bob, Cara');
  });

  it('truncates with "+N more" past three participants', () => {
    const name = getConversationDisplayName({
      is_group: true,
      name: null,
      participants: [
        { user_id: 'u1', username: 'a', display_name: 'Alice' },
        { user_id: 'u2', username: 'b', display_name: 'Bob' },
        { user_id: 'u3', username: 'c', display_name: 'Cara' },
        { user_id: 'u4', username: 'd', display_name: 'Dale' },
        { user_id: 'u5', username: 'e', display_name: 'Eve' },
      ],
    });
    expect(name).toBe('Alice, Bob, Cara +2 more');
  });

  it('falls back to "Conversation" when there are no other participants', () => {
    const name = getConversationDisplayName({ is_group: false, name: null, participants: [] });
    expect(name).toBe('Conversation');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- src/lib/conversationDisplay.test.ts`
Expected: FAIL — `src/lib/conversationDisplay.ts` doesn't exist yet.

- [ ] **Step 4: Implement the helper**

Create `src/lib/conversationDisplay.ts`:

```ts
interface DisplayableConversation {
  is_group: boolean;
  name: string | null;
  participants: { display_name: string }[];
}

export function getConversationDisplayName(conversation: DisplayableConversation): string {
  if (conversation.is_group && conversation.name) return conversation.name;

  const names = conversation.participants.map((participant) => participant.display_name);
  if (names.length === 0) return 'Conversation';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/conversationDisplay.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/conversation.ts src/lib/conversationDisplay.ts src/lib/conversationDisplay.test.ts
git commit -m "feat: add conversation/message types and display-name helper"
```

---

### Task 4: useConversations and useConversation hooks

**Files:**
- Create: `src/hooks/useConversations.ts`
- Test: `src/hooks/useConversations.test.tsx`

**Interfaces:**
- Consumes: `ConversationSummary`, `ConversationDetail`, `ConversationParticipantProfile` types (Task 3).
- Produces: `useConversations(userId): UseQueryResult<ConversationSummary[]>` (the conversation list, sorted most-recent-first, with a live Realtime subscription that invalidates itself on any new message) and `useConversation(conversationId, currentUserId): UseQueryResult<ConversationDetail | null>` (a single conversation's metadata + other participants, no Realtime subscription of its own — it changes rarely enough that `useMessages`' subscription driving a manual invalidate isn't needed). Relied on by Task 10 (`MessagesPage`) and Task 12 (`ConversationPage`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useConversations.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useConversations, useConversation } from './useConversations';

const mockParticipantsSelect = vi.fn();
const mockConversationsSelect = vi.fn();
const mockMessagesSelect = vi.fn();
const mockOn = vi.fn(() => ({ subscribe: vi.fn() }));
const mockChannel = vi.fn(() => ({ on: mockOn }));
const mockRemoveChannel = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'conversation_participants') return { select: mockParticipantsSelect };
      if (table === 'conversations') return { select: mockConversationsSelect };
      if (table === 'messages') return { select: mockMessagesSelect };
      throw new Error(`Unexpected table: ${table}`);
    },
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnValue({ subscribe: vi.fn() });
    mockChannel.mockReturnValue({ on: mockOn });

    mockParticipantsSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [{ conversation_id: 'conv-1', last_read_at: '2026-01-01T00:00:00Z' }],
        error: null,
      }),
    });
    mockConversationsSelect.mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'conv-1',
            is_group: false,
            name: null,
            created_at: '2026-01-01T00:00:00Z',
            conversation_participants: [
              { user_id: 'user-1', last_read_at: '2026-01-01T00:00:00Z', profiles: { username: 'me', display_name: 'Me' } },
              { user_id: 'user-2', last_read_at: '2026-01-01T00:00:00Z', profiles: { username: 'bob', display_name: 'Bob' } },
            ],
          },
        ],
        error: null,
      }),
    });
    mockMessagesSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              sender_id: 'user-2',
              body: 'Hey there',
              media_url: null,
              created_at: '2026-01-02T00:00:00Z',
            },
          ],
          error: null,
        }),
      }),
    });
  });

  it('summarizes a conversation with its other participant, last message, and unread count', async () => {
    const { result } = renderHook(() => useConversations('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    const summary = result.current.data![0];
    expect(summary.participants).toEqual([{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }]);
    expect(summary.lastMessagePreview).toBe('Hey there');
    expect(summary.unreadCount).toBe(1);
  });

  it('does not count the viewer\'s own messages as unread', async () => {
    mockMessagesSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              sender_id: 'user-1',
              body: 'My own message',
              media_url: null,
              created_at: '2026-01-02T00:00:00Z',
            },
          ],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useConversations('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].unreadCount).toBe(0);
  });

  it('subscribes to message inserts and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useConversations('user-1'), { wrapper });

    expect(mockChannel).toHaveBeenCalledWith('conversations:user-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', schema: 'public', table: 'messages' }),
      expect.any(Function)
    );

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('returns an empty array when there is no user', async () => {
    const { result } = renderHook(() => useConversations(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationsSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'conv-1',
            is_group: false,
            name: null,
            created_at: '2026-01-01T00:00:00Z',
            conversation_participants: [
              { user_id: 'user-1', profiles: { username: 'me', display_name: 'Me' } },
              { user_id: 'user-2', profiles: { username: 'bob', display_name: 'Bob' } },
            ],
          },
          error: null,
        }),
      }),
    });
  });

  it("returns the conversation's metadata and other participants, excluding the viewer", async () => {
    const { result } = renderHook(() => useConversation('conv-1', 'user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      id: 'conv-1',
      is_group: false,
      name: null,
      created_at: '2026-01-01T00:00:00Z',
      participants: [{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }],
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/hooks/useConversations.test.tsx`
Expected: FAIL — `src/hooks/useConversations.ts` doesn't exist yet.

- [ ] **Step 3: Implement the hooks**

Create `src/hooks/useConversations.ts`:

```ts
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ConversationDetail, ConversationSummary } from '../types/conversation';

interface RawParticipantEmbed {
  user_id: string;
  last_read_at: string;
  profiles: { username: string; display_name: string } | null;
}

interface RawConversationRow {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  conversation_participants: RawParticipantEmbed[];
}

interface RawMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  media_url: string | null;
  created_at: string;
}

export function useConversations(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`conversations:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery({
    queryKey: ['conversations', userId],
    queryFn: async (): Promise<ConversationSummary[]> => {
      if (!userId) return [];

      const { data: participantRows, error: participantError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId);
      if (participantError) throw participantError;
      if (!participantRows || participantRows.length === 0) return [];

      const conversationIds = participantRows.map((row) => row.conversation_id);
      const lastReadByConversation = new Map(
        participantRows.map((row) => [row.conversation_id, row.last_read_at])
      );

      const { data: conversations, error: conversationsError } = await supabase
        .from('conversations')
        .select(
          'id, is_group, name, created_at, ' +
            'conversation_participants(user_id, last_read_at, profiles!conversation_participants_user_id_fkey(username, display_name))'
        )
        .in('id', conversationIds);
      if (conversationsError) throw conversationsError;

      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, media_url, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true });
      if (messagesError) throw messagesError;

      const messagesByConversation = new Map<string, RawMessageRow[]>();
      for (const message of (messages ?? []) as RawMessageRow[]) {
        const existing = messagesByConversation.get(message.conversation_id) ?? [];
        existing.push(message);
        messagesByConversation.set(message.conversation_id, existing);
      }

      return ((conversations ?? []) as unknown as RawConversationRow[])
        .map((conversation) => {
          const lastReadAt = lastReadByConversation.get(conversation.id) ?? conversation.created_at;
          const conversationMessages = messagesByConversation.get(conversation.id) ?? [];
          const lastMessage = conversationMessages[conversationMessages.length - 1] ?? null;
          const unreadCount = conversationMessages.filter(
            (message) => message.sender_id !== userId && message.created_at > lastReadAt
          ).length;

          return {
            id: conversation.id,
            is_group: conversation.is_group,
            name: conversation.name,
            created_at: conversation.created_at,
            participants: conversation.conversation_participants
              .filter((participant) => participant.user_id !== userId && participant.profiles)
              .map((participant) => ({
                user_id: participant.user_id,
                username: participant.profiles!.username,
                display_name: participant.profiles!.display_name,
              })),
            lastMessagePreview: lastMessage ? (lastMessage.body ?? '📷 Photo') : null,
            lastMessageAt: lastMessage?.created_at ?? null,
            unreadCount,
            lastReadAt,
          };
        })
        .sort((a, b) => (b.lastMessageAt ?? b.created_at).localeCompare(a.lastMessageAt ?? a.created_at));
    },
    enabled: !!userId,
  });
}

export function useConversation(conversationId: string | undefined, currentUserId: string | undefined) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async (): Promise<ConversationDetail | null> => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('conversations')
        .select(
          'id, is_group, name, created_at, ' +
            'conversation_participants(user_id, profiles!conversation_participants_user_id_fkey(username, display_name))'
        )
        .eq('id', conversationId)
        .single();
      if (error) throw error;

      const raw = data as unknown as {
        id: string;
        is_group: boolean;
        name: string | null;
        created_at: string;
        conversation_participants: { user_id: string; profiles: { username: string; display_name: string } | null }[];
      };

      return {
        id: raw.id,
        is_group: raw.is_group,
        name: raw.name,
        created_at: raw.created_at,
        participants: raw.conversation_participants
          .filter((participant) => participant.user_id !== currentUserId && participant.profiles)
          .map((participant) => ({
            user_id: participant.user_id,
            username: participant.profiles!.username,
            display_name: participant.profiles!.display_name,
          })),
      };
    },
    enabled: !!conversationId,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/useConversations.test.tsx`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useConversations.ts src/hooks/useConversations.test.tsx
git commit -m "feat: add useConversations and useConversation hooks"
```

---

### Task 5: useMessages hook

**Files:**
- Create: `src/hooks/useMessages.ts`
- Test: `src/hooks/useMessages.test.tsx`

**Interfaces:**
- Consumes: `Message` type (Task 3).
- Produces: `useMessages(conversationId): UseQueryResult<Message[]>` — the full message history for one conversation, oldest first, with a live Realtime subscription that appends newly-inserted messages directly into the query cache (no refetch). Relied on by Task 12 (`ConversationPage`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useMessages.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMessages } from './useMessages';

const mockSelect = vi.fn();
let capturedCallback: ((payload: { new: unknown }) => void) | undefined;
const mockOn = vi.fn((_event: string, _config: unknown, callback: (payload: { new: unknown }) => void) => {
  capturedCallback = callback;
  return { subscribe: vi.fn() };
});
const mockChannel = vi.fn(() => ({ on: mockOn }));
const mockRemoveChannel = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = undefined;
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              sender_id: 'user-2',
              body: 'Hi',
              media_url: null,
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
          error: null,
        }),
      }),
    });
  });

  it('fetches messages for the conversation, oldest first', async () => {
    const { result } = renderHook(() => useMessages('conv-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].body).toBe('Hi');
  });

  it('appends a new message received over realtime, without duplicating an already-known id', async () => {
    const { result } = renderHook(() => useMessages('conv-1'), {
      wrapper: ({ children }: { children: ReactNode }) => {
        const client = new QueryClient();
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);

    const newMessage = {
      id: 'msg-2',
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      body: 'Hello back',
      media_url: null,
      created_at: '2026-01-01T00:01:00Z',
    };

    capturedCallback!({ new: newMessage });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.data![1].body).toBe('Hello back');

    capturedCallback!({ new: newMessage });
    expect(result.current.data).toHaveLength(2);
  });

  it('subscribes filtered to the conversation and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useMessages('conv-1'), { wrapper });

    expect(mockChannel).toHaveBeenCalledWith('messages:conv-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'conversation_id=eq.conv-1',
      }),
      expect.any(Function)
    );

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('returns an empty array when there is no conversation id', async () => {
    const { result } = renderHook(() => useMessages(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/hooks/useMessages.test.tsx`
Expected: FAIL — `src/hooks/useMessages.ts` doesn't exist yet.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useMessages.ts`:

```ts
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Message } from '../types/conversation';

export function useMessages(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
            if (!old) return [newMessage];
            if (old.some((message) => message.id === newMessage.id)) return old;
            return [...old, newMessage];
          });
        }
      );
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async (): Promise<Message[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, media_url, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!conversationId,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/useMessages.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMessages.ts src/hooks/useMessages.test.tsx
git commit -m "feat: add useMessages hook with realtime append"
```

---

### Task 6: useSearchProfiles hook

**Files:**
- Create: `src/hooks/useSearchProfiles.ts`
- Test: `src/hooks/useSearchProfiles.test.tsx`

**Interfaces:**
- Produces: `useSearchProfiles(query, excludeUserId): UseQueryResult<Profile[]>` — a username-fragment search, excluding the current user, capped at 10 results. Relied on by Task 11 (`NewMessageDialog`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useSearchProfiles.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSearchProfiles } from './useSearchProfiles';

const mockLimit = vi.fn();
const mockNeq = vi.fn(() => ({ limit: mockLimit }));
const mockIlike = vi.fn(() => ({ neq: mockNeq }));
const mockSelect = vi.fn(() => ({ ilike: mockIlike }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSearchProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({
      data: [
        { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
      ],
      error: null,
    });
  });

  it('searches by username fragment, excluding the current user, capped at 10', async () => {
    const { result } = renderHook(() => useSearchProfiles('bo', 'user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockIlike).toHaveBeenCalledWith('username', '%bo%');
    expect(mockNeq).toHaveBeenCalledWith('id', 'user-1');
    expect(mockLimit).toHaveBeenCalledWith(10);
    expect(result.current.data).toHaveLength(1);
  });

  it('does not query when the search string is empty or whitespace-only', () => {
    const { result } = renderHook(() => useSearchProfiles('   ', 'user-1'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/hooks/useSearchProfiles.test.tsx`
Expected: FAIL — `src/hooks/useSearchProfiles.ts` doesn't exist yet.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useSearchProfiles.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/profile';

export function useSearchProfiles(query: string, excludeUserId: string) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: ['search-profiles', trimmed],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, city_id, reputation_score, created_at')
        .ilike('username', `%${trimmed}%`)
        .neq('id', excludeUserId)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: trimmed.length > 0,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/useSearchProfiles.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSearchProfiles.ts src/hooks/useSearchProfiles.test.tsx
git commit -m "feat: add useSearchProfiles hook"
```

---

### Task 7: useCreateConversation hook

**Files:**
- Create: `src/hooks/useCreateConversation.ts`
- Test: `src/hooks/useCreateConversation.test.tsx`

**Interfaces:**
- Produces: `useCreateConversation()` — a mutation taking `{ creatorId, participantIds, isGroup, name? }` and returning the conversation id. For a 1:1 (`isGroup: false`), checks for an existing 1:1 between the two users first and reuses it instead of creating a duplicate. Relied on by Task 11 (`NewMessageDialog`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useCreateConversation.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateConversation } from './useCreateConversation';

const mockParticipantsSelect = vi.fn();
const mockConversationsSelect = vi.fn();
const mockConversationsInsert = vi.fn();
const mockParticipantsInsert = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'conversation_participants') {
        return { select: mockParticipantsSelect, insert: mockParticipantsInsert };
      }
      if (table === 'conversations') {
        return { select: mockConversationsSelect, insert: mockConversationsInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCreateConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationsInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-conv' }, error: null }),
      }),
    });
    mockParticipantsInsert.mockResolvedValue({ error: null });
  });

  it('creates a new 1:1 conversation with a two-step participant insert when none exists yet', async () => {
    mockParticipantsSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const { result } = renderHook(() => useCreateConversation(), { wrapper });
    let conversationId: string | undefined;
    await waitFor(async () => {
      conversationId = await result.current.mutateAsync({
        creatorId: 'user-1',
        participantIds: ['user-2'],
        isGroup: false,
      });
    });

    expect(conversationId).toBe('new-conv');
    expect(mockConversationsInsert).toHaveBeenCalledWith({ is_group: false, name: null });
    expect(mockParticipantsInsert).toHaveBeenNthCalledWith(1, { conversation_id: 'new-conv', user_id: 'user-1' });
    expect(mockParticipantsInsert).toHaveBeenNthCalledWith(2, [{ conversation_id: 'new-conv', user_id: 'user-2' }]);
  });

  it('reuses an existing 1:1 conversation instead of creating a duplicate', async () => {
    mockParticipantsSelect.mockImplementation(() => ({
      eq: vi.fn((column: string, value: string) => {
        if (value === 'user-1') return Promise.resolve({ data: [{ conversation_id: 'conv-existing' }], error: null });
        return Promise.resolve({ data: [{ conversation_id: 'conv-existing' }], error: null });
      }),
    }));
    mockConversationsSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [{ id: 'conv-existing' }], error: null }),
      }),
    });

    const { result } = renderHook(() => useCreateConversation(), { wrapper });
    let conversationId: string | undefined;
    await waitFor(async () => {
      conversationId = await result.current.mutateAsync({
        creatorId: 'user-1',
        participantIds: ['user-2'],
        isGroup: false,
      });
    });

    expect(conversationId).toBe('conv-existing');
    expect(mockConversationsInsert).not.toHaveBeenCalled();
  });

  it('creates a group conversation with a name and all participants', async () => {
    const { result } = renderHook(() => useCreateConversation(), { wrapper });
    let conversationId: string | undefined;
    await waitFor(async () => {
      conversationId = await result.current.mutateAsync({
        creatorId: 'user-1',
        participantIds: ['user-2', 'user-3'],
        isGroup: true,
        name: 'Weekend Hikers',
      });
    });

    expect(conversationId).toBe('new-conv');
    expect(mockConversationsInsert).toHaveBeenCalledWith({ is_group: true, name: 'Weekend Hikers' });
    expect(mockParticipantsInsert).toHaveBeenNthCalledWith(2, [
      { conversation_id: 'new-conv', user_id: 'user-2' },
      { conversation_id: 'new-conv', user_id: 'user-3' },
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/hooks/useCreateConversation.test.tsx`
Expected: FAIL — `src/hooks/useCreateConversation.ts` doesn't exist yet.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useCreateConversation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface CreateConversationInput {
  creatorId: string;
  participantIds: string[];
  isGroup: boolean;
  name?: string | null;
}

async function findExisting1on1(userId: string, otherUserId: string): Promise<string | null> {
  const { data: mine, error: mineError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId);
  if (mineError) throw mineError;

  const { data: theirs, error: theirsError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', otherUserId);
  if (theirsError) throw theirsError;

  const mineIds = new Set((mine ?? []).map((row) => row.conversation_id));
  const sharedIds = (theirs ?? []).map((row) => row.conversation_id).filter((id) => mineIds.has(id));
  if (sharedIds.length === 0) return null;

  const { data: conversations, error: conversationsError } = await supabase
    .from('conversations')
    .select('id')
    .in('id', sharedIds)
    .eq('is_group', false);
  if (conversationsError) throw conversationsError;

  return conversations?.[0]?.id ?? null;
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateConversationInput): Promise<string> => {
      if (!input.isGroup) {
        const existingId = await findExisting1on1(input.creatorId, input.participantIds[0]);
        if (existingId) return existingId;
      }

      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .insert({ is_group: input.isGroup, name: input.isGroup ? (input.name ?? null) : null })
        .select('id')
        .single();
      if (conversationError) throw conversationError;

      // Two sequential inserts, not one batched insert — see this plan's Global
      // Constraints: the conversation_participants INSERT policy's fellow-participant
      // check can't see other not-yet-committed rows from the same statement.
      const { error: selfError } = await supabase
        .from('conversation_participants')
        .insert({ conversation_id: conversation.id, user_id: input.creatorId });
      if (selfError) throw selfError;

      const { error: othersError } = await supabase.from('conversation_participants').insert(
        input.participantIds.map((userId) => ({
          conversation_id: conversation.id,
          user_id: userId,
        }))
      );
      if (othersError) throw othersError;

      return conversation.id;
    },
    onSuccess: (_conversationId, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', variables.creatorId] });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/useCreateConversation.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCreateConversation.ts src/hooks/useCreateConversation.test.tsx
git commit -m "feat: add useCreateConversation hook with 1:1 dedup"
```

---

### Task 8: useSendMessage and useMarkAsRead hooks

**Files:**
- Create: `src/hooks/useMessageActions.ts`
- Test: `src/hooks/useMessageActions.test.tsx`

**Interfaces:**
- Produces: `useSendMessage()` — a mutation taking `{ conversationId, senderId, body, mediaFile? }` that uploads any attached photo to `message-media` first (client-generating the message id via `crypto.randomUUID()` so the Storage path and the row's `id` agree, and so the single `messages` insert already satisfies the `body is not null or media_url is not null` check constraint — matching the pattern `offlineQueue.ts`'s `queueDraftPost` already uses for client-generated ids), then inserts the message row. `useMarkAsRead()` — a mutation taking `{ conversationId, userId }` that bumps that participant row's `last_read_at` to now. Relied on by Task 12 (`ConversationPage`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useMessageActions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSendMessage, useMarkAsRead } from './useMessageActions';

const mockMessagesInsert = vi.fn();
const mockParticipantsUpdate = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'messages') return { insert: mockMessagesInsert };
      if (table === 'conversation_participants') return { update: mockParticipantsUpdate };
      throw new Error(`Unexpected table: ${table}`);
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

describe('useSendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessagesInsert.mockResolvedValue({ error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/message-media/conv-1/msg.jpg' } });
  });

  it('sends a text-only message', async () => {
    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await waitFor(() =>
      result.current.mutateAsync({ conversationId: 'conv-1', senderId: 'user-1', body: 'Hi there' })
    );

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockMessagesInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-1',
        sender_id: 'user-1',
        body: 'Hi there',
        media_url: null,
      })
    );
  });

  it('uploads a photo before inserting, using the same generated id for the storage path', async () => {
    const file = new File(['fake-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await waitFor(() =>
      result.current.mutateAsync({ conversationId: 'conv-1', senderId: 'user-1', body: null, mediaFile: file })
    );

    expect(mockUpload).toHaveBeenCalled();
    const [uploadPath] = mockUpload.mock.calls[0];
    expect(uploadPath).toMatch(/^conv-1\/.+\.jpeg$/);

    const insertedRow = mockMessagesInsert.mock.calls[0][0];
    expect(insertedRow.media_url).toBe('https://example.com/message-media/conv-1/msg.jpg');
    expect(uploadPath).toContain(insertedRow.id);
  });
});

describe('useMarkAsRead', () => {
  it("bumps the participant's last_read_at to now", async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null });
    const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
    mockParticipantsUpdate.mockReturnValue({ eq: mockEq1 });

    const { result } = renderHook(() => useMarkAsRead(), { wrapper });
    await waitFor(() => result.current.mutateAsync({ conversationId: 'conv-1', userId: 'user-1' }));

    expect(mockParticipantsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ last_read_at: expect.any(String) })
    );
    expect(mockEq1).toHaveBeenCalledWith('conversation_id', 'conv-1');
    expect(mockEq2).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/hooks/useMessageActions.test.tsx`
Expected: FAIL — `src/hooks/useMessageActions.ts` doesn't exist yet.

- [ ] **Step 3: Implement the hooks**

Create `src/hooks/useMessageActions.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface SendMessageInput {
  conversationId: string;
  senderId: string;
  body: string | null;
  mediaFile?: File;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      const messageId = crypto.randomUUID();
      let mediaUrl: string | null = null;

      if (input.mediaFile) {
        const extension = input.mediaFile.type.split('/')[1] || 'jpg';
        const path = `${input.conversationId}/${messageId}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('message-media')
          .upload(path, input.mediaFile);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('message-media').getPublicUrl(path);
        mediaUrl = publicUrlData.publicUrl;
      }

      const { error: insertError } = await supabase.from('messages').insert({
        id: messageId,
        conversation_id: input.conversationId,
        sender_id: input.senderId,
        body: input.body,
        media_url: mediaUrl,
      });
      if (insertError) throw insertError;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations', variables.senderId] });
    },
  });
}

interface MarkAsReadInput {
  conversationId: string;
  userId: string;
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MarkAsReadInput) => {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', input.conversationId)
        .eq('user_id', input.userId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', variables.userId] });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/useMessageActions.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useMessageActions.ts src/hooks/useMessageActions.test.tsx
git commit -m "feat: add useSendMessage and useMarkAsRead hooks"
```

---

### Task 9: useUnreadCount hook

**Files:**
- Create: `src/hooks/useUnreadCount.ts`
- Test: `src/hooks/useUnreadCount.test.tsx`

**Interfaces:**
- Produces: `useUnreadCount(userId): UseQueryResult<number>` — the total unread message count across all of a user's conversations, with its own Realtime subscription. This is deliberately a separate, lighter-weight query from `useConversations` (Task 4) rather than deriving the total from it, since `AppShell` (Task 13) calls this on every authenticated route, not just `/messages` — it fetches only `id`-level columns, no participant/profile embedding. Relied on by Task 13 (`AppShell`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useUnreadCount.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUnreadCount } from './useUnreadCount';

const mockParticipantsSelect = vi.fn();
const mockMessagesSelect = vi.fn();
const mockOn = vi.fn(() => ({ subscribe: vi.fn() }));
const mockChannel = vi.fn(() => ({ on: mockOn }));
const mockRemoveChannel = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'conversation_participants') return { select: mockParticipantsSelect };
      if (table === 'messages') return { select: mockMessagesSelect };
      throw new Error(`Unexpected table: ${table}`);
    },
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useUnreadCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnValue({ subscribe: vi.fn() });
    mockChannel.mockReturnValue({ on: mockOn });
  });

  it('sums messages newer than each conversation\'s last_read_at, excluding the viewer\'s own', async () => {
    mockParticipantsSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          { conversation_id: 'conv-1', last_read_at: '2026-01-01T00:00:00Z' },
          { conversation_id: 'conv-2', last_read_at: '2026-01-05T00:00:00Z' },
        ],
        error: null,
      }),
    });
    mockMessagesSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        neq: vi.fn().mockResolvedValue({
          data: [
            { conversation_id: 'conv-1', sender_id: 'user-2', created_at: '2026-01-02T00:00:00Z' },
            { conversation_id: 'conv-1', sender_id: 'user-2', created_at: '2026-01-03T00:00:00Z' },
            { conversation_id: 'conv-2', sender_id: 'user-2', created_at: '2026-01-01T00:00:00Z' },
          ],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useUnreadCount('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(2);
  });

  it('returns 0 when there is no user', async () => {
    const { result } = renderHook(() => useUnreadCount(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/hooks/useUnreadCount.test.tsx`
Expected: FAIL — `src/hooks/useUnreadCount.ts` doesn't exist yet.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useUnreadCount.ts`:

```ts
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useUnreadCount(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`unread-count:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['unread-count', userId] });
      });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery({
    queryKey: ['unread-count', userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;

      const { data: participantRows, error: participantError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId);
      if (participantError) throw participantError;
      if (!participantRows || participantRows.length === 0) return 0;

      const conversationIds = participantRows.map((row) => row.conversation_id);
      const lastReadByConversation = new Map(
        participantRows.map((row) => [row.conversation_id, row.last_read_at])
      );

      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('conversation_id, sender_id, created_at')
        .in('conversation_id', conversationIds)
        .neq('sender_id', userId);
      if (messagesError) throw messagesError;

      return (messages ?? []).filter((message) => {
        const lastReadAt = lastReadByConversation.get(message.conversation_id);
        return lastReadAt ? message.created_at > lastReadAt : true;
      }).length;
    },
    enabled: !!userId,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/useUnreadCount.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useUnreadCount.ts src/hooks/useUnreadCount.test.tsx
git commit -m "feat: add useUnreadCount hook"
```

---

### Task 10: MessagesPage (conversation list)

**Files:**
- Modify: `src/routes/MessagesPage.tsx` (replaces the `ComingSoon` placeholder)
- Test: `src/routes/MessagesPage.test.tsx` (new)

**Interfaces:**
- Consumes: `useConversations` (Task 4), `getConversationDisplayName` (Task 3), `NewMessageDialog` (Task 11 — mocked in this task's test, since it's a distinct component with its own dedicated test).
- Produces: the real `/messages` page — a conversation list with unread badges and a "New message" button. Relied on by Task 12 (route wiring alongside `ConversationPage`).

- [ ] **Step 1: Write the failing test**

Create `src/routes/MessagesPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MessagesPage } from './MessagesPage';
import { useConversations } from '../hooks/useConversations';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useConversations');
vi.mock('../components/messages/NewMessageDialog', () => ({
  NewMessageDialog: ({ open }: { open: boolean }) => (open ? <div>New message dialog open</div> : null),
}));

const mockUseConversations = vi.mocked(useConversations);

function renderPage() {
  render(
    <MemoryRouter>
      <MessagesPage />
    </MemoryRouter>
  );
}

describe('MessagesPage', () => {
  it('shows an empty state when there are no conversations', () => {
    mockUseConversations.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText('No conversations yet — start one!')).toBeInTheDocument();
  });

  it('lists conversations with their display name, preview, and unread badge', () => {
    mockUseConversations.mockReturnValue({
      data: [
        {
          id: 'conv-1',
          is_group: false,
          name: null,
          created_at: '2026-01-01T00:00:00Z',
          participants: [{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }],
          lastMessagePreview: 'Hey there',
          lastMessageAt: '2026-01-02T00:00:00Z',
          unreadCount: 3,
          lastReadAt: '2026-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
    } as any);
    renderPage();

    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Hey there')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bob/ })).toHaveAttribute('href', '/messages/conv-1');
  });

  it('does not show a badge for a conversation with no unread messages', () => {
    mockUseConversations.mockReturnValue({
      data: [
        {
          id: 'conv-1',
          is_group: false,
          name: null,
          created_at: '2026-01-01T00:00:00Z',
          participants: [{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }],
          lastMessagePreview: null,
          lastMessageAt: null,
          unreadCount: 0,
          lastReadAt: '2026-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
    } as any);
    renderPage();

    expect(screen.getByText('No messages yet')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('opens the new-message dialog when the button is clicked', async () => {
    mockUseConversations.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();

    expect(screen.queryByText('New message dialog open')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New message' }));
    expect(screen.getByText('New message dialog open')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/MessagesPage.test.tsx`
Expected: FAIL — the current `MessagesPage` only renders `ComingSoon`.

- [ ] **Step 3: Implement the page**

Replace `src/routes/MessagesPage.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { getConversationDisplayName } from '../lib/conversationDisplay';
import { NewMessageDialog } from '../components/messages/NewMessageDialog';
import { Button } from '@/components/ui/button';

export function MessagesPage() {
  const { session } = useAuth();
  const { data: conversations, isLoading } = useConversations(session?.user.id);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto max-w-xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Messages</h1>
        <Button onClick={() => setDialogOpen(true)}>New message</Button>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading conversations…</p>}
      {!isLoading && conversations?.length === 0 && (
        <p className="text-muted-foreground">No conversations yet — start one!</p>
      )}
      <div className="flex flex-col gap-2">
        {conversations?.map((conversation) => (
          <Link
            key={conversation.id}
            to={`/messages/${conversation.id}`}
            className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent"
          >
            <div className="flex flex-col">
              <span className="font-medium">{getConversationDisplayName(conversation)}</span>
              <span className="truncate text-sm text-muted-foreground">
                {conversation.lastMessagePreview ?? 'No messages yet'}
              </span>
            </div>
            {conversation.unreadCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {conversation.unreadCount}
              </span>
            )}
          </Link>
        ))}
      </div>
      <NewMessageDialog open={dialogOpen} onOpenChange={setDialogOpen} currentUserId={session?.user.id} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

This will still fail until Task 11 creates `src/components/messages/NewMessageDialog.tsx` for real (the test mocks it, but `MessagesPage.tsx` imports the real module path, which must exist to resolve even though its export is replaced by the mock). Create a minimal placeholder now so this task is self-contained and independently testable — Task 11 will replace it with the full implementation:

Create `src/components/messages/NewMessageDialog.tsx`:

```tsx
export function NewMessageDialog(_props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | undefined;
}) {
  return null;
}
```

Run: `npm test -- src/routes/MessagesPage.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/routes/MessagesPage.tsx src/routes/MessagesPage.test.tsx src/components/messages/NewMessageDialog.tsx
git commit -m "feat: replace MessagesPage placeholder with a real conversation list"
```

---

### Task 11: NewMessageDialog component

**Files:**
- Modify: `src/components/messages/NewMessageDialog.tsx` (replaces Task 10's placeholder)
- Test: `src/components/messages/NewMessageDialog.test.tsx` (new)

**Interfaces:**
- Consumes: `useSearchProfiles` (Task 6), `useCreateConversation` (Task 7).
- Produces: the real new-message compose flow — username search, single-select (1:1) or multi-select (group, with an optional name field once 2+ people are selected), navigating to the new/existing conversation on success.

- [ ] **Step 1: Write the failing test**

Create `src/components/messages/NewMessageDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NewMessageDialog } from './NewMessageDialog';
import { useSearchProfiles } from '../../hooks/useSearchProfiles';
import { useCreateConversation } from '../../hooks/useCreateConversation';

vi.mock('../../hooks/useSearchProfiles');
vi.mock('../../hooks/useCreateConversation');

const mockUseSearchProfiles = vi.mocked(useSearchProfiles);
const mockUseCreateConversation = vi.mocked(useCreateConversation);
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <MemoryRouter>
      <NewMessageDialog open onOpenChange={onOpenChange} currentUserId="user-1" />
    </MemoryRouter>
  );
}

describe('NewMessageDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchProfiles.mockReturnValue({ data: [], isLoading: false } as any);
  });

  it('shows search results and starts a 1:1 conversation on single selection', async () => {
    mockUseSearchProfiles.mockReturnValue({
      data: [{ id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' }],
      isLoading: false,
    } as any);
    const mutateAsync = vi.fn().mockResolvedValue('conv-1');
    mockUseCreateConversation.mockReturnValue({ mutateAsync, isPending: false } as any);
    const onOpenChange = vi.fn();

    renderDialog(onOpenChange);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search by username'), 'bo');
    await user.click(screen.getByText(/Bob/));
    await user.click(screen.getByRole('button', { name: 'Start conversation' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        creatorId: 'user-1',
        participantIds: ['user-2'],
        isGroup: false,
        name: null,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith('/messages/conv-1');
  });

  it('shows an optional group name field once two or more people are selected', async () => {
    mockUseSearchProfiles.mockReturnValue({
      data: [
        { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
        { id: 'user-3', username: 'cara', display_name: 'Cara', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
      ],
      isLoading: false,
    } as any);
    mockUseCreateConversation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);

    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search by username'), 'a');
    expect(screen.queryByPlaceholderText('Group name (optional)')).not.toBeInTheDocument();

    await user.click(screen.getByText(/Bob/));
    await user.click(screen.getByText(/Cara/));

    expect(screen.getByPlaceholderText('Group name (optional)')).toBeInTheDocument();
  });

  it('creates a group with the entered name and all selected participants', async () => {
    mockUseSearchProfiles.mockReturnValue({
      data: [
        { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
        { id: 'user-3', username: 'cara', display_name: 'Cara', avatar_url: null, city_id: 'city-1', reputation_score: 0, created_at: '2026-01-01' },
      ],
      isLoading: false,
    } as any);
    const mutateAsync = vi.fn().mockResolvedValue('conv-group');
    mockUseCreateConversation.mockReturnValue({ mutateAsync, isPending: false } as any);

    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search by username'), 'a');
    await user.click(screen.getByText(/Bob/));
    await user.click(screen.getByText(/Cara/));
    await user.type(screen.getByPlaceholderText('Group name (optional)'), 'Weekend Hikers');
    await user.click(screen.getByRole('button', { name: 'Start conversation' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        creatorId: 'user-1',
        participantIds: ['user-2', 'user-3'],
        isGroup: true,
        name: 'Weekend Hikers',
      })
    );
  });

  it('disables the start button until at least one person is selected', () => {
    mockUseCreateConversation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    renderDialog();
    expect(screen.getByRole('button', { name: 'Start conversation' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/messages/NewMessageDialog.test.tsx`
Expected: FAIL — the current `NewMessageDialog` is the Task 10 placeholder that always renders `null`.

- [ ] **Step 3: Implement the component**

Replace `src/components/messages/NewMessageDialog.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchProfiles } from '../../hooks/useSearchProfiles';
import { useCreateConversation } from '../../hooks/useCreateConversation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface NewMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | undefined;
}

export function NewMessageDialog({ open, onOpenChange, currentUserId }: NewMessageDialogProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedNames, setSelectedNames] = useState<Record<string, string>>({});
  const [groupName, setGroupName] = useState('');
  const { data: results } = useSearchProfiles(query, currentUserId ?? '');
  const createConversation = useCreateConversation();

  function toggleSelected(userId: string, displayName: string) {
    setSelectedIds((ids) => (ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]));
    setSelectedNames((names) => ({ ...names, [userId]: displayName }));
  }

  async function handleStart() {
    if (!currentUserId || selectedIds.length === 0) return;

    const conversationId = await createConversation.mutateAsync({
      creatorId: currentUserId,
      participantIds: selectedIds,
      isGroup: selectedIds.length > 1,
      name: selectedIds.length > 1 ? groupName.trim() || null : null,
    });

    setQuery('');
    setSelectedIds([]);
    setSelectedNames({});
    setGroupName('');
    onOpenChange(false);
    navigate(`/messages/${conversationId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search by username"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex flex-col gap-1">
          {results?.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => toggleSelected(profile.id, profile.display_name)}
              className={`flex items-center justify-between rounded-md p-2 text-left text-sm ${
                selectedIds.includes(profile.id) ? 'bg-accent' : ''
              }`}
            >
              <span>
                {profile.display_name} (@{profile.username})
              </span>
              {selectedIds.includes(profile.id) && <span>✓</span>}
            </button>
          ))}
        </div>
        {selectedIds.length > 1 && (
          <Input
            placeholder="Group name (optional)"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
          />
        )}
        <DialogFooter>
          <Button onClick={handleStart} disabled={selectedIds.length === 0 || createConversation.isPending}>
            {createConversation.isPending ? 'Starting…' : 'Start conversation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/messages/NewMessageDialog.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/messages/NewMessageDialog.tsx src/components/messages/NewMessageDialog.test.tsx
git commit -m "feat: implement NewMessageDialog with username search and group creation"
```

---

### Task 12: ConversationPage (thread view) and route wiring

**Files:**
- Create: `src/routes/ConversationPage.tsx`
- Test: `src/routes/ConversationPage.test.tsx`
- Modify: `src/routes/routes.tsx`

**Interfaces:**
- Consumes: `useMessages` (Task 5), `useConversation` (Task 4), `useSendMessage`/`useMarkAsRead` (Task 8), `getConversationDisplayName` (Task 3).
- Produces: the real `/messages/:conversationId` thread page — message history, a composer (text + optional photo), marks the conversation read on open. Wired into `routes.tsx` alongside the existing `/messages` route.

- [ ] **Step 1: Write the failing test**

Create `src/routes/ConversationPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConversationPage } from './ConversationPage';
import { useMessages } from '../hooks/useMessages';
import { useConversation } from '../hooks/useConversations';
import { useSendMessage, useMarkAsRead } from '../hooks/useMessageActions';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useMessages');
vi.mock('../hooks/useConversations');
vi.mock('../hooks/useMessageActions');

const mockUseMessages = vi.mocked(useMessages);
const mockUseConversation = vi.mocked(useConversation);
const mockUseSendMessage = vi.mocked(useSendMessage);
const mockUseMarkAsRead = vi.mocked(useMarkAsRead);

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/messages/:conversationId" element={<ConversationPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ConversationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConversation.mockReturnValue({
      data: {
        id: 'conv-1',
        is_group: false,
        name: null,
        created_at: '2026-01-01T00:00:00Z',
        participants: [{ user_id: 'user-2', username: 'bob', display_name: 'Bob' }],
      },
      isLoading: false,
    } as any);
    mockUseMessages.mockReturnValue({ data: [], isLoading: false } as any);
    mockUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    mockUseMarkAsRead.mockReturnValue({ mutate: vi.fn() } as any);
  });

  it('shows the conversation display name as the header', async () => {
    renderAt('/messages/conv-1');
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
  });

  it("labels messages from other participants with their name, but not the viewer's own", async () => {
    mockUseMessages.mockReturnValue({
      data: [
        { id: 'm1', conversation_id: 'conv-1', sender_id: 'user-2', body: 'Hey', media_url: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'm2', conversation_id: 'conv-1', sender_id: 'user-1', body: 'Hi back', media_url: null, created_at: '2026-01-01T00:01:00Z' },
      ],
      isLoading: false,
    } as any);
    renderAt('/messages/conv-1');

    await waitFor(() => expect(screen.getByText('Hey')).toBeInTheDocument());
    expect(screen.getByText('Bob', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Hi back')).toBeInTheDocument();
  });

  it('marks the conversation as read on mount', async () => {
    const mutate = vi.fn();
    mockUseMarkAsRead.mockReturnValue({ mutate } as any);
    renderAt('/messages/conv-1');
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ conversationId: 'conv-1', userId: 'user-1' }));
  });

  it('sends a text message and clears the input', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockUseSendMessage.mockReturnValue({ mutateAsync, isPending: false } as any);
    renderAt('/messages/conv-1');

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Message…');
    await user.type(input, 'Hello!');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        senderId: 'user-1',
        body: 'Hello!',
        mediaFile: undefined,
      })
    );
    expect(input).toHaveValue('');
  });

  it('does not send an empty message with no text and no photo', async () => {
    const mutateAsync = vi.fn();
    mockUseSendMessage.mockReturnValue({ mutateAsync, isPending: false } as any);
    renderAt('/messages/conv-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/routes/ConversationPage.test.tsx`
Expected: FAIL — `src/routes/ConversationPage.tsx` doesn't exist yet.

- [ ] **Step 3: Implement the page**

Create `src/routes/ConversationPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMessages } from '../hooks/useMessages';
import { useConversation } from '../hooks/useConversations';
import { useSendMessage, useMarkAsRead } from '../hooks/useMessageActions';
import { getConversationDisplayName } from '../lib/conversationDisplay';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { session } = useAuth();
  const { data: conversation } = useConversation(conversationId, session?.user.id);
  const { data: messages, isLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);

  useEffect(() => {
    if (!conversationId || !session?.user.id) return;
    markAsRead.mutate({ conversationId, userId: session.user.id });
  }, [conversationId, session?.user.id]);

  const senderNames = new Map((conversation?.participants ?? []).map((p) => [p.user_id, p.display_name]));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!conversationId || !session?.user.id) return;
    if (!body.trim() && !mediaFile) return;

    await sendMessage.mutateAsync({
      conversationId,
      senderId: session.user.id,
      body: body.trim() || null,
      mediaFile,
    });
    setBody('');
    setMediaFile(undefined);
  }

  if (!conversationId) return null;

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">
        {conversation ? getConversationDisplayName(conversation) : 'Conversation'}
      </h1>
      {isLoading && <p className="text-muted-foreground">Loading messages…</p>}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {messages?.map((message) => (
          <div
            key={message.id}
            className={`max-w-[80%] rounded-lg p-2 ${
              message.sender_id === session?.user.id
                ? 'self-end bg-primary text-primary-foreground'
                : 'self-start bg-muted'
            }`}
          >
            {message.sender_id !== session?.user.id && (
              <p className="text-xs opacity-70">{senderNames.get(message.sender_id) ?? 'Unknown'}</p>
            )}
            {message.body && <p>{message.body}</p>}
            {message.media_url && <img src={message.media_url} alt="" className="mt-1 max-w-full rounded" />}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <Input placeholder="Message…" value={body} onChange={(event) => setBody(event.target.value)} />
        <input
          type="file"
          accept="image/*"
          aria-label="Photo"
          onChange={(event) => setMediaFile(event.target.files?.[0])}
        />
        <Button type="submit" disabled={sendMessage.isPending}>
          Send
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Wire the route**

Modify `src/routes/routes.tsx` — add the import and the route entry:

```ts
import { MessagesPage } from './MessagesPage';
```
becomes:
```ts
import { MessagesPage } from './MessagesPage';
import { ConversationPage } from './ConversationPage';
```

```ts
{ path: '/messages', element: <MessagesPage /> },
```
becomes:
```ts
{ path: '/messages', element: <MessagesPage /> },
{ path: '/messages/:conversationId', element: <ConversationPage /> },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/routes/ConversationPage.test.tsx`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/routes/ConversationPage.tsx src/routes/ConversationPage.test.tsx src/routes/routes.tsx
git commit -m "feat: add ConversationPage thread view and wire its route"
```

---

### Task 13: Unread badge on the Messages nav tab

**Files:**
- Modify: `src/components/nav/AppShell.tsx`
- Modify: `src/components/nav/AppShell.test.tsx`

**Interfaces:**
- Consumes: `useUnreadCount` (Task 9), `useAuth` (existing).
- Produces: a small unread-count badge on the Messages tab, visible on both the desktop sidebar and mobile bottom nav.

This is the task named in this plan's Global Constraints: `AppShell.test.tsx` currently has no `useAuth` mock (the component itself has never called `useAuth` before now), so it must be added alongside the file's existing `useOnlineStatus`/`offlineQueue` mocks.

- [ ] **Step 1: Extend the failing test first**

Replace `src/components/nav/AppShell.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';
import { useUnreadCount } from '../../hooks/useUnreadCount';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => false,
}));

vi.mock('../../lib/offlineQueue', () => ({
  processQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../hooks/useUnreadCount');
const mockUseUnreadCount = vi.mocked(useUnreadCount);

function renderShell() {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [{ path: '/feed', element: <div>Feed content</div> }],
      },
    ],
    { initialEntries: ['/feed'] }
  );

  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe('AppShell', () => {
  it('renders all six nav tabs and the active route content', () => {
    mockUseUnreadCount.mockReturnValue({ data: 0 } as any);
    renderShell();

    expect(screen.getAllByText('Feed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Channels').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Marketplace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('News').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getByText('Feed content')).toBeInTheDocument();
  });

  it('shows an unread badge on the Messages tab when there are unread messages', () => {
    mockUseUnreadCount.mockReturnValue({ data: 3 } as any);
    renderShell();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('shows no badge when there are no unread messages', () => {
    mockUseUnreadCount.mockReturnValue({ data: 0 } as any);
    renderShell();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('caps the badge at "9+" for large counts', () => {
    mockUseUnreadCount.mockReturnValue({ data: 42 } as any);
    renderShell();
    expect(screen.getAllByText('9+').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/nav/AppShell.test.tsx`
Expected: FAIL — `AppShell` doesn't call `useAuth`/`useUnreadCount` yet, and no badge renders.

- [ ] **Step 3: Add the badge to AppShell**

Replace `src/components/nav/AppShell.tsx`:

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { Newspaper, MessageCircle, Store, Rss, User, Hash } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useUnreadCount } from '../../hooks/useUnreadCount';

const tabs = [
  { to: '/feed', label: 'Feed', icon: Rss },
  { to: '/channels', label: 'Channels', icon: Hash },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/profile', label: 'Profile', icon: User },
];

function NavItems({ orientation, unreadCount }: { orientation: 'horizontal' | 'vertical'; unreadCount: number }) {
  return (
    <nav
      className={
        orientation === 'horizontal'
          ? 'flex justify-around border-t bg-background'
          : 'flex flex-col gap-1 p-4'
      }
    >
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              isActive ? 'font-medium text-primary' : 'text-muted-foreground'
            } ${orientation === 'horizontal' ? 'flex-col text-xs' : ''}`
          }
        >
          <span className="relative">
            <Icon size={20} />
            {to === '/messages' && unreadCount > 0 && (
              <span className="absolute -right-2 -top-1 rounded-full bg-destructive px-1 text-[10px] leading-tight text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  useOfflineSync();
  const { session } = useAuth();
  const { data: unreadCount } = useUnreadCount(session?.user.id);

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <aside className="hidden border-r md:block md:w-56">
        <div className="p-4 text-xl font-bold">PiMesh</div>
        <NavItems orientation="vertical" unreadCount={unreadCount ?? 0} />
      </aside>
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>
      <div className="fixed bottom-0 left-0 right-0 md:hidden">
        <NavItems orientation="horizontal" unreadCount={unreadCount ?? 0} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/nav/AppShell.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 6: Manual live testing**

This plan introduces Realtime and a genuinely new RLS shape (Global Constraints) — before considering this plan done, manually verify in the browser with two logged-in accounts (or two browser profiles): start a 1:1 conversation, send a message from each side, confirm the other side receives it live without a page refresh, confirm the unread badge appears/clears correctly, and start a group with 2+ people to confirm the two-step participant insert actually succeeds against the live Supabase project (not just against mocks).

- [ ] **Step 7: Commit**

```bash
git add src/components/nav/AppShell.tsx src/components/nav/AppShell.test.tsx
git commit -m "feat: show unread message count badge on the Messages nav tab"
```

---

## Self-Review Notes

- **Spec coverage:** every in-scope item from the design doc is covered — unified 1:1/group schema, RLS, Realtime (both list and thread subscriptions), offline-first is explicitly Plan 2 (not this plan), text + photo messages, open messaging (no city-scoping), unread badges, flat group membership, "New message" + username search flow, optional group naming with client-derived fallback names. Non-goals (read receipts, typing indicators, deletion, push notifications, encryption/voice/file-sharing, group admin roles, blocking) are not implemented anywhere in this plan — confirmed by absence, not by any leftover TODO.
- **Type consistency verified:** `ConversationSummary`/`ConversationDetail`/`Message`/`ConversationParticipantProfile` (Task 3) are used identically by `useConversations`/`useConversation` (Task 4), `useMessages` (Task 5), `MessagesPage` (Task 10), `NewMessageDialog` (Task 11), and `ConversationPage` (Task 12). `useCreateConversation`'s input shape (Task 7) matches exactly what `NewMessageDialog` (Task 11) constructs. `useSendMessage`/`useMarkAsRead`'s input shapes (Task 8) match what `ConversationPage` (Task 12) constructs.
- **Hidden-consumers check applied:** `AppShell.test.tsx`'s missing `useAuth` mock (Task 13) is named explicitly upfront in this plan's Global Constraints, not left for mid-task discovery — continuing the practice that worked cleanly across Community Feed & Channels.
- **Novel-pattern verification flagged explicitly:** this plan introduces two genuinely new patterns to PiMesh — Supabase Realtime (Task 1's publication step, Tasks 4/5/9's subscriptions) and self-referential-table RLS policies with a required two-step insert (Task 1's policies, Task 7's implementation) — both called out in Global Constraints and Task 13's manual live-testing step, since mocked unit tests structurally cannot catch a missing Realtime publication or a same-statement RLS visibility failure, per the project's established "verify live, don't trust mocks" discipline (`feedback_pimesh_postgrest_embed_hints`, `feedback_pimesh_async_background_writes`).
- **No placeholders remain** — Task 10's `NewMessageDialog` stub is an explicitly-scoped, temporary, self-documented exception (needed only so Task 10 is independently testable before Task 11 exists), not a shipped placeholder; it's fully replaced within the same plan, two tasks later.

