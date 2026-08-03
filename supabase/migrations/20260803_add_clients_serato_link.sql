-- Per-client link to the Serato Setup handoff folder (Dropbox).
-- The package itself is assembled locally from Chris's Serato library and audio
-- files, so the site cannot generate it — it only stores where it lives.
alter table if exists public.clients
  add column if not exists serato_link text;
