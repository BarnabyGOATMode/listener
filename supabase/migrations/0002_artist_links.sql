-- listener: link albums to their artist's MusicBrainz page.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
alter table public.albums add column if not exists artist_mbid text;
create index if not exists albums_artist_idx on public.albums (artist_mbid);
