alter table if exists public.clients
  add column if not exists deleted_at timestamptz;

create index if not exists clients_deleted_at_idx
  on public.clients (deleted_at);
