-- listener: one-to-one messages.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
--
-- Only the two people in a conversation can see it. Mutual followers land in each other's Chats;
-- anyone else lands in Requests until accepted. Blocking stops new conversations and messages both ways.

create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  pair_key             text not null unique,          -- "<smaller id>:<larger id>", so each pair has one conversation
  created_at           timestamptz not null default now(),
  last_message_at      timestamptz,
  last_message_preview text
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'active' check (status in ('active', 'request', 'ignored')),
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  body             text not null default '' check (char_length(body) <= 2000),
  attachment_type  text check (attachment_type in ('album', 'song')),
  attachment_id    text,
  attachment_index int,
  created_at       timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or attachment_type is not null)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------- helpers
create function public.is_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = conv and user_id = auth.uid())
$$;

create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

/** Opens (or creates) the conversation between you and someone else, and returns its id. */
create function public.start_conversation(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); key text; conv uuid; mutual boolean;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if other is null or other = me then raise exception 'Choose someone else to message'; end if;
  if not exists (select 1 from profiles where id = other) then raise exception 'That account doesn''t exist'; end if;
  if is_blocked_between(me, other) then raise exception 'You can''t message this account'; end if;
  key := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into conv from conversations where pair_key = key;
  if conv is null then
    insert into conversations (pair_key) values (key) returning id into conv;
    mutual := exists (select 1 from follows where follower_id = me and followee_id = other)
          and exists (select 1 from follows where follower_id = other and followee_id = me);
    insert into conversation_members (conversation_id, user_id, status) values
      (conv, me, 'active'),
      (conv, other, case when mutual then 'active' else 'request' end);
  end if;
  return conv;
end $$;

/** Your conversations, newest first, with the other person, the latest message and your unread count. */
create function public.my_inbox()
returns table (conversation_id uuid, other_id uuid, last_message_at timestamptz, last_message_preview text,
               my_status text, my_last_read timestamptz, other_last_read timestamptz, unread int)
language sql stable set search_path = public as $$
  select c.id, o.user_id, c.last_message_at, c.last_message_preview, m.status, m.last_read_at, o.last_read_at,
         (select count(*)::int from messages x where x.conversation_id = c.id and x.sender_id <> auth.uid() and x.created_at > m.last_read_at)
    from conversations c
    join conversation_members m on m.conversation_id = c.id and m.user_id = auth.uid()
    join conversation_members o on o.conversation_id = c.id and o.user_id <> auth.uid()
   order by c.last_message_at desc nulls last, c.created_at desc
$$;

-- Keep each conversation's latest-message summary up to date, and count your own message as read.
create function public.on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations
     set last_message_at = new.created_at,
         last_message_preview = case when char_length(btrim(new.body)) > 0 then left(new.body, 140)
                                     when new.attachment_type = 'song' then 'Sent a song'
                                     else 'Sent an album' end
   where id = new.conversation_id;
  update conversation_members set last_read_at = new.created_at where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end $$;
create trigger messages_summary after insert on public.messages for each row execute function public.on_message();

-- ---------------------------------------------------------------- access rules
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.blocks               enable row level security;

create policy "see your conversations"      on public.conversations for select to authenticated using (is_member(id));
create policy "see who is in your chats"    on public.conversation_members for select to authenticated using (is_member(conversation_id));
create policy "update your own membership"  on public.conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read your messages"          on public.messages for select to authenticated using (is_member(conversation_id));
create policy "send in your chats"          on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid() and is_member(conversation_id)
    and not exists (select 1 from conversation_members o where o.conversation_id = messages.conversation_id and o.user_id <> auth.uid() and is_blocked_between(auth.uid(), o.user_id))
  );
create policy "unsend your own messages"    on public.messages for delete to authenticated using (sender_id = auth.uid());
create policy "see who you blocked"         on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "block"                       on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "unblock"                     on public.blocks for delete to authenticated using (blocker_id = auth.uid());

grant select on public.conversations, public.conversation_members, public.messages, public.blocks to authenticated;
grant update (status, last_read_at) on public.conversation_members to authenticated;
grant insert, delete on public.messages, public.blocks to authenticated;
grant execute on function public.start_conversation(uuid), public.my_inbox() to authenticated;
revoke execute on function public.start_conversation(uuid), public.my_inbox() from anon;

-- Live delivery: Supabase Realtime sends new messages and read receipts to the people allowed to see them.
alter publication supabase_realtime add table public.messages, public.conversation_members;
