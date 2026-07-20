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
