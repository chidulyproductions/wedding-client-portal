-- WED-8: Hardening of WED-5 attribution-tracking work.
--
-- Addresses 4 findings from /codex review on 2026-04-30 (Claude /review caught
-- only 1 of the 4; cross-model coverage paid off):
--
--   1. entered_by was caller-controlled. Anon clients could send
--      entered_by='admin' in their upsert and have it recorded as fact, since
--      wedding_selections has RLS disabled and the column had no constraint.
--      Fix: BEFORE trigger derives entered_by from auth.role() — anon→'client',
--      authenticated→'admin', service_role→'system'. Caller-supplied values are
--      now ignored on rows written through PostgREST.
--
--   2. Audit insert had no exception handling. Any audit-path failure aborted
--      the client save. Fix: wrap insert in begin/exception/end matching the
--      pattern in notify_dj_on_selection_change.
--
--   3. Tombstone classifier checked NEW.song_title instead of OLD.song_title.
--      If the same UPDATE cleared both spotify_url and song_title, the
--      __custom_def__ marker was gone before classification → mislabeled as
--      tombstone. Fix: check OLD.
--
--   4. wedding_selections_audit.changed_at defaulted to now() (transaction-
--      start time), so concurrent writes could produce out-of-order timestamps.
--      Fix: clock_timestamp() (statement-time).
--
-- All changes are forward-only: CREATE OR REPLACE on functions/triggers, ALTER
-- on column default. No DROP, no data loss. Safe to re-run.
--
-- The original 20260430_attribution_tracking.sql is left untouched as a
-- historical record of what was first applied. Fresh deploys run both files
-- in order and end up at the corrected state.

-- ----------------------------------------------------------------------------
-- 1. BEFORE trigger: derive entered_by from auth.role()
-- ----------------------------------------------------------------------------
-- Runs before INSERT and UPDATE on wedding_selections. Overrides whatever
-- entered_by the caller supplied based on the JWT role of the current session.
-- This is the security fix: anon callers can no longer spoof entered_by='admin'
-- because the trigger forces 'client' for the anon role regardless of input.
--
-- security definer is fine here — auth.role() reads request.jwt.claims from
-- session GUCs (set per-session by PostgREST/GoTrue), not from the executing
-- role. The definer's privileges only matter for what the function CAN do, not
-- for what auth.role() returns.
--
-- The override is intentionally one-way: there's no way for the caller to opt
-- out and supply their own entered_by via this path. Direct postgres
-- connections (auth.role() returns NULL or empty) fall through to the caller-
-- supplied value, which is fine because that path requires DB credentials.
create or replace function wedding_selections_set_entered_by_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(auth.role(), '');
  if v_role = 'authenticated' then
    NEW.entered_by := 'admin';
  elsif v_role = 'anon' then
    NEW.entered_by := 'client';
  elsif v_role = 'service_role' then
    NEW.entered_by := 'system';
  end if;
  -- else: direct psql / unknown role — leave caller-supplied value as-is.
  return NEW;
end;
$$;

create or replace trigger wedding_selections_set_entered_by_trg
  before insert or update on wedding_selections
  for each row
  execute function wedding_selections_set_entered_by_fn();

-- ----------------------------------------------------------------------------
-- 2-3. Replace audit trigger function with hardened version
-- ----------------------------------------------------------------------------
-- Changes from the version in 20260430_attribution_tracking.sql:
--   * Tombstone check uses OLD.song_title (was NEW.song_title) — looks up the
--     row's PRIOR identity to decide whether it was a custom-def, not the
--     post-update state. Same UPDATE clearing both song_title and spotify_url
--     no longer mislabels.
--   * Audit insert wrapped in begin/exception/end so audit-path failures never
--     block client saves. Pattern matches notify_dj_on_selection_change.
--   * No auth.role() handling here — the BEFORE trigger above already set
--     NEW.entered_by correctly by the time this AFTER trigger fires.
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
    -- Tombstone: a real selection had its spotify_url cleared. Check OLD for
    -- the __custom_def__ marker — the same UPDATE may have cleared song_title
    -- too, which would erase the marker before NEW-side classification could
    -- see it.
    if NEW.spotify_url is null
       and OLD.spotify_url is not null
       and (OLD.song_title is null or OLD.song_title <> '__custom_def__') then
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

  -- Audit gaps are acceptable; portal downtime is not. Wrap so any audit-path
  -- failure (constraint violation, lock timeout, storage pressure, schema
  -- drift) becomes a WARNING in the postgres log, not a failed client save.
  begin
    insert into wedding_selections_audit (
      target_id, target_client_key, target_section_id,
      change_kind, entered_by, old_data, new_data
    ) values (
      v_target_id, v_client_key, v_section_id,
      v_change_kind, v_entered_by, v_old, v_new
    );
  exception when others then
    raise warning 'wedding_selections_audit_fn: audit insert failed: %', sqlerrm;
  end;

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. changed_at default → clock_timestamp()
-- ----------------------------------------------------------------------------
-- now() returns transaction-start time, so two concurrent transactions writing
-- to the same row can produce identical or out-of-order audit timestamps even
-- when commit order was different. clock_timestamp() returns wall-clock at
-- the moment the default is evaluated, giving correct per-row ordering.
alter table wedding_selections_audit
  alter column changed_at set default clock_timestamp();

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================
-- Run the block below in the Supabase SQL editor to revert this hardening
-- back to WED-5's original behavior. The original audit function body is
-- documented in 20260430_attribution_tracking.sql — re-create from there.
--
-- drop trigger  if exists wedding_selections_set_entered_by_trg on wedding_selections;
-- drop function if exists wedding_selections_set_entered_by_fn();
-- alter table   wedding_selections_audit alter column changed_at set default now();
-- -- Then re-apply the original wedding_selections_audit_fn from
-- -- 20260430_attribution_tracking.sql (NEW.song_title check, no exception block).
