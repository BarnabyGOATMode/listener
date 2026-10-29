-- listener: initial schema.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
--
-- Everything is publicly readable (so shared links work for signed-out visitors);
-- people can only create or change their own rows. Notifications are written by
-- triggers and readable only by their recipient.

create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  handle        citext not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  name          text not null check (char_length(name) between 1 and 60),
  bio           text not null default '' check (char_length(bio) <= 160),
  kind          text not null default 'listener' check (kind in ('listener', 'artist')),
  genre         text not null default '' check (char_length(genre) <= 40),
  location      text not null default '' check (char_length(location) <= 60),
  favorites     text[] not null default '{}' check (cardinality(favorites) <= 4),
  look          text not null default 'light' check (look in ('light', 'dark', 'system')),
  notif_seen_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- albums
-- A local catalog. MusicBrainz albums are cached here by the server the first
-- time anyone opens them; artists' own releases and listener-added albums live
-- here too.
create table public.albums (
  id            text primary key,          -- MusicBrainz release-group id, 'r-…' artist release, 'c-…' listener-added
  source        text not null check (source in ('musicbrainz', 'release', 'custom')),
  title         text not null check (char_length(title) between 1 and 300),
  artist        text not null check (char_length(artist) between 1 and 300),
  year          int check (year between 1800 and 2200),
  genre         text not null default '',
  cover_url     text,
  tracks        jsonb not null default '[]'::jsonb,   -- [{ "title": "...", "length_ms": 123000 }]
  mb_release_id text,
  owner_id      uuid references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (jsonb_typeof(tracks) = 'array'),
  check (source = 'musicbrainz' or owner_id is not null)
);
create index albums_search_idx on public.albums using gin ((title || ' ' || artist) gin_trgm_ops);
create index albums_release_idx on public.albums (created_at desc) where source = 'release';

-- ---------------------------------------------------------------- reviews
create table public.logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  album_id      text not null references public.albums (id) on delete cascade,
  rating        numeric(2,1) check (rating is null or (rating between 0.5 and 5 and rating * 2 = floor(rating * 2))),
  liked         boolean not null default false,
  review        text not null default '' check (char_length(review) <= 4000),
  listened_on   date,
  track_ratings jsonb not null default '{}'::jsonb,   -- { "0": 4.5, "3": 5 }
  use_average   boolean not null default false,
  posted_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, album_id)
);
create index logs_posted_idx on public.logs (posted_at desc);
create index logs_album_idx on public.logs (album_id);

create table public.song_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  album_id      text not null references public.albums (id) on delete cascade,
  track_index   int not null check (track_index >= 0),
  rating        numeric(2,1) check (rating is null or (rating between 0.5 and 5 and rating * 2 = floor(rating * 2))),
  liked         boolean not null default false,
  review        text not null default '' check (char_length(review) <= 4000),
  listened_on   date,
  posted_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, album_id, track_index)
);
create index song_reviews_posted_idx on public.song_reviews (posted_at desc);
create index song_reviews_album_idx on public.song_reviews (album_id, track_index);

-- ---------------------------------------------------------------- social
create table public.follows (
  follower_id   uuid not null references public.profiles (id) on delete cascade,
  followee_id   uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

-- target_type: 'log' (album review, target_id = logs.id), 'song' (song_reviews.id),
-- 'release' (albums.id of an artist release)
create table public.likes (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  target_type   text not null check (target_type in ('log', 'song', 'release')),
  target_id     text not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index likes_target_idx on public.likes (target_type, target_id);

create table public.comments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  target_type   text not null check (target_type in ('log', 'song', 'release')),
  target_id     text not null,
  body          text not null check (char_length(btrim(body)) between 1 and 500),
  created_at    timestamptz not null default now()
);
create index comments_target_idx on public.comments (target_type, target_id, created_at);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  actor_id      uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('like', 'comment', 'follow', 'rated')),
  target_type   text,
  target_id     text,
  album_id      text references public.albums (id) on delete cascade,
  track_index   int,
  comment_id    uuid references public.comments (id) on delete cascade,
  excerpt       text,
  created_at    timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- ---------------------------------------------------------------- notification triggers
-- Who owns a post, and which album/song it is about.
create function public.resolve_target(t text, tid text)
returns table (owner uuid, album_id text, track_index int)
language sql stable security definer set search_path = public as $$
  select l.user_id, l.album_id, null::int from logs l where t = 'log' and l.id::text = tid
  union all
  select s.user_id, s.album_id, s.track_index from song_reviews s where t = 'song' and s.id::text = tid
  union all
  select a.owner_id, a.id, null::int from albums a where t = 'release' and a.id = tid and a.source = 'release'
$$;

create function public.on_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    select * into r from resolve_target(new.target_type, new.target_id) limit 1;
    if r.owner is not null and r.owner <> new.user_id then
      insert into notifications (recipient_id, actor_id, kind, target_type, target_id, album_id, track_index)
      values (r.owner, new.user_id, 'like', new.target_type, new.target_id, r.album_id, r.track_index);
    end if;
    return new;
  else
    delete from notifications
     where kind = 'like' and actor_id = old.user_id and target_type = old.target_type and target_id = old.target_id;
    return old;
  end if;
end $$;
create trigger likes_notify after insert or delete on public.likes for each row execute function public.on_like();

create function public.on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from resolve_target(new.target_type, new.target_id) limit 1;
  if r.owner is not null and r.owner <> new.user_id then
    insert into notifications (recipient_id, actor_id, kind, target_type, target_id, album_id, track_index, comment_id, excerpt)
    values (r.owner, new.user_id, 'comment', new.target_type, new.target_id, r.album_id, r.track_index, new.id, left(new.body, 120));
  end if;
  return new;
end $$;
create trigger comments_notify after insert on public.comments for each row execute function public.on_comment();

create function public.on_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (recipient_id, actor_id, kind) values (new.followee_id, new.follower_id, 'follow');
    return new;
  else
    delete from notifications where kind = 'follow' and actor_id = old.follower_id and recipient_id = old.followee_id;
    return old;
  end if;
end $$;
create trigger follows_notify after insert or delete on public.follows for each row execute function public.on_follow();

-- An artist hears when someone logs one of their releases.
create function public.on_release_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare artist uuid;
begin
  select owner_id into artist from albums where id = new.album_id and source = 'release';
  if artist is not null and artist <> new.user_id then
    insert into notifications (recipient_id, actor_id, kind, target_type, target_id, album_id)
    values (artist, new.user_id, 'rated', 'log', new.id::text, new.album_id);
  end if;
  return new;
end $$;
create trigger logs_release_notify after insert on public.logs for each row execute function public.on_release_log();

-- ---------------------------------------------------------------- access rules
alter table public.profiles      enable row level security;
alter table public.albums        enable row level security;
alter table public.logs          enable row level security;
alter table public.song_reviews  enable row level security;
alter table public.follows       enable row level security;
alter table public.likes         enable row level security;
alter table public.comments      enable row level security;
alter table public.notifications enable row level security;

create policy "profiles are public"      on public.profiles for select using (true);
create policy "create own profile"       on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "edit own profile"         on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "albums are public"        on public.albums for select using (true);
-- MusicBrainz rows are written only by the server (service role, which bypasses these rules).
create policy "add own release or album" on public.albums for insert to authenticated
  with check (owner_id = auth.uid() and source in ('release', 'custom'));
create policy "edit own release"         on public.albums for update to authenticated
  using (owner_id = auth.uid() and source = 'release') with check (owner_id = auth.uid() and source = 'release');
create policy "delete own release"       on public.albums for delete to authenticated
  using (owner_id = auth.uid() and source = 'release');

create policy "logs are public"          on public.logs for select using (true);
create policy "write own logs"           on public.logs for insert to authenticated with check (user_id = auth.uid());
create policy "edit own logs"            on public.logs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own logs"          on public.logs for delete to authenticated using (user_id = auth.uid());

create policy "song reviews are public"  on public.song_reviews for select using (true);
create policy "write own song reviews"   on public.song_reviews for insert to authenticated with check (user_id = auth.uid());
create policy "edit own song reviews"    on public.song_reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own song reviews"  on public.song_reviews for delete to authenticated using (user_id = auth.uid());

create policy "follows are public"       on public.follows for select using (true);
create policy "follow as yourself"       on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy "unfollow as yourself"     on public.follows for delete to authenticated using (follower_id = auth.uid());

create policy "likes are public"         on public.likes for select using (true);
create policy "like as yourself"         on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "unlike as yourself"       on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "comments are public"      on public.comments for select using (true);
create policy "comment as yourself"      on public.comments for insert to authenticated with check (user_id = auth.uid());
-- You can delete your own comments, and comments left on your posts.
create policy "delete own or on own post" on public.comments for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.resolve_target(target_type, target_id) r where r.owner = auth.uid()));

create policy "read own notifications"   on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy "clear own notifications"  on public.notifications for delete to authenticated using (recipient_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.albums, public.logs, public.song_reviews, public.follows, public.likes, public.comments to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.albums, public.logs, public.song_reviews to authenticated;
grant insert, delete on public.follows, public.likes, public.comments to authenticated;
grant select, delete on public.notifications to authenticated;
