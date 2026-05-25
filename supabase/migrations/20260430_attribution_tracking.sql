-- WED-5: Attribution tracking for wedding_selections.
--
-- Adds an `entered_by` column to wedding_selections so we can answer "did
-- the client fill this in, or did Chris enter it on their behalf?" from the
-- database, plus an append-only audit table that records every row change.
--
-- Existing rows are left with entered_by = NULL (honest = unknown). No
-- backfill guesses. Frontend writes that emit 'client' / 'admin' tags ship
-- in WED-6.
--
-- ASSUMPTIONS (verify post-hoc with information_schema; this migration is
-- additive and does NOT depend on the assumed shape — listed for awareness):
--   * wedding_selections has id (uuid), client_key (text), section_id (text),
--     spotify_url (text), song_title (text)
--   * unique constraint on (client_key, section_id) — used as the upsert
--     target by spotify-selections.html, admin.html, and netlify/functions/
--     save-selection.js (?on_conflict=client_key,section_id)
--
-- RLS POSTURE (intentional asymmetry):
--   wedding_selections        — RLS DISABLED (existing architecture; saves
--                               go through the public anon key)
--   wedding_selections_audit  — RLS ENABLED, anon SELECT denied
-- The audit table holds full row snapshots in old_data / new_data and must
-- not be readable through the anon key, even though the source table is.

-- ----------------------------------------------------------------------------
-- 1. Attribution column on the source table.
-- ----------------------------------------------------------------------------
-- NULL = unknown (existing rows + any pre-WED-6 anon write that doesn't
-- include entered_by). 'client' / 'admin' once frontend writes ship.
-- TEXT (not enum) so we can add new values later (e.g. 'system', 'import')
-- without a migration.
alter table wedding_selections
  add column if not exists entered_by text null;

comment on column wedding_selections.entered_by is
  'Who created or last modified this row. Expected values: ''client'' (client portal), ''admin'' (admin dashboard). NULL = unknown / pre-WED-6 row.';

-- ----------------------------------------------------------------------------
-- 2. Change-kind enum for audit classification.
-- ----------------------------------------------------------------------------
-- insert    — new row created
-- update    — any non-tombstone update
-- tombstone — soft-delete via upsert: spotify_url cleared on a real selection
--             (NOT on a custom-moment definition, song_title = '__custom_def__').
--             This is the pattern used by removeSection() in
--             spotify-selections.html.
-- delete    — actual SQL DELETE (e.g. clearSelection in spotify-selections.html)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wedding_selection_change_kind') then
    create type wedding_selection_change_kind as enum (
      'insert',
      'update',
      'tombstone',
      'delete'
    );
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- 3. Audit table.
-- ----------------------------------------------------------------------------
-- target_id is captured directly from NEW.id / OLD.id. target_client_key and
-- target_section_id are denormalised so the table is queryable without
-- joining/parsing JSONB. old_data and new_data hold full row snapshots so
-- we can reconstruct any prior state.
create table if not exists wedding_selections_audit (
  id                  bigserial primary key,
  target_id           uuid,
  target_client_key   text not null,
  target_section_id   text not null,
  change_kind         wedding_selection_change_kind not null,
  entered_by          text,
  old_data            jsonb,
  new_data            jsonb,
  changed_at          timestamptz not null default now()
);

comment on table wedding_selections_audit is
  'Append-only audit log of every change to wedding_selections. Populated by trigger wedding_selections_audit_trg. Anon SELECT denied via RLS — service_role bypasses RLS for backend reads.';

create index if not exists idx_audit_client_key on wedding_selections_audit (target_client_key);
create index if not exists idx_audit_changed_at on wedding_selections_audit (changed_at);

-- ----------------------------------------------------------------------------
-- 4. Audit trigger function.
-- ----------------------------------------------------------------------------
-- security definer so the trigger can write to wedding_selections_audit even
-- though anon callers can't read it directly (the trigger runs as the function
-- owner, not as anon).
create or replace function wedding_selections_audit_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change_kind  wedding_selection_change_kind;
  v_target_id    uuid;
  v_client_key   text;
  v_section_id   text;
  v_entered_by   text;
  v_old          jsonb;
  v_new          jsonb;
begin
  if TG_OP = 'INSERT' then
    v_change_kind := 'insert';
    v_target_id   := NEW.id;
    v_client_key  := NEW.client_key;
    v_section_id  := NEW.section_id;
    v_entered_by  := NEW.entered_by;
    v_old         := null;
    v_new         := to_jsonb(NEW);

  elsif TG_OP = 'UPDATE' then
    -- Tombstone detection: spotify_url just got cleared on a row that had one,
    -- and this is NOT a custom-moment definition row (song_title <> '__custom_def__').
    -- Custom-moment definitions are excluded because their lifecycle is
    -- "this moment exists" — clearing spotify_url on one is just an edit, not
    -- a soft-delete of a song selection.
    if NEW.spotify_url is null
       and OLD.spotify_url is not null
       and (NEW.song_title is null or NEW.song_title <> '__custom_def__') then
      v_change_kind := 'tombstone';
    else
      v_change_kind := 'update';
    end if;
    v_target_id   := NEW.id;
    v_client_key  := NEW.client_key;
    v_section_id  := NEW.section_id;
    v_entered_by  := NEW.entered_by;
    v_old         := to_jsonb(OLD);
    v_new         := to_jsonb(NEW);

  elsif TG_OP = 'DELETE' then
    v_change_kind := 'delete';
    v_target_id   := OLD.id;
    v_client_key  := OLD.client_key;
    v_section_id  := OLD.section_id;
    v_entered_by  := OLD.entered_by;
    v_old         := to_jsonb(OLD);
    v_new         := null;
  end if;

  insert into wedding_selections_audit (
    target_id, target_client_key, target_section_id,
    change_kind, entered_by, old_data, new_data
  ) values (
    v_target_id, v_client_key, v_section_id,
    v_change_kind, v_entered_by, v_old, v_new
  );

  -- AFTER trigger: return value is ignored, but plpgsql requires a row reference.
  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

create or replace trigger wedding_selections_audit_trg
  after insert or update or delete on wedding_selections
  for each row
  execute function wedding_selections_audit_fn();

-- ----------------------------------------------------------------------------
-- 5. RLS on the audit table only.
-- ----------------------------------------------------------------------------
-- Anon must not read this table — it contains full row snapshots that bypass
-- whatever access controls future client-side auth would impose. service_role
-- bypasses RLS entirely, so backend reads need no explicit allow-policy.
-- authenticated has no policy and therefore no access by default; add one
-- explicitly if/when admin auth gets a read view.
alter table wedding_selections_audit enable row level security;

drop policy if exists audit_no_anon on wedding_selections_audit;
create policy audit_no_anon
  on wedding_selections_audit
  for select
  to anon
  using (false);

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================
-- Run the block below in the Supabase SQL editor to fully reverse this
-- migration. Order matters: drop the trigger before the function, drop the
-- table before the type.
--
-- drop trigger  if exists wedding_selections_audit_trg on wedding_selections;
-- drop function if exists wedding_selections_audit_fn();
-- drop table    if exists wedding_selections_audit;
-- drop type     if exists wedding_selection_change_kind;
-- alter table   wedding_selections drop column if exists entered_by;
