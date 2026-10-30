-- listener: instant updates for "Live on listener".
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
--
-- Supabase Realtime tells open pages the moment something public happens (a sign-up, a review, a like, a comment,
-- a follow, a list, a release), so the live column updates straight away instead of waiting for its next check.
-- Everything here is already publicly readable; Realtime still applies the same access rules.

do $$
declare t text;
begin
  foreach t in array array['profiles', 'logs', 'song_reviews', 'likes', 'comments', 'follows', 'lists', 'list_items', 'albums'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
