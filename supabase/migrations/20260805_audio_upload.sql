-- Custom audio upload: clients (and Chris) attach an audio file to a wedding
-- moment. The file is the thing played at the wedding; any spotify_url on the
-- same row is deliberately left untouched so the exported Spotify playlist
-- keeps the original unedited version as a backup.
alter table wedding_selections add column if not exists audio_url text;

comment on column wedding_selections.audio_url is
  'Public URL of an uploaded audio file in the client-audio bucket. Independent of spotify_url: a row may have either, both, or neither.';

-- Public-read bucket. Object names are random UUIDs, so the URL is public but
-- not guessable. Limits are set on the bucket so they are enforced server-side,
-- not merely checked in the page.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-audio',
  'client-audio',
  true,
  26214400,  -- 25 MB
  array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac',
        'audio/wav','audio/x-wav','audio/flac','audio/ogg','audio/webm']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anonymous access, consistent with the existing trust model: RLS is already
-- off on wedding_selections and the anon key ships in the page. Scoped to this
-- one bucket so no other bucket inherits it.
drop policy if exists "client-audio anon read"   on storage.objects;
drop policy if exists "client-audio anon insert" on storage.objects;
drop policy if exists "client-audio anon delete" on storage.objects;

create policy "client-audio anon read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'client-audio');

create policy "client-audio anon insert"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'client-audio');

create policy "client-audio anon delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'client-audio');
