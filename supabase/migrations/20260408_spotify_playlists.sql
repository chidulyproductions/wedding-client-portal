-- Stores Spotify playlist IDs per client moment, written by spotify-export
-- Allows the admin dashboard to show direct Spotify links per client

create table if not exists public.spotify_playlists (
  client_key    text        not null,
  section_id    text        not null,
  playlist_id   text        not null,
  playlist_name text        not null,
  playlist_url  text        not null,
  updated_at    timestamptz not null default now(),
  primary key (client_key, section_id)
);

alter table public.spotify_playlists enable row level security;

-- Authenticated users (admin) can read all playlist records
create policy "Authenticated users can read spotify_playlists"
  on public.spotify_playlists for select
  to authenticated
  using (true);
