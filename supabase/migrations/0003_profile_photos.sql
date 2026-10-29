-- listener: profile photos.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.

alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500);

-- A public bucket for profile photos. Each person can only write inside a folder named after their own user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "profile photos are public" on storage.objects for select using (bucket_id = 'avatars');
create policy "upload your own photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace your own photo" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete your own photo" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
