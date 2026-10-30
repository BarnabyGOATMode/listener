-- listener: lists, Listen later, and the numbers behind charts.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
--
-- Lists are public, ranked or unranked collections of albums ("Best of 2025", "Rainy day records").
-- Listen later is a private-feeling queue that is still public, like a Letterboxd watchlist; an album leaves
-- it automatically once you log it. Lists can be liked and commented on like any review.

-- ---------------------------------------------------------------- lists
create table public.lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  ranked      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index lists_user_idx on public.lists (user_id, updated_at desc);
create index lists_updated_idx on public.lists (updated_at desc);

create table public.list_items (
  list_id    uuid not null references public.lists (id) on delete cascade,
  album_id   text not null references public.albums (id) on delete cascade,
  position   int not null default 0,
  note       text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  primary key (list_id, album_id)
);
create index list_items_album_idx on public.list_items (album_id);

-- Touching a list's items bumps the list, so "recently updated" means what it says.
create function public.touch_list() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update lists set updated_at = now() where id = coalesce(new.list_id, old.list_id);
  return coalesce(new, old);
end $$;
create trigger list_items_touch after insert or update or delete on public.list_items for each row execute function public.touch_list();

-- ---------------------------------------------------------------- listen later
create table public.listen_later (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  album_id   text not null references public.albums (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, album_id)
);
create index listen_later_user_idx on public.listen_later (user_id, created_at desc);

create function public.on_log_clear_later() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from listen_later where user_id = new.user_id and album_id = new.album_id;
  return new;
end $$;
create trigger logs_clear_later after insert on public.logs for each row execute function public.on_log_clear_later();

-- ---------------------------------------------------------------- likes and comments on lists
alter table public.likes drop constraint if exists likes_target_type_check;
alter table public.likes add constraint likes_target_type_check check (target_type in ('log', 'song', 'release', 'list'));
alter table public.comments drop constraint if exists comments_target_type_check;
alter table public.comments add constraint comments_target_type_check check (target_type in ('log', 'song', 'release', 'list'));

create or replace function public.resolve_target(t text, tid text)
returns table (owner uuid, album_id text, track_index int)
language sql stable security definer set search_path = public as $$
  select l.user_id, l.album_id, null::int from logs l where t = 'log' and l.id::text = tid
  union all
  select s.user_id, s.album_id, s.track_index from song_reviews s where t = 'song' and s.id::text = tid
  union all
  select a.owner_id, a.id, null::int from albums a where t = 'release' and a.id = tid and a.source = 'release'
  union all
  select li.user_id, null::text, null::int from lists li where t = 'list' and li.id::text = tid
$$;

-- ---------------------------------------------------------------- charts
-- Albums ranked by a weighted average, so one 5-star rating can't top the chart: every album starts with a few
-- "phantom" ratings at the site-wide average, and real ratings pull it away from there.
create function public.chart_albums(
  year_from int default null, year_to int default null, genre_like text default null,
  since timestamptz default null, min_ratings int default 1, max_rows int default 100
) returns table (album_id text, ratings int, logs int, avg_rating numeric, score numeric)
language sql stable set search_path = public as $$
  with pool as (
    select l.album_id, l.rating from logs l
      join albums a on a.id = l.album_id
     where (since is null or l.posted_at >= since)
       and (year_from is null or a.year >= year_from)
       and (year_to is null or a.year <= year_to)
       and (genre_like is null or a.genre ilike '%' || genre_like || '%')
  ),
  m as (select coalesce(avg(rating), 3.5) as mean from logs where rating is not null),
  g as (
    select album_id, count(rating)::int as ratings, count(*)::int as logs, avg(rating) as avg_rating, sum(rating) as total
      from pool group by album_id
  )
  select g.album_id, g.ratings, g.logs, round(g.avg_rating, 2), round((g.total + 3 * m.mean) / (g.ratings + 3), 3)
    from g, m
   where g.ratings >= greatest(min_ratings, 1)
   order by 5 desc, g.ratings desc
   limit least(greatest(max_rows, 1), 250)
$$;

-- Songs ranked the same way, mixing song reviews with the per-song stars people give inside album reviews.
create function public.chart_songs(since timestamptz default null, min_ratings int default 1, max_rows int default 50)
returns table (album_id text, track_index int, ratings int, avg_rating numeric, score numeric)
language sql stable set search_path = public as $$
  with pool as (
    select s.album_id, s.track_index, s.rating, s.user_id from song_reviews s
     where s.rating is not null and (since is null or s.posted_at >= since)
    union all
    select l.album_id, t.key::int, t.value::numeric, l.user_id from logs l, jsonb_each_text(l.track_ratings) t
     where (since is null or l.posted_at >= since) and t.key ~ '^\d+$' and t.value ~ '^[0-9.]+$'
       and not exists (select 1 from song_reviews s where s.user_id = l.user_id and s.album_id = l.album_id and s.track_index = t.key::int and s.rating is not null)
  ),
  m as (select coalesce(avg(rating), 3.5) as mean from pool),
  g as (select album_id, track_index, count(*)::int as ratings, avg(rating) as avg_rating, sum(rating) as total from pool group by 1, 2)
  select g.album_id, g.track_index, g.ratings, round(g.avg_rating, 2), round((g.total + 3 * m.mean) / (g.ratings + 3), 3)
    from g, m
   where g.ratings >= greatest(min_ratings, 1)
   order by 5 desc, g.ratings desc
   limit least(greatest(max_rows, 1), 250)
$$;

-- ---------------------------------------------------------------- access rules
alter table public.lists        enable row level security;
alter table public.list_items   enable row level security;
alter table public.listen_later enable row level security;

create policy "lists are public"        on public.lists for select using (true);
create policy "make own lists"          on public.lists for insert to authenticated with check (user_id = auth.uid());
create policy "edit own lists"          on public.lists for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own lists"        on public.lists for delete to authenticated using (user_id = auth.uid());

create policy "list items are public"   on public.list_items for select using (true);
create policy "fill own lists"          on public.list_items for insert to authenticated
  with check (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "reorder own lists"       on public.list_items for update to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "empty own lists"         on public.list_items for delete to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));

create policy "listen later is public"  on public.listen_later for select using (true);
create policy "queue for yourself"      on public.listen_later for insert to authenticated with check (user_id = auth.uid());
create policy "unqueue for yourself"    on public.listen_later for delete to authenticated using (user_id = auth.uid());

grant select on public.lists, public.list_items, public.listen_later to anon, authenticated;
grant insert, update, delete on public.lists, public.list_items to authenticated;
grant insert, delete on public.listen_later to authenticated;
grant execute on function public.chart_albums(int, int, text, timestamptz, int, int) to anon, authenticated;
grant execute on function public.chart_songs(timestamptz, int, int) to anon, authenticated;
