create table if not exists public.spotify_tokens (
  id           uuid primary key default gen_random_uuid(),
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);
