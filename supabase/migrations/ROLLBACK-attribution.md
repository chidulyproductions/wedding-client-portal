# Rollback runbook — attribution tracking (WED-5 / WED-6)

If attribution tracking needs to be unwound (production issue, design change,
etc.), follow these steps in order. Code rollback first, DB rollback second.
Skip the WED-6 step if Branch B never shipped.

## Pre-rollback sanity check

Confirm the rollback tag still exists:

```bash
git fetch --tags
git tag --list rollback-pre-attribution
```

The tag is anchored at the `redesign/client-portal` HEAD that existed
immediately before WED-5 work began (commit `6f4698e` — "refactor(client-portal):
rename section_ids to match brochure labels (WED-4)").

## Step 1 — Revert the frontend (only if WED-6 has shipped)

```bash
git checkout redesign/client-portal
git pull
# Find the WED-6 merge commit:
git log --oneline --merges --grep='WED-6'
git revert -m 1 <WED-6-merge-sha>
git push origin redesign/client-portal
```

This stops the portal from sending `entered_by` in upsert payloads. PostgREST
will silently drop the field if it's still in the request, but reverting the
code is cleaner than relying on that.

## Step 2 — Revert the migration commit (Branch A)

```bash
git checkout redesign/client-portal
git pull
# Find the WED-5 merge commit:
git log --oneline --merges --grep='WED-5'
git revert -m 1 <WED-5-merge-sha>
git push origin redesign/client-portal
```

Reverting the merge commit removes the migration file from the repo so future
re-deploys won't re-apply it.

## Step 3 — Run the down-migration in Supabase

Open the Supabase SQL editor and run the block below verbatim. Order matters:
trigger before function, table before type.

```sql
drop trigger  if exists wedding_selections_audit_trg on wedding_selections;
drop function if exists wedding_selections_audit_fn();
drop table    if exists wedding_selections_audit;
drop type     if exists wedding_selection_change_kind;
alter table   wedding_selections drop column if exists entered_by;
```

The same block is also embedded as a commented-out section at the bottom of
`20260430_attribution_tracking.sql` for convenience.

## Step 4 — Verify the rollback

In the Supabase SQL editor:

```sql
-- Should match the pre-attribution column list (no entered_by row).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'wedding_selections'
order by ordinal_position;

-- Should return zero rows.
select to_regclass('public.wedding_selections_audit') as audit_table;

-- Should return zero rows.
select 1 from pg_type where typname = 'wedding_selection_change_kind';

-- Should return zero rows.
select 1 from pg_proc where proname = 'wedding_selections_audit_fn';
```

If any of these return data after the down-migration, something is partially
applied — re-run the relevant DROP statement.

## Step 5 — Hard reset (last resort)

If the working tree has diverged so badly that revert isn't viable:

```bash
git checkout redesign/client-portal
git reset --hard rollback-pre-attribution
git push --force-with-lease origin redesign/client-portal
```

`--force-with-lease` is safer than `--force`; it refuses to push if someone
else has pushed to `redesign/client-portal` since you last fetched. Don't
use plain `--force` here.

## Notes

- The down-migration is idempotent (`drop ... if exists`). Running it twice
  is safe.
- Existing data in `wedding_selections` is unaffected by either direction —
  the up-migration only adds a nullable column, the down-migration only drops
  it. Row content is preserved.
- The audit table is dropped wholesale on rollback. Any audit history
  collected between WED-5 landing and the rollback is lost. Export it first
  if you want to keep it:

  ```sql
  copy (select * from wedding_selections_audit order by changed_at)
  to '/tmp/wedding_selections_audit_export.csv' with csv header;
  ```
