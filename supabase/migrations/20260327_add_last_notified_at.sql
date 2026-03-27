alter table if exists public.clients
  add column if not exists last_notified_at timestamptz;
